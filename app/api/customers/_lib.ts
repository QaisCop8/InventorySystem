import sql from "@/lib/database"
import { loadStoredSettings } from "@/app/api/settings/system/route"
import { runSchemaOnce } from "@/lib/schema-once"
import { getSystemSettingValue } from "@/lib/system-settings"

export const toNullableInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const toInt = (value: unknown, fallback = 0): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["1", "true", "yes", "y", "نعم"].includes(normalized)
  }
  return fallback
}

export const ensureCustomerCompatibilityColumns = async () => { return runSchemaOnce("app/api/customers/_lib.ts#ensureCustomerCompatibilityColumns", async () => {
  await sql`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS customer_name_en VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(255),
      ADD COLUMN IF NOT EXISTS region VARCHAR(255),
      ADD COLUMN IF NOT EXISTS sales_commission NUMERIC(12, 3) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS collection_commission NUMERIC(12, 3) DEFAULT 0,
      -- الرقم الضريبي / المشتغل المرخص للعميل (يُطبع في رأس السندات إن فُعّل "طباعة المشتغل المرخص للعميل")
      ADD COLUMN IF NOT EXISTS tax_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS id_number VARCHAR(20),
      -- المدينة كرقم من تعريف المدن (cities.id)؛ عمود city يبقى اسمها للتقارير والطباعة القائمة
      ADD COLUMN IF NOT EXISTS city_id INTEGER
  `
  await ensureCitiesTable()
  // ترحيل لمرة واحدة: كل اسم مدينة نصّي غير معرَّف يُضاف لتعريف المدن، ثم يُربط العميل برقمها
  await sql`
    INSERT INTO cities (name)
    SELECT DISTINCT btrim(c.city) FROM customers c
    WHERE COALESCE(btrim(c.city), '') <> ''
      AND NOT EXISTS (SELECT 1 FROM cities ct WHERE lower(btrim(ct.name)) = lower(btrim(c.city)) AND ct.status <> 3)
  `
  await sql`
    UPDATE customers c SET city_id = ct.id
    FROM cities ct
    WHERE c.city_id IS NULL AND COALESCE(btrim(c.city), '') <> ''
      AND lower(btrim(ct.name)) = lower(btrim(c.city)) AND ct.status <> 3
  `
}) }

const ensureCitiesTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

/**
 * المدينة المحفوظة للعميل: رقم مدينة معرّفة، أو اسم (من الشاشة القديمة أو ملف Excel) يُطابَق بلا حساسية
 * لحالة الأحرف، وإن لم يوجد في تعريف المدن يُضاف إليه. يُرجع الرقم والاسم معاً (city_id + city).
 */
export async function resolveCustomerCity(cityId: unknown, cityName: unknown): Promise<{ id: number | null; name: string | null }> {
  const id = Number(cityId)
  if (Number.isInteger(id) && id > 0) {
    const [row] = await sql`SELECT id, name FROM cities WHERE id = ${id} AND status <> 3`
    if (row) return { id: Number(row.id), name: String(row.name) }
  }
  const name = String(cityName ?? "").trim().slice(0, 100)
  if (!name) return { id: null, name: null }
  if (/^\d+$/.test(name)) {
    const [byId] = await sql`SELECT id, name FROM cities WHERE id = ${Number(name)} AND status <> 3`
    if (byId) return { id: Number(byId.id), name: String(byId.name) }
  }
  await ensureCitiesTable()
  const [existing] = await sql`SELECT id, name FROM cities WHERE lower(btrim(name)) = lower(${name}) AND status <> 3 ORDER BY id LIMIT 1`
  if (existing) return { id: Number(existing.id), name: String(existing.name) }
  const [created] = await sql`INSERT INTO cities (name) VALUES (${name}) RETURNING id, name`
  return { id: Number(created.id), name: String(created.name) }
}

