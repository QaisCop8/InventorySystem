import sql from "@/lib/database"
import { validateAccountParentForChild } from "@/app/api/accounts/_lib"

/**
 * إنشاء آلي لحسابات الحساب البنكي (كما في الشامل — BankAccounts AutoGenerateAccounts):
 * - "اعدادات": الحساب الاب لكل نوع (system_settings).
 * - لكل بنك: حساب أب تحت الحساب الاب للنوع باسم "<اسم الاب> <البنك>" — يُعاد استخدامه للحسابات البنكية التالية لنفس البنك.
 * - لكل حساب بنكي: حساب فرعي تحت حساب البنك باسم "<الاب> <البنك> <رقم الحساب الفعلي> <العملة>" (الجاري: "جاري <البنك> ...").
 * - عمولة التحصيل: حساب واحد لكل بنك مباشرة تحت الحساب الاب (مشترك بين العملات).
 * الترقيم: مقطع من رقمين بعد الجزء المعنوي لرقم الأب (1102000000 ← 1102010000 ← 1102010100)، أول رقم غير مستخدم.
 */

export type BankAutoKind = "jary" | "tahsil" | "tahsil_commission" | "payed_checks" | "returned_checks"

export const BANK_AUTO_PARENTS: { kind: BankAutoKind; settingId: string; field: string; label: string; childLabel: string }[] = [
  { kind: "jary", settingId: "default_bank_jary_parent_account", field: "jary_account_id", label: "الحساب الاب للحساب المحاسبي (الجاري)", childLabel: "الحساب المحاسبي" },
  { kind: "tahsil", settingId: "default_bank_tahsil_parent_account", field: "tahsil_account_id", label: "الحساب الاب لحساب شيكات برسم التحصيل", childLabel: "حساب شيكات برسم التحصيل" },
  { kind: "tahsil_commission", settingId: "default_bank_tahsil_commission_parent_account", field: "tahsil_commission_account_id", label: "الحساب الاب لحساب عمولة التحصيل", childLabel: "حساب عمولة التحصيل" },
  { kind: "payed_checks", settingId: "default_bank_payed_checks_parent_account", field: "payed_checks_account_id", label: "الحساب الاب لحساب الشيكات الصادرة المؤجلة", childLabel: "حساب الشيكات الصادرة المؤجلة" },
  { kind: "returned_checks", settingId: "default_bank_returned_checks_parent_account", field: "returned_checks_account_id", label: "الحساب الاب لحساب الشيكات المرتجعة", childLabel: "حساب الشيكات المرتجعة" },
]

export class BankAutoGenerateError extends Error {}

type AccountRow = { id: number; code: string; name: string; name_lang2: string | null; [key: string]: any }

const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 100)

export async function loadBankAutoParents() {
  const rows = await sql`
    SELECT s.id AS setting_id, a.id, a.code, a.name
    FROM system_settings s
    LEFT JOIN account_tbl a ON a.id::text = s.value AND COALESCE(a.status, 1) <> 3
    WHERE s.id = ANY(${BANK_AUTO_PARENTS.map((item) => item.settingId)}::text[])
  `
  const bySetting = new Map((rows as any[]).map((row) => [String(row.setting_id), row]))
  return BANK_AUTO_PARENTS.map((item) => {
    const row = bySetting.get(item.settingId)
    return { kind: item.kind, label: item.label, account_id: row?.id ? Number(row.id) : null, code: row?.code ? String(row.code) : "", name: row?.name ? String(row.name) : "" }
  })
}

export async function saveBankAutoParents(input: Record<string, unknown>) {
  for (const item of BANK_AUTO_PARENTS) {
    if (!(item.kind in input)) continue
    const id = Number(input[item.kind]) || 0
    if (id > 0) {
      const error = await validateAccountParentForChild(id)
      if (error) throw new BankAutoGenerateError(`${item.label}: ${error}`)
    }
    await sql`
      INSERT INTO system_settings (id, description, value) VALUES (${item.settingId}, ${item.label}, ${id > 0 ? String(id) : ""})
      ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value
    `
  }
}

