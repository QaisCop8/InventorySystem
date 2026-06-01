import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const statusLabelToCode = (status: string): number => {
  if (status === "موقوف") return 2
  if (status === "محذوف") return 3
  return 1
}

const statusCodeToLabel = (status: number | null | undefined): string => {
  if (status === 2) return "موقوف"
  if (status === 3) return "محذوف"
  return "نشط"
}

const toBool = (value: unknown, defaultValue = false): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value === 1
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase()
    return ["1", "true", "yes", "y", "نعم"].includes(lowered)
  }
  return defaultValue
}

const toNullableInt = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toNullableFloat = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const ensureAccountsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_tbl (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      code VARCHAR(50) NOT NULL,
      type INTEGER,
      name VARCHAR(150) NOT NULL,
      name_lang2 VARCHAR(150),
      father_id INTEGER REFERENCES account_tbl(id) ON DELETE CASCADE,
      level_no INTEGER NOT NULL,
      finanical_list_id INTEGER NOT NULL,
      finanical_list_assests_id INTEGER,
      finanical_list_liabilities_id INTEGER,
      finanical_list_income_id INTEGER,
      currency_id INTEGER,
      allow_trans_with_diff_curr BOOLEAN NOT NULL,
      iscalc_curr_diff_rates BOOLEAN NOT NULL,
      transaction_type INTEGER NOT NULL,
      transaction_type_action INTEGER NOT NULL,
      max_transaction_amount DOUBLE PRECISION NOT NULL,
      max_transaction_amount_action INTEGER NOT NULL,
      max_balance_amount DOUBLE PRECISION NOT NULL,
      max_balance_action INTEGER,
      budget_exceeding_perc DOUBLE PRECISION,
      budget_exceeding_action INTEGER,
      unified_report_account_no VARCHAR(50),
      unified_report_group_code VARCHAR(50),
      notes VARCHAR(70),
      show_notes_in_transactions_soa BOOLEAN,
      status INTEGER,
      insert_date DATE,
      last_update_date TIMESTAMPTZ,
      UNIQUE (code)
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_code ON account_tbl(code)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_type ON account_tbl(type)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_father ON account_tbl(father_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_account_tbl_status ON account_tbl(status)`
}

const ensureAccountRelatedTables = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_stop_transactions_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      voucher_types_id INTEGER,
      stop_date TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS account_costcenters_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      cost_center_type_id INTEGER,
      required_in_transactions INTEGER,
      default_cost_center_id INTEGER
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS account_classifications_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
      classification_id INTEGER NOT NULL
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_acc_stop_account_id ON account_stop_transactions_tbl(account_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_acc_cost_account_id ON account_costcenters_tbl(account_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_acc_class_account_id ON account_classifications_tbl(account_id)`
}

const mapAccountRow = (row: any) => ({
  ...row,
  status: statusCodeToLabel(Number(row.status ?? 1)),
  allow_trans_with_diff_curr: toBool(row.allow_trans_with_diff_curr),
  iscalc_curr_diff_rates: toBool(row.iscalc_curr_diff_rates),
  show_notes_in_transactions_soa: toBool(row.show_notes_in_transactions_soa),
})

export async function GET() {
  try {
    await ensureAccountsTable()
    await ensureAccountRelatedTables()

    const rows = await sql`
      SELECT
        a.id,
        a.company_id,
        a.code AS account_code,
        a.type AS classification_type_id,
        t.name AS classification_type_name,
        a.name AS account_name,
        a.name_lang2,
        a.father_id AS parent_account_id,
        pa.name AS parent_account_name,
        a.level_no,
        a.finanical_list_id,
        a.finanical_list_assests_id,
        a.finanical_list_liabilities_id,
        a.finanical_list_income_id,
        a.currency_id,
        a.allow_trans_with_diff_curr,
        a.iscalc_curr_diff_rates,
        a.transaction_type,
        a.transaction_type_action,
        a.max_transaction_amount,
        a.max_transaction_amount_action,
        a.max_balance_amount,
        a.max_balance_action,
        a.budget_exceeding_perc,
        a.budget_exceeding_action,
        a.unified_report_account_no,
        a.unified_report_group_code,
        a.notes AS description,
        a.show_notes_in_transactions_soa,
        a.status,
        a.insert_date AS created_at,
        a.last_update_date AS updated_at,
        0::NUMERIC AS opening_balance,
        0::NUMERIC AS debit_amount,
        0::NUMERIC AS credit_amount,
        0::NUMERIC AS balance
      FROM account_tbl a
      LEFT JOIN account_classification_types t ON t.id = a.type
      LEFT JOIN account_tbl pa ON pa.id = a.father_id
      WHERE COALESCE(a.status, 1) IN (1, 2)
      ORDER BY a.code ASC
    `

    const stopRows = await sql`
      SELECT id, account_id, voucher_types_id, stop_date
      FROM account_stop_transactions_tbl
      ORDER BY id ASC
    `

    const costCenterRows = await sql`
      SELECT id, account_id, cost_center_type_id, required_in_transactions, default_cost_center_id
      FROM account_costcenters_tbl
      ORDER BY id ASC
    `

    const classificationRows = await sql`
      SELECT id, account_id, classification_id
      FROM account_classifications_tbl
      ORDER BY id ASC
    `

    const stopByAccount = new Map<number, any[]>()
    for (const row of stopRows) {
      const accountId = Number(row.account_id)
      const list = stopByAccount.get(accountId) ?? []
      list.push(row)
      stopByAccount.set(accountId, list)
    }

    const costByAccount = new Map<number, any[]>()
    for (const row of costCenterRows) {
      const accountId = Number(row.account_id)
      const list = costByAccount.get(accountId) ?? []
      list.push(row)
      costByAccount.set(accountId, list)
    }

    const classByAccount = new Map<number, any[]>()
    for (const row of classificationRows) {
      const accountId = Number(row.account_id)
      const list = classByAccount.get(accountId) ?? []
      list.push(row)
      classByAccount.set(accountId, list)
    }

    const items = rows.map((row: any) =>
      mapAccountRow({
        ...row,
        stop_transactions: stopByAccount.get(Number(row.id)) ?? [],
        cost_centers: costByAccount.get(Number(row.id)) ?? [],
        account_classifications: classByAccount.get(Number(row.id)) ?? [],
      }),
    )

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching accounts:", error)
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountsTable()
    await ensureAccountRelatedTables()

    const data = await request.json()
    const accountCode = String(data.account_code ?? "").trim()
    const accountName = String(data.account_name ?? "").trim()
    const classificationTypeId = toNullableInt(data.classification_type_id)
    const parentAccountId = toNullableInt(data.parent_account_id)
    const companyId = Number(data.company_id ?? 1)
    const nameLang2 = String(data.name_lang2 ?? "").trim() || null
    const levelNo = Number(data.level_no ?? (parentAccountId ? 2 : 1))
    const financialListId = Number(data.finanical_list_id ?? 1)
    const financialAssetsId = toNullableInt(data.finanical_list_assests_id)
    const financialLiabilitiesId = toNullableInt(data.finanical_list_liabilities_id)
    const financialIncomeId = toNullableInt(data.finanical_list_income_id)
    const currencyId = toNullableInt(data.currency_id)
    const allowTransWithDiffCurr = toBool(data.allow_trans_with_diff_curr, false)
    const isCalcCurrDiffRates = toBool(data.iscalc_curr_diff_rates, false)
    const transactionType = Number(data.transaction_type ?? 0)
    const transactionTypeAction = Number(data.transaction_type_action ?? 0)
    const maxTransactionAmount = Number(data.max_transaction_amount ?? 0)
    const maxTransactionAmountAction = Number(data.max_transaction_amount_action ?? 0)
    const maxBalanceAmount = Number(data.max_balance_amount ?? 0)
    const maxBalanceAction = toNullableInt(data.max_balance_action)
    const budgetExceedingPerc = toNullableFloat(data.budget_exceeding_perc)
    const budgetExceedingAction = toNullableInt(data.budget_exceeding_action)
    const unifiedReportAccountNo = String(data.unified_report_account_no ?? "").trim() || null
    const unifiedReportGroupCode = String(data.unified_report_group_code ?? "").trim() || null
    const description = String(data.description ?? "").trim() || null
    const showNotesInTransactionsSoa = toBool(data.show_notes_in_transactions_soa, false)
    const statusLabel = String(data.status ?? "نشط").trim()
    const statusCode = statusLabelToCode(statusLabel)

    const stopTransactions = Array.isArray(data.stop_transactions) ? data.stop_transactions : []
    const costCenters = Array.isArray(data.cost_centers) ? data.cost_centers : []
    const accountClassifications = Array.isArray(data.account_classifications) ? data.account_classifications : []

    if (!accountCode) {
      return NextResponse.json({ error: "رقم الحساب مطلوب" }, { status: 400 })
    }

    if (!accountName) {
      return NextResponse.json({ error: "اسم الحساب مطلوب" }, { status: 400 })
    }

    if (!classificationTypeId) {
      return NextResponse.json({ error: "نوع الحساب مطلوب" }, { status: 400 })
    }

    const existingCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${accountCode})`
    if (existingCode.length > 0) {
      return NextResponse.json({ error: "رقم الحساب موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`SELECT id FROM account_classification_types WHERE id = ${classificationTypeId}`
    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع الحساب غير موجود" }, { status: 400 })
    }

    if (parentAccountId !== null) {
      const parentExists = await sql`SELECT id FROM account_tbl WHERE id = ${parentAccountId}`
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const inserted = await sql`
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
        ${companyId},
        ${accountCode},
        ${classificationTypeId},
        ${accountName},
        ${nameLang2},
        ${parentAccountId},
        ${levelNo},
        ${financialListId},
        ${financialAssetsId},
        ${financialLiabilitiesId},
        ${financialIncomeId},
        ${currencyId},
        ${allowTransWithDiffCurr},
        ${isCalcCurrDiffRates},
        ${transactionType},
        ${transactionTypeAction},
        ${maxTransactionAmount},
        ${maxTransactionAmountAction},
        ${maxBalanceAmount},
        ${maxBalanceAction},
        ${budgetExceedingPerc},
        ${budgetExceedingAction},
        ${unifiedReportAccountNo},
        ${unifiedReportGroupCode},
        ${description},
        ${showNotesInTransactionsSoa},
        ${statusCode},
        CURRENT_DATE,
        CURRENT_TIMESTAMP
      )
      RETURNING id
    `

    const accountId = Number(inserted[0].id)

    for (const row of stopTransactions) {
      const voucherTypeId = toNullableInt(row?.voucher_types_id)
      if (!voucherTypeId) continue
      const stopDateValue = row?.stop_date ? String(row.stop_date) : null
      await sql`
        INSERT INTO account_stop_transactions_tbl (account_id, voucher_types_id, stop_date)
        VALUES (${accountId}, ${voucherTypeId}, ${stopDateValue})
      `
    }

    for (const row of costCenters) {
      const costCenterTypeId = toNullableInt(row?.cost_center_type_id)
      const requiredInTransactions = toNullableInt(row?.required_in_transactions)
      const defaultCostCenterId = toNullableInt(row?.default_cost_center_id)
      if (!costCenterTypeId && !defaultCostCenterId) continue
      await sql`
        INSERT INTO account_costcenters_tbl (account_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
        VALUES (${accountId}, ${costCenterTypeId}, ${requiredInTransactions}, ${defaultCostCenterId})
      `
    }

    for (const row of accountClassifications) {
      const classificationId = toNullableInt(row?.classification_id)
      if (!classificationId) continue
      await sql`
        INSERT INTO account_classifications_tbl (account_id, classification_id)
        VALUES (${accountId}, ${classificationId})
      `
    }

    const createdRows = await sql`
      SELECT
        a.id,
        a.company_id,
        a.code AS account_code,
        a.type AS classification_type_id,
        t.name AS classification_type_name,
        a.name AS account_name,
        a.name_lang2,
        a.father_id AS parent_account_id,
        pa.name AS parent_account_name,
        a.level_no,
        a.finanical_list_id,
        a.finanical_list_assests_id,
        a.finanical_list_liabilities_id,
        a.finanical_list_income_id,
        a.currency_id,
        a.allow_trans_with_diff_curr,
        a.iscalc_curr_diff_rates,
        a.transaction_type,
        a.transaction_type_action,
        a.max_transaction_amount,
        a.max_transaction_amount_action,
        a.max_balance_amount,
        a.max_balance_action,
        a.budget_exceeding_perc,
        a.budget_exceeding_action,
        a.unified_report_account_no,
        a.unified_report_group_code,
        a.notes AS description,
        a.show_notes_in_transactions_soa,
        a.status,
        a.insert_date AS created_at,
        a.last_update_date AS updated_at,
        0::NUMERIC AS opening_balance,
        0::NUMERIC AS debit_amount,
        0::NUMERIC AS credit_amount,
        0::NUMERIC AS balance
      FROM account_tbl a
      LEFT JOIN account_classification_types t ON t.id = a.type
      LEFT JOIN account_tbl pa ON pa.id = a.father_id
      WHERE a.id = ${accountId}
    `

    const stopRows = await sql`
      SELECT id, account_id, voucher_types_id, stop_date
      FROM account_stop_transactions_tbl
      WHERE account_id = ${accountId}
      ORDER BY id ASC
    `

    const costRows = await sql`
      SELECT id, account_id, cost_center_type_id, required_in_transactions, default_cost_center_id
      FROM account_costcenters_tbl
      WHERE account_id = ${accountId}
      ORDER BY id ASC
    `

    const classRows = await sql`
      SELECT id, account_id, classification_id
      FROM account_classifications_tbl
      WHERE account_id = ${accountId}
      ORDER BY id ASC
    `

    const item = mapAccountRow({
      ...createdRows[0],
      stop_transactions: stopRows,
      cost_centers: costRows,
      account_classifications: classRows,
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error("Error creating account:", error)
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
  }
}
