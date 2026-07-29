import sql from "@/lib/database"

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

export const ensureCustomerCompatibilityColumns = async () => {
  await sql`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS type INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS customer_name_en VARCHAR(255),
      ADD COLUMN IF NOT EXISTS image_url TEXT
  `
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

// نوع الحساب المرتبط بالعميل/المورد/المندوب/المشترك — إزاحة ثابتة (+1) عن نوع الجهة نفسها
// (customers.type: 1=عميل, 2=مورد, 3=مندوب, 4=مشترك) إلى (account_tbl.type: 2..5) على التوالي.
export const resolveAccountType = (entityType: unknown) => {
  const normalizedType = Number(entityType)

  if (normalizedType === 2) return 3
  if (normalizedType === 3) return 4
  if (normalizedType === 4) return 5
  return 2
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

  if (accountId) {
    await sql`
      UPDATE account_tbl
      SET
        code = ${normalizedCode},
        name = ${normalizedName},
        type = ${accountType},
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = NULL,
        finanical_list_income_id = NULL,
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
        transaction_type = 0,
        transaction_type_action = 0,
        max_transaction_amount = 0,
        max_transaction_amount_action = 0,
        max_balance_amount = 0,
        max_balance_action = NULL,
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
        finanical_list_id = 1,
        finanical_list_assests_id = 2,
        finanical_list_liabilities_id = NULL,
        finanical_list_income_id = NULL,
        father_id = ${finalFatherId},
        level_no = ${finalLevelNo},
        currency_id = ${finalCurrencyId},
        allow_trans_with_diff_curr = ${finalAllowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${finalIsCalcCurrDiffRates},
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
      1,
      2,
      NULL,
      NULL,
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
