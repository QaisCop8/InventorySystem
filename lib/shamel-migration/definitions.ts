import { ensureBranchCodeIndexes } from "@/lib/branch-codes"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { ensureUsersCurrenciesDefaultTable } from "@/lib/users-currencies-default"
import { ensureCustomerAccount, resolveAccountType, resolveRequiredParentAccount } from "@/app/api/customers/_lib"
import { StepContext, date, fitCode, insertRow, mapGet, mapOne, mapSet, num, text, toCode10, updateRow } from "@/lib/shamel-migration/core"

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
  // فئة الشامل الأولى = فئة النظام رقم 1 (الافتراضية في بحث الأصناف والشاشات: priceCategoryId=1) — وإلا تُرحَّل
  // الأسعار لفئة جديدة فيظهر السعر صفراً (2026-11-17)
  if (pos === 0) {
    const id = await ensurePrimaryPriceCategory(name)
    await mapSet("price_class", "0", id)
    return id
  }
  const existing = (await sql`SELECT id FROM pricecategory WHERE TRIM(name) = ${name} LIMIT 1`)[0] as any
  const id = existing ? Number(existing.id) : Number((await sql`INSERT INTO pricecategory (name) VALUES (${name}) RETURNING id`)[0].id)
  await mapSet("price_class", String(pos), id)
  return id
}

/** فئة السعر رقم 1: تُعاد تسميتها باسم فئة الشامل الأولى، أو تُنشأ برقم 1 إن حذفها تصفير القوائم. */
async function ensurePrimaryPriceCategory(name: string): Promise<number> {
  const [primary] = await sql`SELECT id FROM pricecategory WHERE id = 1` as any[]
  if (primary) {
    await sql`UPDATE pricecategory SET name = ${name}, status = 1 WHERE id = 1`
  } else {
    await sql`INSERT INTO pricecategory (id, name, status) VALUES (1, ${name}, 1)`
    await sql`SELECT setval(pg_get_serial_sequence('pricecategory', 'id'), GREATEST((SELECT MAX(id) FROM pricecategory), 1))`.catch(() => undefined)
  }
  return 1
}

/**
 * ترحيل سابق وضع أسعار فئة الشامل الأولى في فئة غير رقم 1 (بحث الأصناف يعرض الفئة 1 ⇐ السعر صفر). تُنقل أسعارها
 * للفئة 1 (ما لم يوجد سعر لنفس الصنف/الوحدة) وتُحدَّث الخريطة — مرة واحدة (علامة repair:price_class_primary_v1).
 */
export async function repairPrimaryPriceClass() {
  const done = await sql`SELECT 1 FROM shamel_migration_map WHERE kind = 'repair' AND shamel_key = 'price_class_primary_v1' LIMIT 1`
  if (done.length) return
  const mapped = await mapOne("price_class", "0")
  if (mapped && mapped !== 1) {
    const [old] = await sql`SELECT name FROM pricecategory WHERE id = ${mapped}` as any[]
    await ensurePrimaryPriceCategory(String(old?.name || "فئة 1"))
    await sql`
      UPDATE product_prices p SET price_category_id = 1
      WHERE p.price_category_id = ${mapped}
        AND NOT EXISTS (SELECT 1 FROM product_prices q WHERE q.product_id = p.product_id AND q.unit_id IS NOT DISTINCT FROM p.unit_id AND q.price_category_id = 1)`
    await mapSet("price_class", "0", 1)
  }
  await sql`INSERT INTO shamel_migration_map (kind, shamel_key, web_id) VALUES ('repair', 'price_class_primary_v1', 0) ON CONFLICT DO NOTHING`
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
    // الشامل يترك سعر البيع/الشراء 1 (أو 0) حين لا يُستخدم ⇐ نأخذ سعر الصرف بدلاً منه (2026-11-21)
    const side = (value: unknown) => { const n = num(value); return n > 0 && !(n === 1 && rate !== 1) ? n : rate }
    const buyRate = side(r.purchase_rate)
    const sellRate = side(r.sale_rate)
    const existing = await sql`SELECT 1 FROM exchange_rates WHERE currency_id = ${id} AND rate_date = ${day} LIMIT 1`
    if (existing.length) {
      // إصلاح ما رُحّل سابقاً بسعر 1
      const fixed = await sql`
        UPDATE exchange_rates SET
          sell_rate = CASE WHEN COALESCE(sell_rate, 0) IN (0, 1) AND exchange_rate <> 1 THEN ${sellRate} ELSE sell_rate END,
          buy_rate = CASE WHEN COALESCE(buy_rate, 0) IN (0, 1) AND exchange_rate <> 1 THEN ${buyRate} ELSE buy_rate END
        WHERE currency_id = ${id} AND rate_date = ${day} AND exchange_rate <> 1
          AND (COALESCE(sell_rate, 0) IN (0, 1) OR COALESCE(buy_rate, 0) IN (0, 1))
        RETURNING 1`
      return fixed.length ? "updated" : "skipped"
    }
    await insertRow("exchange_rates", { currency_id: id, buy_rate: buyRate, sell_rate: sellRate, exchange_rate: rate, rate_date: day, is_active: true })
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
    if ((await sql`SELECT 1 FROM warehouses WHERE warehouse_code = ${code}`).length) code = await fitCode("warehouses", "warehouse_code", `SH${pos + 1}`, String(pos + 1))
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

/**
 * نوع الصنف: ترتيب الشامل (stock.Type) يختلف عن النظام — الشامل 0 مواد خام، 1 لوازم انتاج، 2 تحت التصنيع، 3 بضاعة مصنعة،
 * 4 بضاعة تجارية، 5 مواد للاستهلاك (ShamelAPI main_stock_type_captions)؛ النظام 1 بضاعة تجارية، 2 مواد خام، 3 لوازم إنتاج،
 * 4 تحت التصنيع، 5 بضاعة مصنعة، 6 مواد للاستهلاك. كان يُرحَّل Type+1 فتصبح «بضاعة تجارية» «بضاعة مصنعة» (2026-11-17).
 */
export const SHAMEL_ITEM_TYPE: Record<number, number> = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 1, 5: 6 }

