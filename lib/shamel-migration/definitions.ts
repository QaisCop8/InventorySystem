import sql from "@/lib/database"
import { ensureCustomerAccount, resolveAccountType, resolveRequiredParentAccount } from "@/app/api/customers/_lib"
import { StepContext, date, insertRow, mapGet, mapOne, mapSet, num, text, toCode10, updateRow } from "@/lib/shamel-migration/core"

// معالجات «التعريفات»: كل دالة تستقبل دفعة أسطر كما قرأها معالج الترحيل من الشامل (أسماء الأعمدة = الأسماء
// المستعارة بـ SQL الخطوة في steps.ts) وتُنشئ/تربط السجل المقابل هنا. سجل موجود بنفس الرقم/الاسم يُربط ولا يُكرَّر.

type Row = Record<string, unknown>

async function eachRow(rows: Row[], ctx: StepContext, ref: (row: Row) => unknown, fn: (row: Row) => Promise<"created" | "updated" | "skipped">) {
  for (const row of rows) {
    ctx.stats.received++
    try {
      ctx.stats[await fn(row)]++
    } catch (error) {
      ctx.error(ref(row), error instanceof Error ? error.message : String(error))
    }
  }
}

// ---------- القوائم المساعدة (multifl) ----------
// 59 المدن، 74 تصنيفات العملاء، 81 فئات الأسعار، 93 أنواع مراكز التكلفة (43 اسمها الإنجليزي)