// رقم الهوية: فارغ أو أرقام فقط (9 أرقام على الأقل) وغير مكرر بين العملاء/الموردين/المندوبين/المشتركين.
// الهوية/الهاتف/الإيميل إجبارية للعملاء (type 1) حسب اعدادات النظام:
// customer_id_number_required / customer_phone_required / customer_email_required
export const normalizeCustomerIdNumber = (value: unknown) => String(value ?? "").trim()

export async function validateCustomerContactFields(data: any, type: unknown, currentId?: unknown): Promise<string | null> {
  // رقم العميل/المورد/المشترك: أحرف إنجليزية وأرقام فقط (لا حروف عربية)
  const customerCode = String(data?.customer_code ?? "").trim()
  if (customerCode && !/^[A-Za-z0-9]+$/.test(customerCode)) {
    // سجل قديم برقم لم يتغيّر لا يُمنع من التعديل
    const [stored] = currentId ? await sql`SELECT customer_code FROM customers WHERE id = ${Number(currentId)}` : []
    if (String(stored?.customer_code ?? "") !== customerCode) return "رقم العميل/المورد/المشترك يجب أن يحتوي أحرفاً إنجليزية وأرقاماً فقط"
  }
  const idNumber = normalizeCustomerIdNumber(data?.id_number)
  if (idNumber && !/^\d{9,20}$/.test(idNumber)) return "رقم الهوية يجب أن يكون أرقاماً فقط و9 أرقام على الأقل"
  if (idNumber) {
    await ensureCustomerCompatibilityColumns()
    const [duplicate] = await sql`
      SELECT name, type FROM customers
      WHERE btrim(id_number) = ${idNumber} AND COALESCE(isdeleted, false) = false AND id <> ${Number(currentId) || 0}
      LIMIT 1`
    if (duplicate) {
      const kind = Number(duplicate.type) === 2 ? "المورد" : Number(duplicate.type) === 3 ? "المندوب" : Number(duplicate.type) === 4 ? "المشترك" : "العميل"
      return `رقم الهوية مكرر مع ${kind} ${String(duplicate.name || "").trim()}`
    }
  }
  const email = String(data?.email ?? "").trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "البريد الإلكتروني غير صحيح"
  if (Number(type ?? 1) !== 1) return null
  const [idRequired, phoneRequired, emailRequired] = await Promise.all([
    getSystemSettingValue<unknown>("customer_id_number_required", false),
    getSystemSettingValue<unknown>("customer_phone_required", false),
    getSystemSettingValue<unknown>("customer_email_required", false),
  ])
  const on = (value: unknown) => value === true || value === "true" || value === 1 || value === "1"
  if (on(idRequired) && !idNumber) return "رقم الهوية اجباري"
  if (on(phoneRequired) && !String(data?.mobile1 ?? "").trim()) return "رقم الهاتف اجباري"
  if (on(emailRequired) && !email) return "البريد الإلكتروني اجباري"
  return null
}

export const resolveAccountHierarchy = async (fatherIdInput: unknown, levelNoInput: unknown) => {
  const fatherId = toNullableInt(fatherIdInput)

  if (!fatherId) {
    return { fatherId: null, levelNo: toInt(levelNoInput, 1) || 1 }
  }

  const parentRows = await sql`
    SELECT level_no
    FROM account_tbl
    WHERE id = ${fatherId}
    LIMIT 1
  `

  if (parentRows.length === 0) {
    throw new Error("الحساب الرئيسي غير موجود")
  }

  const parentLevel = Number(parentRows[0]?.level_no ?? 0)
  return { fatherId, levelNo: parentLevel + 1 }
}

// حساب الأب لكل نوع جهة من "الحسابات الافتراضية" في إعدادات النظام (customers.type: 1=عميل,
// 2=مورد, 3=مندوب, 4=مشترك) — نفس المفاتيح التي تقرؤها شاشة العملاء لسجل جديد.
const PARENT_ACCOUNT_SETTING: Record<number, { key: string; label: string }> = {
  1: { key: "default_customer_parent_account", label: "للعملاء" },
  2: { key: "default_supplier_parent_account", label: "للموردين" },
  3: { key: "default_salesman_parent_account", label: "للمندوبين" },
  4: { key: "default_customer_subscription_account", label: "للمشتركين" },
}