/** أول رقم فرعي غير مستخدم تحت الأب؛ reserved = أرقام محجوزة في نفس الخطة (لم تُحفظ بعد). */
async function nextChildCode(fatherCode: string, reserved: Set<string>) {
  const code = String(fatherCode || "").trim()
  if (/^\d+$/.test(code)) {
    const prefix = code.replace(/0+$/, "")
    const candidates: string[] = []
    for (let serial = 1; serial <= 99; serial++) {
      const candidate = (prefix + String(serial).padStart(2, "0")).padEnd(code.length, "0")
      if (candidate.length > code.length) break
      candidates.push(candidate)
    }
    if (candidates.length) {
      const used = new Set((await sql`SELECT code FROM account_tbl WHERE code = ANY(${candidates}::text[])`).map((row: any) => String(row.code)))
      const free = candidates.find((candidate) => !used.has(candidate) && !reserved.has(candidate))
      if (free) return free
    }
  }
  // رقم الأب غير رقمي أو امتلأت المقاطع: التسلسل العام لدليل الحسابات (آخر رقم + 1 بنفس الصيغة)
  const last = (await sql`SELECT code FROM account_tbl WHERE type = 1 AND code ~ '[0-9]$' ORDER BY LENGTH(code) DESC, code DESC LIMIT 1`)[0] as any
  const match = String(last?.code || "A000000000").match(/^(.*?)(\d+)$/)!
  let number = Number(match[2])
  for (let attempt = 0; attempt < 1000; attempt++) {
    number += 1
    const candidate = match[1] + String(number).padStart(match[2].length, "0")
    if (reserved.has(candidate)) continue
    if (!(await sql`SELECT 1 FROM account_tbl WHERE code = ${candidate} LIMIT 1`).length) return candidate
  }
  throw new BankAutoGenerateError("تعذر توليد رقم حساب جديد")
}

type PlannedAccount = { code: string; name: string; name_lang2: string; existingId?: number; fatherId?: number; fatherKey?: string; currencyId: number | null; template: AccountRow; level: number }
export type BankAutoPlanItem = { kind: BankAutoKind; label: string; father?: { code: string; name: string; exists: boolean }; account: { code: string; name: string; exists: boolean } }

/**
 * يحسب الحسابات التي ستُنشأ (أو يُعاد استخدامها) لحساب بنكي: بلا حفظ. يستخدمه العرض المسبق والإنشاء الفعلي معاً
 * حتى يكون ما يراه المستخدم هو ما يُحفظ.
 */
async function planAccounts(input: { branchId: number; currencyId: number; actualCode: string }) {
  const branch = (await sql`SELECT br.id, br.bank_id, b.bank_name, b.bank_name_en FROM branches br LEFT JOIN banks b ON b.id = br.bank_id WHERE br.id = ${input.branchId} LIMIT 1`)[0] as any
  if (!branch) throw new BankAutoGenerateError("يجب اختيار البنك والفرع")
  if (!branch.bank_id) throw new BankAutoGenerateError("الفرع المختار غير مرتبط ببنك")
  const currency = (await sql`SELECT id, currency_code, currency_name FROM currency WHERE id = ${input.currencyId} LIMIT 1`)[0] as any
  if (!currency) throw new BankAutoGenerateError("يجب اختيار العملة")
  const bankName = String(branch.bank_name || "").trim()
  const bankNameEn = String(branch.bank_name_en || branch.bank_name || "").trim()
  const actual = String(input.actualCode || "").trim()

  const parents = await loadBankAutoParents()
  const missing = parents.filter((parent) => !parent.account_id)
  if (missing.length) throw new BankAutoGenerateError(`حدد في "اعدادات" الإنشاء الآلي: ${missing.map((parent) => parent.label).join("، ")}`)
  const parentRows = await sql`SELECT * FROM account_tbl WHERE id = ANY(${parents.map((parent) => parent.account_id)}::int[])`
  const parentById = new Map((parentRows as any[]).map((row) => [Number(row.id), row as AccountRow]))

  const reserved = new Set<string>()
  const plan: { kind: BankAutoKind; father?: PlannedAccount; account: PlannedAccount }[] = []
  for (const parent of parents) {
    const grand = parentById.get(Number(parent.account_id))
    if (!grand) throw new BankAutoGenerateError(`${parent.label}: الحساب غير موجود`)
    const parentError = await validateAccountParentForChild(Number(grand.id))
    if (parentError) throw new BankAutoGenerateError(`${parent.label}: ${parentError}`)
    const grandLevel = Number(grand.level_no || 1)
    const bankAccountName = clean(`${grand.name} ${bankName}`)
    const bankAccountNameEn = clean(`${grand.name_lang2 || grand.name} ${bankNameEn}`)
    // حساب البنك تحت الحساب الاب — موجود مسبقاً (نفس الاسم) أو جديد
    const existingBank = (await sql`SELECT * FROM account_tbl WHERE father_id = ${grand.id} AND name = ${bankAccountName} AND COALESCE(status, 1) <> 3 ORDER BY id LIMIT 1`)[0] as AccountRow | undefined

    if (parent.kind === "tahsil_commission") {
      // عمولة التحصيل: حساب واحد للبنك (حساب فرعي يُرحَّل عليه) — يُعاد استخدامه لكل العملات
      if (existingBank) {
        const hasChildren = (await sql`SELECT 1 FROM account_tbl WHERE father_id = ${existingBank.id} AND COALESCE(status, 1) <> 3 LIMIT 1`).length > 0
        if (hasChildren) throw new BankAutoGenerateError(`حساب عمولة التحصيل للبنك (${existingBank.code} - ${existingBank.name}) حساب أب؛ اختر حساباً فرعياً يدوياً`)
        plan.push({ kind: parent.kind, account: { code: String(existingBank.code), name: String(existingBank.name), name_lang2: String(existingBank.name_lang2 || ""), existingId: Number(existingBank.id), currencyId: null, template: grand, level: grandLevel + 1 } })
      } else {
        const code = await nextChildCode(String(grand.code), reserved); reserved.add(code)
        plan.push({ kind: parent.kind, account: { code, name: bankAccountName, name_lang2: bankAccountNameEn, fatherId: Number(grand.id), currencyId: null, template: grand, level: grandLevel + 1 } })
      }
      continue
    }

    let father: PlannedAccount
    if (existingBank) {
      father = { code: String(existingBank.code), name: String(existingBank.name), name_lang2: String(existingBank.name_lang2 || ""), existingId: Number(existingBank.id), currencyId: null, template: grand, level: grandLevel + 1 }
      const fatherError = await validateAccountParentForChild(Number(existingBank.id))
      if (fatherError) throw new BankAutoGenerateError(fatherError)
    } else {
      const code = await nextChildCode(String(grand.code), reserved); reserved.add(code)
      father = { code, name: bankAccountName, name_lang2: bankAccountNameEn, fatherId: Number(grand.id), currencyId: null, template: grand, level: grandLevel + 1 }
    }
    const childName = parent.kind === "jary" ? clean(`جاري ${bankName} ${actual} ${currency.currency_name || ""}`) : clean(`${grand.name} ${bankName} ${actual} ${currency.currency_name || ""}`)
    const childNameEn = parent.kind === "jary" ? clean(`Current ${bankNameEn} ${actual} ${currency.currency_code || ""}`) : clean(`${grand.name_lang2 || grand.name} ${bankNameEn} ${actual} ${currency.currency_code || ""}`)
    const childCode = await nextChildCode(father.code, reserved); reserved.add(childCode)
    plan.push({ kind: parent.kind, father, account: { code: childCode, name: childName, name_lang2: childNameEn, fatherKey: father.code, currencyId: Number(currency.id), template: grand, level: father.level + 1 } })
  }
  return plan
}