/** رقم حساب بطول 10 غير مستخدم لحساب آخر من الشامل (تحويل رقمين مختلفين لنفس الرقم ⇐ يبقى الرقم الأصلي) */
async function accountCodeFor(shamelCode: string) {
  const converted = toCode10(shamelCode)
  const owner = (await sql`SELECT shamel_key FROM shamel_migration_map m JOIN account_tbl a ON a.id = m.web_id WHERE m.kind = 'account' AND a.code = ${converted} LIMIT 1`)[0] as any
  return fitCode("account_tbl", "code", owner && text(owner.shamel_key) !== shamelCode ? text(shamelCode).toUpperCase() : converted, shamelCode)
}

// ---------- بنود القوائم المالية ----------
const FINANCIAL_ITEM_TABLES: Record<number, { table: string; kind: string }> = {
  57: { table: "balance_sheet_assets_items", kind: "fi_asset" },
  66: { table: "balance_sheet_liabilities_items", kind: "fi_liab" },
  58: { table: "income_statement_items", kind: "fi_income" },
}
export async function ensureFinancialItemTables() {
  for (const { table } of Object.values(FINANCIAL_ITEM_TABLES)) {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${table} (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, status INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }
}
export async function processFinancialItems(rows: Row[], ctx: StepContext) {
  await ensureFinancialItemTables()
  await eachRow(rows, ctx, (r) => `${num(r.typefile)}-${num(r.pos)}`, async (r) => {
    const target = FINANCIAL_ITEM_TABLES[num(r.typefile)]
    const name = text(r.names).slice(0, 100)
    if (!target || !name) return "skipped"
    const key = String(num(r.pos))
    if (await mapOne(target.kind, key)) return "skipped"
    const existing = ((await sql.unsafe(`SELECT id FROM ${target.table} WHERE TRIM(name) = $1 AND COALESCE(status, 1) <> 3 ORDER BY id LIMIT 1`, [name])) as any[])[0]
    const id = existing ? Number(existing.id) : await insertRow(target.table, { name, status: 1 })
    await mapSet(target.kind, key, id)
    return existing ? "updated" : "created"
  })
}

/**
 * تصنيف الحساب بالقوائم المالية من الشامل (نفس MigrateAccountsF): finlist 0 دخل ⇐ 2، 1 ميزانية ⇐ 1، 2 تقييم بضاعة ⇐ 3.
 * ميزانية: asset بند الأصول وLiab بند الخصوم (99 = لا شيء) — الجانب بإشارة الرصيد؛ دخل: asset بند الدخل؛ تقييم بضاعة: asset بند أصول + Liab بند دخل.
 */
async function accountClassification(r: Row) {
  const listId = FINANCIAL_LIST[num(r.finanical_list_id)] ?? 1
  const assetPos = num(r.asset_pos), liabPos = num(r.liab_pos)
  const item = async (kind: string, pos: number) => (pos >= 0 && pos !== 99 ? mapOne(kind, String(pos)) : null)
  if (listId === 1) {
    // الشامل: الحساب المدين يظهر ببند الأصول والدائن ببند الخصوم (99 = لا يظهر بذلك الجانب) — يُحفظ البندان ويحدد التقرير الجانب بإشارة الرصيد
    return { finanical_list_id: 1, finanical_list_assests_id: await item("fi_asset", assetPos), finanical_list_liabilities_id: await item("fi_liab", liabPos), finanical_list_income_id: null }
  }
  if (listId === 2) return { finanical_list_id: 2, finanical_list_assests_id: null, finanical_list_liabilities_id: null, finanical_list_income_id: await item("fi_income", assetPos) }
  return { finanical_list_id: 3, finanical_list_assests_id: await item("fi_asset", assetPos), finanical_list_liabilities_id: null, finanical_list_income_id: await item("fi_income", liabPos) }
}

export async function processAccounts(rows: Row[], ctx: StepContext) {
  const companyId = await companyIdTemplate()
  await eachRow(rows, ctx, (r) => r.code, async (r) => {
    const shamelCode = text(r.code)
    if (!shamelCode) return "skipped"
    const mapped = await mapOne("account", shamelCode)
    if (mapped) {
      // إعادة الترحيل: القائمة المالية وبنود الأصول/الخصوم/قائمة الدخل تُحدَّث دائماً من الشامل (حساب بلا بند يرث من أبيه بالتقرير)
      await updateRow("account_tbl", mapped, await accountClassification(r))
      return "updated"
    }
    const code = await accountCodeFor(shamelCode)
    const existing = (await sql`SELECT id FROM account_tbl WHERE code = ${code} LIMIT 1`)[0] as any
    if (existing) { await mapSet("account", shamelCode, Number(existing.id)); return "updated" }
    const fatherId = text(r.father_code) ? await mapOne("account", text(r.father_code)) : null
    if (text(r.father_code) && !fatherId) ctx.warn(shamelCode, `الحساب الأب ${text(r.father_code)} غير موجود — أُضيف كحساب رئيسي`)
    const father = fatherId ? ((await sql`SELECT level_no, finanical_list_id, finanical_list_assests_id, finanical_list_liabilities_id, finanical_list_income_id FROM account_tbl WHERE id = ${fatherId}`)[0] as any) : null
    const own = await accountClassification(r)
    const hasOwn = Boolean(own.finanical_list_assests_id || own.finanical_list_liabilities_id || own.finanical_list_income_id)
    const curr = await currencyId(r.currency_code)
    const name = text(r.name) || shamelCode
    const created = await insertRow("account_tbl", {
      company_id: companyId, code, type: 1, name, name_lang2: text(r.name_lang2) || null, father_id: fatherId,
      // تصنيف الحساب من الشامل نفسه، وإلا يُرث من الأب
      level_no: father ? Number(father.level_no) + 1 : 1,
      ...(hasOwn || !father ? own : {
        finanical_list_id: Number(father.finanical_list_id) || own.finanical_list_id,
        finanical_list_assests_id: father.finanical_list_assests_id ?? null, finanical_list_liabilities_id: father.finanical_list_liabilities_id ?? null,
        finanical_list_income_id: father.finanical_list_income_id ?? null,
      }),
      currency_id: curr,
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
    const code = await fitCode("salesmen", "code", /^\d+$/.test(shamelCode) ? `M${shamelCode.padStart(9, "0")}` : toCode10(shamelCode), shamelCode)
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
// نوع حساب الموظف (كـ ShamelAPI: type 6 «حساب موظف») — يظهر بتقارير الذمم (كشف/أرصدة/تعمير) مع العملاء والموردين
const EMPLOYEE_ACCOUNT_TYPE = 6

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
        accountType: isEmployee ? EMPLOYEE_ACCOUNT_TYPE : resolveAccountType(type),
        creditLimit: limitAmount(r.debt_max_amount) || null,
      })
      await updateRow("account_tbl", accountIdValue, { name_lang2: text(r.name_lang2) || null, notes: `مُرحَّل من الشامل (${shamelCode})` })
      await mapSet("account", shamelCode, accountIdValue)
    }
    // القائمة المالية وبنود الميزانية/الدخل من حساب الشامل (عند الإنشاء وإعادة الترحيل) — صف بلا حساب بالشامل يبقى كما هو
    if (r.finanical_list_id != null && text(r.finanical_list_id) !== "") await updateRow("account_tbl", accountIdValue, await accountClassification(r))
    // إعادة الترحيل تصحّح نوع حسابات موظفين رُحّلت سابقاً كحساب محاسبي (1)
    if (isEmployee) await sql`UPDATE account_tbl SET type = ${EMPLOYEE_ACCOUNT_TYPE} WHERE id = ${accountIdValue} AND COALESCE(type, 1) = 1`
    if (isEmployee) return migrateEmployee(r, shamelCode, code, name, accountIdValue, fatherId)

    const existing = (await sql`SELECT id FROM customers WHERE customer_code = ${code} OR account_id = ${accountIdValue} LIMIT 1`)[0] as any
    if (existing) { await mapSet("customer", shamelCode, Number(existing.id)); return "updated" }

    const cityPos = num(r.city_pos)
    const cityId = cityPos > 0 ? await mapOne("city", String(cityPos)) : null
    const cityName = cityId ? text((await sql`SELECT name FROM cities WHERE id = ${cityId}`)[0]?.name) : null
    const salesmanId = text(r.salesman_code) ? await mapOne("salesman", text(r.salesman_code)) : null
    const priceCategory = (await mapOne("price_class", String(num(r.priceclass_pos)))) || 1
    const phones = [text(r.phone), text(r.phone2), text(r.phone3)].filter(Boolean)
    const id = await insertRow("customers", {
      customer_code: await fitCode("customers", "customer_code", code, shamelCode), name, customer_name_en: text(r.name_lang2) || null, mobile1: phones[0] || null, mobile2: phones[1] || null,
      city: cityName, city_id: cityId, address: text(r.address) || null, status: num(r.stopped) ? "موقوف" : "نشط", business_nature: text(r.business_description) || null,
      salesman: salesmanId ? salesmanNames.get(salesmanId) || null : null, general_notes: text(r.displayed_note) || null,
      registration_date: date(r.entry_date_) || new Date().toISOString().slice(0, 10), type, isdeleted: false, pricecategory: priceCategory,
      account_id: accountIdValue, tax_number: text(r.vat_registration_no).slice(0, 50) || null, id_number: text(r.id_no) || null,
    })
    await mapSet("customer", shamelCode, id)
    return "created"
  })
}