export class MissingParentAccountError extends Error {}

export const missingParentAccountMessage = (entityType: unknown) =>
  `يجب الذهاب الى الحسابات الافتراضية واختيار حساب الاب ${(PARENT_ACCOUNT_SETTING[Number(entityType)] || PARENT_ACCOUNT_SETTING[1]).label}`

// حساب الأب إلزامي: المُرسَل مع الطلب، وإلا الافتراضي من الإعدادات (لإنشاء سريع من شاشات أخرى
// لا تُرسله)، وإلا يُرمى MissingParentAccountError. settings اختيارية لتفادي قراءتها لكل سطر استيراد.
export const resolveRequiredParentAccount = async (
  entityType: unknown,
  fatherIdInput: unknown,
  settings?: Record<string, unknown>,
) => {
  const requestedFatherId = toNullableInt(fatherIdInput)
  if (requestedFatherId) return resolveAccountHierarchy(requestedFatherId, 1)

  const stored = settings ?? (await loadStoredSettings())
  const setting = PARENT_ACCOUNT_SETTING[Number(entityType)] || PARENT_ACCOUNT_SETTING[1]
  const defaultFatherId = toNullableInt(stored[setting.key])
  if (!defaultFatherId) throw new MissingParentAccountError(missingParentAccountMessage(entityType))
  try {
    return await resolveAccountHierarchy(defaultFatherId, 1)
  } catch {
    // الحساب المحدد في الإعدادات لم يعد موجوداً
    throw new MissingParentAccountError(missingParentAccountMessage(entityType))
  }
}

// نوع الحساب المرتبط بالعميل/المورد/المندوب/المشترك — إزاحة ثابتة (+1) عن نوع الجهة نفسها
// (customers.type: 1=عميل, 2=مورد, 3=مندوب, 4=مشترك) إلى (account_tbl.type: 2..5) على التوالي.
export const resolveAccountType = (entityType: unknown) => {
  const normalizedType = Number(entityType)

  if (normalizedType === 2) return 3
  if (normalizedType === 3) return 4
  if (normalizedType === 4) return 5
  return 2
}

/**
 * القائمة المالية وبند الأصول/الخصوم/قائمة الدخل لحساب العميل/المورد/المشترك تُورَث من الحساب الأب
 * (كان مثبتاً: الميزانية + بند أصول رقم 2 لكل الجهات، فيظهر حساب المورد مثلاً تحت بند أصول خاطئ).
 * بلا أب: الميزانية العمومية بلا بند.
 */
export const financialListFromFather = async (fatherId: number | null) => {
  if (fatherId) {
    const father = (await sql`
      SELECT finanical_list_id, finanical_list_assests_id, finanical_list_liabilities_id, finanical_list_income_id
      FROM account_tbl WHERE id = ${fatherId} LIMIT 1
    `)[0] as any
    if (father) {
      return {
        listId: Number(father.finanical_list_id) || 1,
        assetsId: father.finanical_list_assests_id == null ? null : Number(father.finanical_list_assests_id),
        liabilitiesId: father.finanical_list_liabilities_id == null ? null : Number(father.finanical_list_liabilities_id),
        incomeId: father.finanical_list_income_id == null ? null : Number(father.finanical_list_income_id),
      }
    }
  }
  return { listId: 1, assetsId: null as number | null, liabilitiesId: null as number | null, incomeId: null as number | null }
}