export async function previewBankAccountAccounts(input: { branchId: number; currencyId: number; actualCode: string }): Promise<BankAutoPlanItem[]> {
  const plan = await planAccounts(input)
  return plan.map((item) => ({
    kind: item.kind,
    label: BANK_AUTO_PARENTS.find((parent) => parent.kind === item.kind)!.childLabel,
    father: item.father ? { code: item.father.code, name: item.father.name, exists: Boolean(item.father.existingId) } : undefined,
    account: { code: item.account.code, name: item.account.name, exists: Boolean(item.account.existingId) },
  }))
}

async function insertAccount(account: PlannedAccount, fatherId: number) {
  const t = account.template
  const row = (await sql`
    INSERT INTO account_tbl (
      company_id, code, type, name, name_lang2, father_id, level_no,
      finanical_list_id, finanical_list_assests_id, finanical_list_liabilities_id, finanical_list_income_id,
      currency_id, allow_trans_with_diff_curr, iscalc_curr_diff_rates, transaction_type, transaction_type_action,
      max_transaction_amount, max_transaction_amount_action, max_balance_amount, max_balance_action,
      notes, show_notes_in_transactions_soa, status, insert_date, last_update_date
    ) VALUES (
      ${t.company_id ?? 1}, ${account.code}, 1, ${account.name}, ${account.name_lang2 || null}, ${fatherId}, ${account.level},
      ${t.finanical_list_id ?? null}, ${t.finanical_list_assests_id ?? null}, ${t.finanical_list_liabilities_id ?? null}, ${t.finanical_list_income_id ?? null},
      ${account.currencyId}, ${t.allow_trans_with_diff_curr ?? 0}, ${t.iscalc_curr_diff_rates ?? false}, ${t.transaction_type ?? 0}, ${t.transaction_type_action ?? 0},
      ${t.max_transaction_amount ?? 0}, ${t.max_transaction_amount_action ?? 0}, ${t.max_balance_amount ?? 0}, ${t.max_balance_action ?? null},
      ${"أُنشئ آلياً من حسابات البنوك"}, false, 1, CURRENT_DATE, NOW()
    ) RETURNING id
  `)[0] as any
  return Number(row.id)
}

/** ينشئ الحسابات (يُستدعى داخل withTenantTransaction مع حفظ الحساب البنكي) ويعيد أرقامها لحقول الحساب البنكي. */
export async function createBankAccountAccounts(input: { branchId: number; currencyId: number; actualCode: string }) {
  const plan = await planAccounts(input)
  const ids: Record<string, number> = {}
  for (const item of plan) {
    const field = BANK_AUTO_PARENTS.find((parent) => parent.kind === item.kind)!.field
    let fatherId = item.account.fatherId || 0
    if (item.father) fatherId = item.father.existingId || await insertAccount(item.father, Number(item.father.fatherId))
    ids[field] = item.account.existingId || await insertAccount(item.account, fatherId)
  }
  return ids
}