export async function processLookups(rows: Row[], ctx: StepContext) {
  const byType = new Map<number, Map<number, string>>()
  for (const row of rows) {
    const typefile = num(row.typefile)
    if (!byType.has(typefile)) byType.set(typefile, new Map())
    byType.get(typefile)!.set(num(row.pos), text(row.names))
  }

  await eachRow([...(byType.get(59) || new Map())].map(([pos, name]) => ({ pos, name })), ctx, (r) => `مدينة ${r.pos}`, async (r) => {
    const name = text(r.name)
    if (!name || name === "بلا") return "skipped"
    const existing = (await sql`SELECT id FROM cities WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
    const id = existing ? Number(existing.id) : Number((await sql`INSERT INTO cities (name) VALUES (${name}) RETURNING id`)[0].id)
    await mapSet("city", String(r.pos), id)
    return existing ? "updated" : "created"
  })

  await eachRow([...(byType.get(74) || new Map())].map(([pos, name]) => ({ pos, name })), ctx, (r) => `تصنيف ${r.pos}`, async (r) => {
    const name = text(r.name)
    if (!name) return "skipped"
    const existing = (await sql`SELECT id FROM customer_categories WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
    const id = existing ? Number(existing.id) : Number((await sql`INSERT INTO customer_categories (name) VALUES (${name}) RETURNING id`)[0].id)
    await mapSet("customer_class", String(r.pos), id)
    return existing ? "updated" : "created"
  })

  // فئات الأسعار: سعر البيع 1..6 بالشامل ⇐ فئة بنفس الاسم، وإلا الفئة بنفس الترتيب، وإلا فئة جديدة باسم الشامل
  const existingCategories = (await sql`SELECT id, name FROM pricecategory ORDER BY id`) as any[]
  const priceNames = byType.get(81) || new Map()
  for (let pos = 0; pos < 6; pos++) {
    const name = text(priceNames.get(pos)) || `فئة ${pos + 1}`
    const byName = existingCategories.find((category) => text(category.name) === name)
    const target = byName || existingCategories[pos]
    // الفئات الإضافية تُنشأ عند الحاجة فقط (صنف له سعر بها) — انظر priceCategoryFor
    if (target) await mapSet("price_class", String(pos), Number(target.id))
    else if (text(priceNames.get(pos))) priceClassNames.set(pos, name)
  }
  ctx.info(`فئات الأسعار: ${[...priceNames.values()].filter(Boolean).join("، ") || "—"}`)

  // أنواع مراكز التكلفة: الاسم العربي (93) وإلا الإنجليزي (43) وإلا «مركز تكلفة n»
  const typeNames = byType.get(93) || new Map()
  const typeNamesEn = byType.get(43) || new Map()
  for (let pos = 0; pos < 6; pos++) {
    const name = text(typeNames.get(pos)) || text(typeNamesEn.get(pos))
    if (!name) continue
    const existing = (await sql`SELECT id FROM cost_center_types WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
    const id = existing ? Number(existing.id) : Number((await sql`INSERT INTO cost_center_types (name) VALUES (${name}) RETURNING id`)[0].id)
    await mapSet("costcenter_type", String(pos), id)
  }
}

// أسماء فئات الأسعار بالشامل التي لا تقابلها فئة هنا — تُستخدم عند إنشائها (نفس العملية فقط؛ وإلا «فئة n»)
const priceClassNames = new Map<number, string>()

/** فئة السعر n (0..5) — تُنشأ عند أول صنف له سعر بها إن لم تكن مربوطة */
async function priceCategoryFor(pos: number): Promise<number | null> {
  const mapped = await mapOne("price_class", String(pos))
  if (mapped) return mapped
  const name = priceClassNames.get(pos) || `فئة ${pos + 1}`
  const existing = (await sql`SELECT id FROM pricecategory WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
  const id = existing ? Number(existing.id) : Number((await sql`INSERT INTO pricecategory (name) VALUES (${name}) RETURNING id`)[0].id)
  await mapSet("price_class", String(pos), id)
  return id
}

// ---------- العملات وأسعار الصرف ----------

const CURRENCY_ALIASES: string[][] = [
  ["ILS", "NIS", "شيكل", "شيقل"],
  ["JOD", "JD", "دينار"],
  ["USD", "$", "دولار"],
  ["EUR", "يورو"],
  ["EGP", "جنيه مصري"],
  ["SAR", "ريال سعودي"],
  ["AED", "درهم"],
]

export async function processCurrencies(rows: Row[], ctx: StepContext) {
  const ours = (await sql`SELECT id, currency_code, currency_name FROM currency`) as any[]
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const code = text(r.code).toUpperCase()
    const name = text(r.name)
    if (!code) return "skipped"
    const aliases = CURRENCY_ALIASES.find((group) => group.some((alias) => alias === code || (alias.length > 3 && name.includes(alias)))) || [code]
    const match = ours.find((currency) => aliases.includes(text(currency.currency_code).toUpperCase()))
      || ours.find((currency) => text(currency.currency_name) === name)
    const units = num(r.units)
    const digits = units >= 1000 ? 3 : units >= 100 ? 2 : units > 1 ? 1 : null
    if (match) {
      await sql`UPDATE currency SET sub_currency_name = COALESCE(NULLIF(sub_currency_name, ''), ${text(r.unit_name) || null}), fraction_digits = COALESCE(fraction_digits, ${digits}) WHERE id = ${match.id}`
        .catch(() => undefined) // أعمدة العملة الإضافية تُنشأ من شاشة العملات — قاعدة قديمة بلاها لا توقف الترحيل
      await mapSet("currency", code, Number(match.id))
      return "updated"
    }
    const newId = Number((await sql`SELECT COALESCE(MAX(id), 0) + 1 AS id FROM currency`)[0].id)
    const isoCode = aliases[0].length === 3 && /^[A-Z]{3}$/.test(aliases[0]) ? aliases[0] : code.slice(0, 10)
    await sql`INSERT INTO currency (id, currency_code, currency_name, is_active) VALUES (${newId}, ${isoCode}, ${name || isoCode}, true)`
    ours.push({ id: newId, currency_code: isoCode, currency_name: name })
    await mapSet("currency", code, newId)
    return "created"
  })
}

export async function currencyId(code: unknown): Promise<number | null> {
  const key = text(code).toUpperCase()
  return key ? mapOne("currency", key) : null
}

export async function processRates(rows: Row[], ctx: StepContext) {
  const baseId = Number((await sql`SELECT id FROM currency ORDER BY id LIMIT 1`)[0]?.id || 1)
  const ids = await mapGet("currency", rows.map((r) => text(r.currency_code).toUpperCase()))
  await eachRow(rows, ctx, (r) => `${text(r.currency_code)} ${text(r.rate_date)}`, async (r) => {
    const id = ids.get(text(r.currency_code).toUpperCase())
    const day = date(r.rate_date)
    const rate = num(r.rate)
    if (!id || id === baseId || !day || !(rate > 0)) return "skipped"
    const existing = await sql`SELECT 1 FROM exchange_rates WHERE currency_id = ${id} AND rate_date = ${day} LIMIT 1`
    if (existing.length) return "skipped"
    await insertRow("exchange_rates", { currency_id: id, buy_rate: num(r.purchase_rate) || rate, sell_rate: num(r.sale_rate) || rate, exchange_rate: rate, rate_date: day, is_active: true })
    return "created"
  })
}

// ---------- المستودعات ومراكز التكلفة ----------

export async function processStores(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => `مستودع ${r.pos}`, async (r) => {
    const pos = num(r.pos)
    const name = text(r.name) || text(r.name_lang2) || `مستودع ${pos + 1}`
    const mapped = await mapOne("store", String(pos))
    if (mapped) return "skipped"
    const existing = (await sql`SELECT id FROM warehouses WHERE TRIM(warehouse_name) = ${name} LIMIT 1`)[0] as any
    if (existing) { await mapSet("store", String(pos), Number(existing.id)); return "updated" }
    let code = String(pos + 1)
    if ((await sql`SELECT 1 FROM warehouses WHERE warehouse_code = ${code}`).length) code = `SH${pos + 1}`
    const id = await insertRow("warehouses", { warehouse_code: code, warehouse_name: name, warehouse_name_en: text(r.name_lang2) || null, is_active: true, status: 1 })
    await mapSet("store", String(pos), id)
    return "created"
  })
}