export const ensureCustomerAccount = async ({
  accountId,
  code,
  name,
  currencyId = 1,
  allowTransWithDiffCurr = 0,
  isCalcCurrDiffRates = false,
  fatherId = null,
  levelNo = 1,
  accountType = 2,
  creditLimit = null,
}: {
  accountId?: number | null
  code: string
  name: string
  currencyId?: number | null
  allowTransWithDiffCurr?: unknown
  isCalcCurrDiffRates?: unknown
  fatherId?: number | null
  levelNo?: number
  accountType?: number
  // حد الائتمان (حد الدين) — null = إبقاء القيمة الحالية بالحساب كما هي
  creditLimit?: number | null
}) => {
  const normalizedCode = String(code || "").trim()
  const normalizedName = String(name || "").trim()

  if (!normalizedCode || !normalizedName) {
    throw new Error("رقم واسم الحساب مطلوبان")
  }

  const finalCurrencyId = Number(currencyId || 1) || 1
  const finalAllowTransWithDiffCurr = toInt(allowTransWithDiffCurr, 0)
  const finalIsCalcCurrDiffRates = toBool(isCalcCurrDiffRates, false)
  const finalFatherId = fatherId ? Number(fatherId) : null
  const finalLevelNo = Number(levelNo || 1) || 1
  const finalCreditLimit = creditLimit == null || !Number.isFinite(Number(creditLimit)) ? null : Math.max(0, Number(creditLimit))
  const financial = await financialListFromFather(finalFatherId)

  if (accountId) {
    await sql`
      UPDATE account_tbl
      SET
        code = ${normalizedCode},
        name = ${normalizedName},
        type = ${accountType},
        finanical_list_id = ${financial.listId},
        finanical_list_assests_id = ${financial.assetsId},
        finanical_list_liabilities_id = ${financial.liabilitiesId},
        finanical_list_income_id = ${financial.incomeId},
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
        transaction_type = 0,
        transaction_type_action = 0,
        max_transaction_amount = 0,
        max_transaction_amount_action = 0,
        max_balance_amount = COALESCE(${finalCreditLimit}::double precision, max_balance_amount, 0),
        budget_exceeding_perc = NULL,
        budget_exceeding_action = NULL,
        unified_report_account_no = NULL,
        unified_report_group_code = NULL,
        notes = NULL,
        show_notes_in_transactions_soa = false,
        status = 1,
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${accountId}
    `

    return accountId
  }

  const existingAccount = await sql`
    SELECT id
    FROM account_tbl
    WHERE LOWER(code) = LOWER(${normalizedCode})
    LIMIT 1
  `

  if (existingAccount.length > 0) {
    const existingId = Number(existingAccount[0].id)
    await sql`
      UPDATE account_tbl
      SET
        name = ${normalizedName},
        type = ${accountType},
        finanical_list_id = ${financial.listId},
        finanical_list_assests_id = ${financial.assetsId},
        finanical_list_liabilities_id = ${financial.liabilitiesId},
        finanical_list_income_id = ${financial.incomeId},
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
        max_balance_amount = COALESCE(${finalCreditLimit}::double precision, max_balance_amount, 0),
        status = 1,
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${existingId}
    `
    return existingId
  }

  const created = await sql`
    INSERT INTO account_tbl (
      company_id,
      code,
      type,
      name,
      name_lang2,
      father_id,
      level_no,
      finanical_list_id,
      finanical_list_assests_id,
      finanical_list_liabilities_id,
      finanical_list_income_id,
      currency_id,
      allow_trans_with_diff_curr,
      iscalc_curr_diff_rates,
      transaction_type,
      transaction_type_action,
      max_transaction_amount,
      max_transaction_amount_action,
      max_balance_amount,
      max_balance_action,
      budget_exceeding_perc,
      budget_exceeding_action,
      unified_report_account_no,
      unified_report_group_code,
      notes,
      show_notes_in_transactions_soa,
      status,
      insert_date,
      last_update_date
    ) VALUES (
      2,
      ${normalizedCode},
      ${accountType},
      ${normalizedName},
      NULL,
      ${finalFatherId},
      ${finalLevelNo},
      ${financial.listId},
      ${financial.assetsId},
      ${financial.liabilitiesId},
      ${financial.incomeId},
      ${finalCurrencyId},
      ${finalAllowTransWithDiffCurr},
      ${finalIsCalcCurrDiffRates},
      0,
      0,
      0,
      0,
      0,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      false,
      1,
      CURRENT_DATE,
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `

  return Number(created[0].id)
}