// ---------- الموظفون (Attr 524288) ----------
// كما في ShamelAPI (MigrateCustomersF): حساب الشامل يصبح حساب صرف راتب الموظف، وتُملأ بيانات شاشة الموظفين
// الإلزامية بقيم افتراضية حين لا يوجد ما يقابلها بالشامل: قسم/وظيفة/قانون ضريبة/بند «الراتب الأساسي» (أول موجود أو يُنشأ)،
// عملة الحساب أو الأساس، راتب شهري، عقد دائم، ذكر، أعزب، خاضع للضريبة. الراتب = «Membership» (قيمة الاشتراك) بالشامل.
// الموقوف بالشامل ⇐ منتهي الخدمة (status 2).
type EmployeeDefaults = { departmentId: number; jobId: number; taxLawId: number; salaryItemId: number; baseCurrencyId: number }
// لكل قاعدة (تعدد الشركات) ولدقيقتين — تُحسب مرة لكل دفعة لا لكل موظف، ولا تبقى قديمة إن حُذف القسم الافتراضي
const employeeDefaultsCache = new Map<string, { at: number; value: Promise<EmployeeDefaults> }>()
async function employeeDefaults() {
  const db = await resolveCurrentDbName().catch(() => "")
  const hit = employeeDefaultsCache.get(db)
  if (hit && Date.now() - hit.at < 120_000) return hit.value
  const value = loadEmployeeDefaults()
  employeeDefaultsCache.set(db, { at: Date.now(), value })
  value.catch(() => employeeDefaultsCache.delete(db))
  return value
}