export async function processCostCenters(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const typePos = num(r.costcenter_type)
    const key = `${typePos}-${text(r.code)}`
    if (await mapOne("costcenter", key)) return "skipped"
    let typeId = await mapOne("costcenter_type", String(typePos))
    if (!typeId) {
      const name = `مركز تكلفة ${typePos + 1}`
      const existing = (await sql`SELECT id FROM cost_center_types WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
      typeId = existing ? Number(existing.id) : Number((await sql`INSERT INTO cost_center_types (name) VALUES (${name}) RETURNING id`)[0].id)
      await mapSet("costcenter_type", String(typePos), typeId)
    }
    const parentId = text(r.father_code) ? await mapOne("costcenter", `${typePos}-${text(r.father_code)}`) : null
    const level = parentId ? Number((await sql`SELECT level FROM cost_centers WHERE id = ${parentId}`)[0]?.level || 0) + 1 : 1
    const name = text(r.name) || text(r.code)
    const id = await insertRow("cost_centers", { name, cost_type_id: typeId, parent_id: parentId, level, status: num(r.stoped) ? 2 : 1 })
    await mapSet("costcenter", key, id)
    return "created"
  })
}

// ---------- دليل الحسابات ----------

const FINANCIAL_LIST: Record<number, number> = { 0: 2, 1: 1, 2: 3 } // الشامل: 0 دخل، 1 ميزانية، 2 تقييم البضاعة

/** حد الرصيد/الدين: الشامل يضع 2147483647 (أكبر عدد صحيح) لـ«بلا حد» ⇐ 0 هنا */
const limitAmount = (value: unknown) => {
  const amount = num(value)
  return amount > 0 && amount < 2_000_000_000 ? amount : 0
}

async function companyIdTemplate() {
  return Number((await sql`SELECT company_id FROM account_tbl ORDER BY id LIMIT 1`)[0]?.company_id || 1)
}

/** رقم حساب بطول 10 غير مستخدم لحساب آخر من الشامل (تحويل رقمين مختلفين لنفس الرقم ⇐ يبقى الرقم الأصلي) */
async function accountCodeFor(shamelCode: string) {
  const converted = toCode10(shamelCode)
  const owner = (await sql`SELECT shamel_key FROM shamel_migration_map m JOIN account_tbl a ON a.id = m.web_id WHERE m.kind = 'account' AND a.code = ${converted} LIMIT 1`)[0] as any
  return owner && text(owner.shamel_key) !== shamelCode ? text(shamelCode).toUpperCase() : converted
}

export async function processAccounts(rows: Row[], ctx: StepContext) {
  const companyId = await companyIdTemplate()
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode) return "skipped"
    if (await mapOne("account", shamelCode)) return "skipped"
    const code = await accountCodeFor(shamelCode)
    const existing = (await sql`SELECT id FROM account_tbl WHERE code = ${code} LIMIT 1`)[0] as any
    if (existing) { await mapSet("account", shamelCode, Number(existing.id)); return "updated" }
    const fatherId = text(r.father_code) ? await mapOne("account", text(r.father_code)) : null
    if (text(r.father_code) && !fatherId) ctx.warn(shamelCode, `الحساب الأب ${text(r.father_code)} غير موجود — أُضيف كحساب رئيسي`)
    const father = fatherId ? ((await sql`SELECT level_no, finanical_list_id, finanical_list_assests_id, finanical_list_liabilities_id, finanical_list_income_id FROM account_tbl WHERE id = ${fatherId}`)[0] as any) : null
    const listId = FINANCIAL_LIST[num(r.finanical_list_id)] ?? 1
    const curr = await currencyId(r.currency_code)
    const name = text(r.name) || shamelCode
    const created = await insertRow("account_tbl", {
      company_id: companyId, code, type: 1, name, name_lang2: text(r.name_lang2) || null, father_id: fatherId,
      level_no: father ? Number(father.level_no) + 1 : 1, finanical_list_id: father ? Number(father.finanical_list_id) || listId : listId,
      finanical_list_assests_id: father?.finanical_list_assests_id ?? null, finanical_list_liabilities_id: father?.finanical_list_liabilities_id ?? null,
      finanical_list_income_id: father?.finanical_list_income_id ?? null, currency_id: curr,
      allow_trans_with_diff_curr: num(r.allow_trans_with_diff_curr) ? 1 : 0, iscalc_curr_diff_rates: text(r.iscalc_curr_diff_rates_str) === "true",
      transaction_type: 0, transaction_type_action: 0, max_transaction_amount: 0, max_transaction_amount_action: 0,
      max_balance_amount: limitAmount(r.max_balance_amount), notes: `مُرحَّل من الشامل (${shamelCode})`, show_notes_in_transactions_soa: false,
      status: 1, insert_date: date(r.insert_date) || new Date().toISOString().slice(0, 10), last_update_date: new Date(),
    })
    await mapSet("account", shamelCode, created)
    return "created"
  })
}

export async function accountId(shamelCode: unknown): Promise<number | null> {
  const key = text(shamelCode)
  return key ? mapOne("account", key) : null
}

// ---------- المندوبون ----------

export async function processSalesmen(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode) return "skipped"
    if (await mapOne("salesman", shamelCode)) return "skipped"
    const code = /^\d+$/.test(shamelCode) ? `M${shamelCode.padStart(9, "0")}` : toCode10(shamelCode)
    const name = text(r.name) || code
    const existing = (await sql`SELECT id FROM salesmen WHERE code = ${code} OR TRIM(name) = ${name} LIMIT 1`)[0] as any
    if (existing) { await mapSet("salesman", shamelCode, Number(existing.id)); return "updated" }
    const id = await insertRow("salesmen", {
      code, name, other_name: text(r.name_lang2) || null, job_title: text(r.job) || null, address: text(r.address) || null, mobile: text(r.phone) || null,
      sales_commission_percent: num(r.commission1), collection_commission_percent: num(r.commission2),
      notes: [text(r.note1), text(r.note2)].filter(Boolean).join(" ") || null, is_active: true,
    })
    await mapSet("salesman", shamelCode, id)
    return "created"
  })
}

// ---------- العملاء/الموردون/المندوبون/المشتركون/الموظفون ----------

const CUSTOMER_TYPE: Record<number, number> = { 4: 1, 8: 2, 64: 3, 16: 4 } // Attr بالشامل ⇐ customers.type
const EMPLOYEE_ATTR = 524288

export async function processCustomers(rows: Row[], ctx: StepContext) {
  const salesmanNames = new Map<number, string>(((await sql`SELECT id, name FROM salesmen`) as any[]).map((row) => [Number(row.id), text(row.name)]))
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode) return "skipped"
    const attr = num(r.type_pos)
    const isEmployee = attr === EMPLOYEE_ATTR
    const type = CUSTOMER_TYPE[attr] || 1
    const code = await accountCodeFor(shamelCode)
    const name = text(r.name) || text(r.account_name) || shamelCode

    let accountIdValue = await mapOne("account", shamelCode)
    let fatherId = text(r.father_code) ? await mapOne("account", text(r.father_code)) : null
    let levelNo = fatherId ? Number((await sql`SELECT level_no FROM account_tbl WHERE id = ${fatherId}`)[0]?.level_no || 0) + 1 : 1
    if (!fatherId && !isEmployee) {
      try {
        const parent = await resolveRequiredParentAccount(type, null)
        fatherId = parent.fatherId
        levelNo = parent.levelNo
      } catch {
        ctx.warn(shamelCode, "لا يوجد حساب أب بالشامل ولا حساب أب افتراضي بالإعدادات — أُضيف كحساب رئيسي")
      }
    }
    if (!accountIdValue) {
      accountIdValue = await ensureCustomerAccount({
        code, name, fatherId, levelNo,
        currencyId: (await currencyId(r.currency_code)) || 1,
        allowTransWithDiffCurr: num(r.allow_trans_with_diff_curr) ? 1 : 0,
        isCalcCurrDiffRates: num(r.iscalc_curr_diff_rates_asint) === 1,
        accountType: isEmployee ? 1 : resolveAccountType(type),
        creditLimit: limitAmount(r.debt_max_amount) || null,
      })
      await updateRow("account_tbl", accountIdValue, { name_lang2: text(r.name_lang2) || null, notes: `مُرحَّل من الشامل (${shamelCode})` })
      await mapSet("account", shamelCode, accountIdValue)
    }
    if (isEmployee) return "created" // الموظف: حسابه فقط (بيانات الموظفين تُعرَّف من الموارد البشرية)

    const existing = (await sql`SELECT id FROM customers WHERE customer_code = ${code} OR account_id = ${accountIdValue} LIMIT 1`)[0] as any
    if (existing) { await mapSet("customer", shamelCode, Number(existing.id)); return "updated" }

    const cityPos = num(r.city_pos)
    const cityId = cityPos > 0 ? await mapOne("city", String(cityPos)) : null
    const cityName = cityId ? text((await sql`SELECT name FROM cities WHERE id = ${cityId}`)[0]?.name) : null
    const salesmanId = text(r.salesman_code) ? await mapOne("salesman", text(r.salesman_code)) : null
    const priceCategory = (await mapOne("price_class", String(num(r.priceclass_pos)))) || 1
    const phones = [text(r.phone), text(r.phone2), text(r.phone3)].filter(Boolean)
    const id = await insertRow("customers", {
      customer_code: code, name, customer_name_en: text(r.name_lang2) || null, mobile1: phones[0] || null, mobile2: phones[1] || null,
      city: cityName, city_id: cityId, address: text(r.address) || null, status: num(r.stopped) ? "موقوف" : "نشط", business_nature: text(r.business_description) || null,
      salesman: salesmanId ? salesmanNames.get(salesmanId) || null : null, general_notes: text(r.displayed_note) || null,
      registration_date: date(r.entry_date_) || new Date().toISOString().slice(0, 10), type, isdeleted: false, pricecategory: priceCategory,
      account_id: accountIdValue, tax_number: text(r.vat_registration_no).slice(0, 50) || null, id_number: text(r.id_no) || null,
    })
    await mapSet("customer", shamelCode, id)
    return "created"
  })
}

// ---------- البنوك وفروعها والحسابات البنكية ----------

export async function processBanks(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode || (await mapOne("bank", shamelCode))) return "skipped"
    const code = /^\d{1,3}$/.test(shamelCode) ? shamelCode.padStart(4, "0") : shamelCode.slice(0, 4)
    const name = text(r.name) || shamelCode
    const existing = (await sql`SELECT id FROM banks WHERE bank_code = ${code} OR TRIM(bank_name) = ${name} LIMIT 1`)[0] as any
    if (existing) { await mapSet("bank", shamelCode, Number(existing.id)); return "updated" }
    const id = await insertRow("banks", { bank_code: code, bank_name: name, bank_name_en: text(r.name_lang2) || null, status: 1 })
    await mapSet("bank", shamelCode, id)
    return "created"
  })
}

export async function processBankBranches(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.branch_code, async (r) => {
    const shamelCode = text(r.branch_code) // br."Code" = رقم البنك + رقم الفرع
    if (!shamelCode || (await mapOne("bank_branch", shamelCode))) return "skipped"
    const bankId = await mapOne("bank", text(r.bank_code))
    if (!bankId) throw new Error(`البنك ${text(r.bank_code)} غير موجود`)
    const name = text(r.name) || shamelCode
    const existing = (await sql`SELECT id FROM branches WHERE bank_id = ${bankId} AND TRIM(branch_name) = ${name} LIMIT 1`)[0] as any
    if (existing) { await mapSet("bank_branch", shamelCode, Number(existing.id)); return "updated" }
    let code = shamelCode
    if ((await sql`SELECT 1 FROM branches WHERE branch_code = ${code}`).length) code = `${shamelCode}B`
    const id = await insertRow("branches", {
      branch_code: code, branch_name: name, address: text(r.address) || null, manager: text(r.manager_name) || null, phone: text(r.phone) || null,
      is_active: true, bank_id: bankId, status: num(r.is_stopped) ? 2 : 1, is_bank_branch: true,
    })
    await mapSet("bank_branch", shamelCode, id)
    return "created"
  })
}

export async function processBankAccounts(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode || (await mapOne("bank_account", shamelCode))) return "skipped"
    const existing = (await sql`SELECT id FROM bank_accounts WHERE code = ${shamelCode} LIMIT 1`)[0] as any
    if (existing) { await mapSet("bank_account", shamelCode, Number(existing.id)); return "updated" }
    const branchId = await mapOne("bank_branch", text(r.branche_code))
    if (!branchId) ctx.warn(shamelCode, `فرع البنك ${text(r.branche_code)} غير موجود`)
    const id = await insertRow("bank_accounts", {
      branch_id: branchId, code: shamelCode, actual_bank_code: text(r.actual_bank_code) || null, currency_id: await currencyId(r.currency_code),
      name: text(r.name) || shamelCode, name_lang2: text(r.name_lang2) || null,
      jary_account_id: await accountId(r.jary_account_code), tahsil_account_id: await accountId(r.tahsil_account_code),
      tahsil_commission_account_id: await accountId(r.tahsil_commission_account_code), payed_checks_account_id: await accountId(r.payed_checks_account_code),
      returned_checks_commission: num(r.returned_checks_commission), tahsil_checks_commission: num(r.tahsil_checks_commission),
      returned_checks_commission_currency_id: await currencyId(r.returned_checks_commission_currency_code),
      tahsil_checks_commission_currency_id: await currencyId(r.tahsil_checks_commission_currency_code),
      notes: text(r.notes) || null, status: num(r.is_stopped) ? 2 : 1, iban: text(r.iban).replace(/\s+/g, "").toUpperCase() || null,
    })
    await mapSet("bank_account", shamelCode, id)
    return "created"
  })
}

// ---------- مجموعات الأصناف والأصناف ----------

export async function processItemGroups(rows: Row[], ctx: StepContext) {
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode || (await mapOne("item_group", shamelCode))) return "skipped"
    const name = text(r.name) || shamelCode
    const parentId = text(r.father_code) ? await mapOne("item_group", text(r.father_code)) : null
    const existing = (await sql`SELECT id FROM item_groups WHERE group_code = ${shamelCode} LIMIT 1`)[0] as any
    if (existing) { await mapSet("item_group", shamelCode, Number(existing.id)); return "updated" }
    const id = await insertRow("item_groups", { group_code: shamelCode, group_name: name, parent_group_id: parentId, parent_id: parentId, is_active: true, status: 1 })
    await mapSet("item_group", shamelCode, id)
    return "created"
  })
}

const unitCache = new Map<string, number>()
async function unitIdByName(name: string) {
  const key = name.trim()
  if (unitCache.has(key)) return unitCache.get(key)!
  const existing = (await sql`SELECT id FROM units WHERE TRIM(unit_name) = ${key} LIMIT 1`)[0] as any
  const id = existing ? Number(existing.id) : await insertRow("units", { unit_name: key, is_active: true, status: 1 })
  unitCache.set(key, id)
  return id
}

async function productCodeFor(shamelCode: string) {
  const converted = toCode10(shamelCode, "start")
  const owner = (await sql`SELECT m.shamel_key FROM shamel_migration_map m JOIN products p ON p.id = m.web_id WHERE m.kind = 'item' AND p.product_code = ${converted} LIMIT 1`)[0] as any
  return owner && text(owner.shamel_key) !== shamelCode ? shamelCode.toUpperCase().replace(/[^A-Z0-9]/g, "") : converted
}

export async function processItems(rows: Row[], ctx: StepContext) {
  unitCache.clear()
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode || (await mapOne("item", shamelCode))) return "skipped"
    const code = await productCodeFor(shamelCode)
    const existing = (await sql`SELECT id FROM products WHERE product_code = ${code} LIMIT 1`)[0] as any
    if (existing) { await mapSet("item", shamelCode, Number(existing.id)); return "updated" }

    const itemType = num(r.item_type)
    const isService = itemType === 6
    const name = (text(r.name) || shamelCode).slice(0, 100)
    const groupId = text(r.mainstock_code) ? await mapOne("item_group", text(r.mainstock_code)) : null
    const vat = num(r.vat_rate)
    const productId = await insertRow("products", {
      product_code: code, product_name: name, product_name_en: text(r.name_lang2) || null,
      description: [text(r.note1), text(r.note2)].filter(Boolean).join(" ") || null, main_stock_id: groupId,
      brand: text(r.trademark1) || null, model: text(r.trademark2) || null, factory_number: text(r.oem) || null, original_number: text(r.part_no) || null,
      last_purchase_price: num(r.last_purchase_price) || num(r.market_purchase_price), currency_id: await currencyId(r.cost_purchase_currency_code),
      tax_rate: vat, discount_rate: num(r.discount_rate), has_expiry_date: num(r.has_expiry_) !== 0, serial_tracking: num(r.has_serial_) !== 0,
      status: num(r.item_availability_status_pos) === 2 ? 2 : 1, type: isService ? 2 : 1, service_type: isService ? num(r.service_type) + 1 : 0,
      product_type: String(itemType < 6 ? itemType + 1 : 1),
      length: num(r.length), width: num(r.width), height: num(r.height), density: num(r.density), notes: `مُرحَّل من الشامل (${shamelCode})`, barcode: text(r.barcode) || null,
      selling_account_id: await accountId(r.selling_account_code), purchase_account_id: await accountId(r.purchase_account_code),
      selling_returns_account_id: await accountId(r.selling_returns_account_code), purchase_returns_account_id: await accountId(r.purchase_returns_account_code),
      stock_end_account_id: await accountId(r.stock_end_account_code), stock_start_account_id: await accountId(r.stock_start_account_code),
      production_account_id: await accountId(r.production_account_code), last_purchase_date: date(r.last_purchase_price_date),
    })

    // الوحدات 1..6: الوحدة الأولى أساسية (1)، وCountN = عدد الوحدات الأساسية في الوحدة N
    const units: { pos: number; unitId: number; productUnitId: number }[] = []
    for (let pos = 1; pos <= 6; pos++) {
      const unitName = text(r[`unit${pos}_name`])
      if (!unitName && pos > 1) continue
      const unitId = await unitIdByName(unitName || "قطعة")
      if (units.some((unit) => unit.unitId === unitId)) continue
      const factor = pos === 1 ? 1 : num(r[`unit${pos}_relation`]) || 1
      const first = units.length === 0
      const existingUnit = (await sql`SELECT id FROM product_units WHERE product_id = ${productId} AND unit_id = ${unitId} LIMIT 1`)[0] as any
      const productUnitId = existingUnit ? Number(existingUnit.id) : await insertRow("product_units", {
        product_id: productId, unit_id: unitId, to_main_qnty: factor, is_stock_count_unit: first, is_purchase_unit: first, is_report_unit: first,
      })
      units.push({ pos, unitId, productUnitId })
      await mapSet("item_unit", `${shamelCode}|${pos - 1}`, unitId)
    }
    const barcode = text(r.barcode)
    if (barcode && units[0]) await sql`INSERT INTO product_unit_barcodes (product_id, unit_id, barcode) VALUES (${productId}, ${units[0].productUnitId}, ${barcode}) ON CONFLICT DO NOTHING`

    // أسعار البيع 1..6 للوحدة الأساسية بفئة السعر المقابلة، وسعر الوحدات الأخرى (UPriceN) بفئة السعر الأولى
    for (let pos = 1; pos <= 6 && units[0]; pos++) {
      const price = num(r[`sales_price${pos}`])
      if (!(price > 0)) continue
      const categoryId = await priceCategoryFor(pos - 1)
      if (!categoryId) continue
      await sql`
        INSERT INTO product_prices (product_id, price_category_id, unit_id, price, currency_id)
        SELECT ${productId}, ${categoryId}, ${units[0].unitId}, ${price}, ${(await currencyId(r[`sales_price${pos}_curr_code`])) || 1}
        WHERE NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = ${productId} AND price_category_id = ${categoryId} AND unit_id = ${units[0].unitId})`
    }
    const firstCategory = await priceCategoryFor(0)
    for (const unit of units.slice(1)) {
      const price = num(r[`unit${unit.pos}_price`])
      if (!(price > 0) || !firstCategory) continue
      await sql`
        INSERT INTO product_prices (product_id, price_category_id, unit_id, price, currency_id)
        SELECT ${productId}, ${firstCategory}, ${unit.unitId}, ${price}, ${(await currencyId(r[`unit${unit.pos}_curr`])) || 1}
        WHERE NOT EXISTS (SELECT 1 FROM product_prices WHERE product_id = ${productId} AND price_category_id = ${firstCategory} AND unit_id = ${unit.unitId})`
    }
    await mapSet("item", shamelCode, productId)
    return "created"
  })
}

/** جدول units بالشامل: باركودات إضافية لكل وحدة (num = ترتيب الوحدة 0..5) */
export async function processItemBarcodes(rows: Row[], ctx: StepContext) {
  const items = await mapGet("item", rows.map((r) => text(r.code)))
  await eachRow(rows, ctx, (r) => `${text(r.code)} ${text(r.barcode)}`, async (r) => {
    const productId = items.get(text(r.code))
    const barcode = text(r.barcode)
    if (!productId || !barcode) return "skipped"
    const unitId = (await mapOne("item_unit", `${text(r.code)}|${num(r.pos)}`)) || (await mapOne("item_unit", `${text(r.code)}|0`))
    const productUnit = unitId ? ((await sql`SELECT id FROM product_units WHERE product_id = ${productId} AND unit_id = ${unitId} LIMIT 1`)[0] as any) : null
    if (!productUnit) return "skipped"
    const taken = await sql`SELECT 1 FROM product_unit_barcodes WHERE TRIM(barcode) = ${barcode} LIMIT 1`
    if (taken.length) return "skipped"
    await sql`INSERT INTO product_unit_barcodes (product_id, unit_id, barcode) VALUES (${productId}, ${Number(productUnit.id)}, ${barcode}) ON CONFLICT DO NOTHING`
    return "created"
  })
}