async function firstOrCreate(select: () => Promise<any[]>, create: () => Promise<number>) {
  const row = (await select())[0]
  return row ? Number(row.id) : create()
}

async function loadEmployeeDefaults(): Promise<EmployeeDefaults> {
  const { ensureHrSchema } = await import("@/lib/hr-schema")
  await sql`CREATE TABLE IF NOT EXISTS departments (id SERIAL PRIMARY KEY, department_code VARCHAR(20) UNIQUE NOT NULL, department_name VARCHAR(100) NOT NULL,
    branch_id INTEGER, manager VARCHAR(100), employee_count INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await ensureHrSchema()
  const departmentId = await firstOrCreate(() => sql`SELECT id FROM departments WHERE COALESCE(is_active, true) OR department_code = 'GEN' ORDER BY COALESCE(is_active, true) DESC, id LIMIT 1`,
    () => insertRow("departments", { department_code: "GEN", department_name: "عام", is_active: true }))
  const jobId = await firstOrCreate(() => sql`SELECT id FROM employee_jobs_tbl WHERE COALESCE(is_active, true) OR code = 'GEN' ORDER BY COALESCE(is_active, true) DESC, id LIMIT 1`,
    () => insertRow("employee_jobs_tbl", { code: "GEN", name: "موظف", is_active: true }))
  const taxLawId = await firstOrCreate(() => sql`SELECT id FROM tax_laws_tbl WHERE COALESCE(is_active, true) ORDER BY id LIMIT 1`,
    () => insertRow("tax_laws_tbl", { name: "قانون ضريبة الدخل", other_name: "Income tax law", is_active: true }))
  const salaryItemId = await firstOrCreate(
    () => sql`SELECT id FROM salary_items_tbl WHERE COALESCE(is_active, true) OR code = 'BASIC' ORDER BY COALESCE(is_active, true) DESC, CASE WHEN item_type = 'basic_salary' THEN 0 ELSE 1 END, id LIMIT 1`,
    () => insertRow("salary_items_tbl", {
      code: "BASIC", name: "الراتب الأساسي", other_name: "Basic salary", item_type: "basic_salary", calculation_type: "fixed", calculation_method: "fixed",
      amount_period: "monthly", add_to_total_salary: true, default_amount: 0, taxable: true, is_active: true,
    }))
  const baseCurrencyId = Number((await sql`SELECT id FROM currency ORDER BY id LIMIT 1`)[0]?.id || 1)
  return { departmentId, jobId, taxLawId, salaryItemId, baseCurrencyId }
}

async function migrateEmployee(r: Row, shamelCode: string, code: string, name: string, accountId: number, fatherId: number | null) {
  const mapped = await mapOne("employee", shamelCode)
  if (mapped) return "skipped"
  const existing = (await sql`SELECT id FROM employees_tbl WHERE employee_code = ${code} OR salary_account = ${accountId} LIMIT 1`.catch(() => []))[0] as any
  if (existing) { await mapSet("employee", shamelCode, Number(existing.id)); return "updated" }

  const defaults = await employeeDefaults()
  const currency = (await currencyId(r.currency_code)) || defaults.baseCurrencyId
  const account = (await sql`SELECT father_id FROM account_tbl WHERE id = ${accountId}`)[0] as any
  const parentId = fatherId || (account?.father_id ? Number(account.father_id) : null)
  const parentCode = parentId ? text((await sql`SELECT code FROM account_tbl WHERE id = ${parentId}`)[0]?.code) || null : null
  const cityPos = num(r.city_pos)
  const cityId = cityPos > 0 ? await mapOne("city", String(cityPos)) : null
  const region = cityId ? text((await sql`SELECT name FROM cities WHERE id = ${cityId}`)[0]?.name) || null : null
  const phones = [text(r.phone), text(r.phone2), text(r.phone3)].filter(Boolean)
  const salary = num(r.subscription_amount)
  const id = await insertRow("employees_tbl", {
    employee_code: code, full_name: name, other_name: text(r.name_lang2) || null, national_id: text(r.id_no) || null,
    gender: "male", hire_date: date(r.entry_date_) || "1990-01-01", department_id: defaults.departmentId, job_id: defaults.jobId,
    salary_type: "monthly", basic_salary: salary, salary_currency: String(currency), contract_type: "permanent",
    salary_account: accountId, father_account: parentId, father_account_code: parentCode, account_currency: String(currency),
    allow_different_currency: num(r.allow_trans_with_diff_curr) === 1, currency_difference: num(r.iscalc_curr_diff_rates_asint) === 1,
    phone: phones[0] || null, address: text(r.address) || null, permanent_address: text(r.address) || null, region,
    tax_law_id: defaults.taxLawId, is_taxed: true, social_status: "single", status: num(r.stopped) ? 2 : 1,
    notes: [text(r.displayed_note), `مُرحَّل من الشامل (${shamelCode})`].filter(Boolean).join(" — "),
  })
  await sql`INSERT INTO employee_salary_items_tbl (employee_id, salary_item_id, amount, percentage) VALUES (${id}, ${defaults.salaryItemId}, ${salary}, 0)
    ON CONFLICT (employee_id, salary_item_id) DO NOTHING`
  await mapSet("employee", shamelCode, id)
  return "created"
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
    // رقم الفرع وحده (br."Branch ID") — لا يُدمج مع رقم البنك؛ فريد داخل البنك فقط (lib/branch-codes.ts)
    await ensureBranchCodeIndexes()
    const rawOwn = text(r.code)
    const ownCode = /^\d{1,4}$/.test(rawOwn) ? rawOwn.padStart(4, "0") : rawOwn || shamelCode
    let code = await fitCode("branches", "branch_code", ownCode, ownCode)
    if ((await sql`SELECT 1 FROM branches WHERE branch_code = ${code} AND bank_id = ${bankId} AND COALESCE(is_bank_branch, false)`).length) code = shamelCode
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
    // رقم المجموعة 10 خانات كمجموعات النظام (MS000002 ⇐ MS00000002): البادئة + الرقم مكمّلاً بالأصفار
    const prefixed = /^([A-Za-z]*)(\d+)$/.exec(shamelCode)
    const groupCode = prefixed && prefixed[1].length + prefixed[2].replace(/^0+(?=\d)/, "").length <= 10
      ? prefixed[1] + prefixed[2].replace(/^0+(?=\d)/, "").padStart(10 - prefixed[1].length, "0")
      : shamelCode
    const existing = (await sql`SELECT id FROM item_groups WHERE group_code IN (${shamelCode}, ${groupCode}) LIMIT 1`)[0] as any
    if (existing) { await mapSet("item_group", shamelCode, Number(existing.id)); return "updated" }
    const id = await insertRow("item_groups", { group_code: await fitCode("item_groups", "group_code", groupCode, shamelCode), group_name: name, parent_group_id: parentId, parent_id: parentId, is_active: true, status: 1 })
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
  return fitCode("products", "product_code", owner && text(owner.shamel_key) !== shamelCode ? shamelCode.toUpperCase().replace(/[^A-Z0-9]/g, "") : converted, shamelCode)
}

// أدوار الوحدة (وحدة الجرد/الشراء/التقارير) تُنشأ أعمدتها عادةً عند أول حفظ صنف من شاشة الأصناف — قاعدة لم يُحفظ
// فيها صنف بعد كانت تُرحَّل وحداتها بلا أدوار (insertRow يتجاوز العمود غير الموجود)
async function ensureUnitRoleColumns() { return runSchemaOnce("lib/shamel-migration/definitions.ts#ensureUnitRoleColumns", async () => {
  for (const column of ["is_stock_count_unit", "is_purchase_unit", "is_report_unit"]) {
    await sql.unsafe(`ALTER TABLE product_units ADD COLUMN IF NOT EXISTS ${column} BOOLEAN NOT NULL DEFAULT FALSE`)
  }
}) }

/**
 * صنف لا تحمل أي من وحداته دوراً ⇐ الدور لوحدته الأولى (الأصغر معاملاً) — نفس قاعدة شاشة الأصناف («دور بلا وحدة
 * محددة يُسند للوحدة الأولى»). يُصلح أيضاً أصنافاً رُحِّلت سابقاً قبل وجود الأعمدة.
 */
export async function assignDefaultUnitRoles() {
  await ensureUnitRoleColumns()
  for (const column of ["is_stock_count_unit", "is_purchase_unit", "is_report_unit"]) {
    await sql.unsafe(`
      UPDATE product_units pu SET ${column} = true
      FROM (
        SELECT DISTINCT ON (product_id) id FROM product_units ORDER BY product_id, to_main_qnty, id
      ) first_unit
      WHERE pu.id = first_unit.id
        AND NOT EXISTS (SELECT 1 FROM product_units other WHERE other.product_id = pu.product_id AND other.${column} = true)`)
  }
}

export async function processItems(rows: Row[], ctx: StepContext) {
  unitCache.clear()
  await ensureUnitRoleColumns()
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
      product_type: String(SHAMEL_ITEM_TYPE[itemType] ?? 1),
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

/**
 * جدول units بالشامل: باركودات كل وحدة — ShamelUnit = ترتيب الوحدة (0 الأولى، 1 الثانية...)، num = تسلسل الباركود
 * داخل نفس الوحدة (للوحدة عدة باركودات). يُعاد تشغيلها بأمان: باركود موجود لنفس الوحدة لا يتكرر.
 */
export async function processItemBarcodes(rows: Row[], ctx: StepContext) {
  await assignDefaultUnitRoles()
  const items = await mapGet("item", rows.map((r) => text(r.code)))
  await eachRow(rows, ctx, (r) => `${text(r.code)} ${text(r.barcode)}`, async (r) => {
    const shamelCode = text(r.code)
    const productId = items.get(shamelCode)
    const barcode = text(r.barcode)
    if (!barcode) return "skipped"
    if (!productId) { ctx.warn(shamelCode, `الصنف غير موجود — لم يُضف الباركود ${barcode}`); return "skipped" }
    const unitPos = num(r.unit_pos)
    const unitId = await mapOne("item_unit", `${shamelCode}|${unitPos}`)
    if (!unitId) { ctx.warn(shamelCode, `الوحدة ${unitPos + 1} غير معرّفة للصنف — لم يُضف الباركود ${barcode}`); return "skipped" }
    const productUnit = (await sql`SELECT id FROM product_units WHERE product_id = ${productId} AND unit_id = ${unitId} LIMIT 1`)[0] as any
    if (!productUnit) { ctx.warn(shamelCode, `الوحدة ${unitPos + 1} غير موجودة بالصنف — لم يُضف الباركود ${barcode}`); return "skipped" }
    const owner = (await sql`
      SELECT b.product_id, b.unit_id, p.product_code FROM product_unit_barcodes b LEFT JOIN products p ON p.id = b.product_id
      WHERE TRIM(b.barcode) = ${barcode} LIMIT 1`)[0] as any
    if (owner) {
      if (Number(owner.product_id) === productId && Number(owner.unit_id) === Number(productUnit.id)) return "skipped"
      ctx.warn(shamelCode, `الباركود ${barcode} مستخدم مسبقاً للصنف ${text(owner.product_code)} — لم يُكرَّر`)
      return "skipped"
    }
    await sql`INSERT INTO product_unit_barcodes (product_id, unit_id, barcode) VALUES (${productId}, ${Number(productUnit.id)}, ${barcode}) ON CONFLICT DO NOTHING`
    return "created"
  })
}

// ---------- الحسابات الافتراضية ----------
// نفس MigrateSettingsF/MigrateCurrenciesF بالشامل API: multifl.Typefile 48، الموقع 480 + n = حساب افتراضي، و currency.AccCode
// = صندوق العملة. إعدادات النظام تُعبّأ إن كانت فارغة فقط (لا تُستبدل إعدادات حدّدها المستخدم)، وحسابات المستخدمين
// الافتراضية (صندوق/شيكات واردة/مرتجعة/بطاقات) لكل مستخدم في فرع التشغيل ولكل عملة لا يملك لها سطراً.
const SHAMEL_SYSTEM_SETTING_BY_OFFSET: Record<number, string> = {
  2: "default_sales_tax_account", 3: "default_purchase_tax_account",
  4: "default_customer_parent_account", 5: "default_supplier_parent_account", 6: "default_salesman_parent_account",
  7: "default_selling_account_id", 8: "default_purchase_account_id", 9: "default_production_account_id",
  10: "default_selling_returns_account_id", 11: "default_purchase_returns_account_id",
  12: "default_stock_end_account_id", 13: "default_stock_start_account_id",
  14: "default_currency_transfer_account", 15: "default_earned_discount_account", 16: "default_allowed_discount_account",
  17: "default_customer_subscription_account", 21: "default_exchange_gain_loss_account",
}
const USER_SETTING_OFFSETS = { cash: 0, receivedCheques: 1, returnedCheques: 20, cards: 22 } as const

export async function processDefaultAccounts(rows: Row[], ctx: StepContext) {
  const byOffset = new Map<number, number>()
  const cashByCurrency = new Map<number, number>()
  for (const r of rows) {
    ctx.stats.received++
    const code = text(r.account_code)
    const account = await accountId(code)
    if (!account) { ctx.stats.skipped++; ctx.warn(code, `الحساب الافتراضي ${code} غير موجود`); continue }
    const pos = num(r.pos)
    if (pos >= 480) byOffset.set(pos - 480, account)
    else {
      const currency = await currencyId(r.currency_code)
      if (currency) cashByCurrency.set(currency, account)
    }
  }

  const { loadStoredSettings, saveSettingsPayload } = await import("@/app/api/settings/system/route")
  const stored = await loadStoredSettings()
  const payload: Record<string, unknown> = {}
  for (const [offset, key] of Object.entries(SHAMEL_SYSTEM_SETTING_BY_OFFSET)) {
    const account = byOffset.get(Number(offset))
    if (account && !(Number(stored[key]) > 0)) payload[key] = account
  }
  if (Object.keys(payload).length) {
    await saveSettingsPayload(payload, stored)
    ctx.stats.updated += Object.keys(payload).length
  }

  const received = byOffset.get(USER_SETTING_OFFSETS.receivedCheques) ?? null
  const returned = byOffset.get(USER_SETTING_OFFSETS.returnedCheques) ?? null
  const cards = byOffset.get(USER_SETTING_OFFSETS.cards) ?? null
  const mainCash = byOffset.get(USER_SETTING_OFFSETS.cash) ?? null
  if (!mainCash && !received && !returned && !cards && !cashByCurrency.size) return
  await ensureUsersCurrenciesDefaultTable()
  const users = (await sql`SELECT id FROM user_settings`.catch(() => [])) as any[]
  const currencies = (await sql`SELECT id FROM currency`) as any[]
  for (const user of users) {
    for (const currency of currencies) {
      const currencyIdValue = Number(currency.id)
      const cash = cashByCurrency.get(currencyIdValue) ?? mainCash
      const inserted = await sql`
        INSERT INTO users_currencies_default_account_tbl (user_id, currency_id, branch_id, account_id, received_cheqs_account_id, returned_cheqs_account_id, cards_account_id)
        SELECT ${Number(user.id)}, ${currencyIdValue}, ${ctx.run.branch_id}, ${cash}, ${received}, ${returned}, ${cards}
        WHERE NOT EXISTS (
          SELECT 1 FROM users_currencies_default_account_tbl
          WHERE user_id = ${Number(user.id)} AND currency_id = ${currencyIdValue} AND branch_id IS NOT DISTINCT FROM ${ctx.run.branch_id}::int)
        RETURNING id`
      if (inserted.length) ctx.stats.created++
    }
  }
}

// ---------- أنواع البطاقات (CardType) ----------
// نفس MigrateCreditCardsF بالشامل API: CardType 0 ⇐ بطاقة صراف (2) وإلا ائتمان (1)، FeeType 0 ⇐ نسبة (1) وإلا مبلغ
// مقطوع (2)، Post_acc حساب البطاقة، Com_acc حساب العمولة، CustomerCode الحساب الوسيط، Holiday بتات أيام العطل (0..6 ⇐ 1..7).
export async function processCreditCards(rows: Row[], ctx: StepContext) {
  const { ensureTables: ensureCreditCardTables, saveHolidays } = await import("@/app/api/credit-cards/_lib")
  await ensureCreditCardTables()
  await eachRow(rows, ctx, (r) => `بطاقة ${num(r.cc_id)}`, async (r) => {
    const key = String(num(r.cc_id))
    if (await mapOne("credit_card", key)) return "skipped"
    const name = text(r.name).slice(0, 70) || `بطاقة ${key}`
    const existing = (await sql`SELECT id FROM credit_cards_types_tbl WHERE name = ${name} AND COALESCE(status, 1) <> 3 LIMIT 1`)[0] as any
    if (existing) { await mapSet("credit_card", key, Number(existing.id)); return "updated" }
    const machine = num(r.machine_id)
    const id = await insertRow("credit_cards_types_tbl", {
      name, name_lang2: name, status: 1, insert_date: new Date().toISOString().slice(0, 10),
      main_type: num(r.card_type) === 0 ? 2 : 1, commission_type_id: num(r.fee_type) === 0 ? 1 : 2,
      commission_value: num(r.ratio), commission_max_amount: num(r.max_amount_com) || null,
      currency_id: await currencyId(r.currency_code), bank_id: await mapOne("bank", text(r.bank_code)),
      financial_account_id: await accountId(r.post_account_code), commission_account_id: await accountId(r.com_account_code),
      waseet_account_id: await accountId(r.customer_code),
      link_bank_machine: num(r.integ_with_machine) !== 0, pinpad_machine_id: num(r.integ_with_machine) !== 0 && machine > 0 ? machine : null,
    })
    const holiday = num(r.holiday)
    await saveHolidays(id, [0, 1, 2, 3, 4, 5, 6].filter((bit) => (holiday & (1 << bit)) !== 0).map((bit) => bit + 1))
    await mapSet("credit_card", key, id)
    return "created"
  })
}
