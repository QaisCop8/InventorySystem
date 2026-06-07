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
      allow_trans_with_diff_curr INTEGER NOT NULL,
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

  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'account_tbl'
          AND column_name = 'allow_trans_with_diff_curr'
          AND data_type = 'boolean'
      ) THEN
        ALTER TABLE account_tbl
        ALTER COLUMN allow_trans_with_diff_curr TYPE INTEGER
        USING CASE WHEN allow_trans_with_diff_curr THEN 1 ELSE 0 END;
      END IF;
    END$$;
  `
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
}

const mapAccountRow = (row: any) => ({
  ...row,
  status: statusCodeToLabel(Number(row.status ?? 1)),
  allow_trans_with_diff_curr: row.allow_trans_with_diff_curr != null ? Number(row.allow_trans_with_diff_curr) : 0,
  iscalc_curr_diff_rates: toBool(row.iscalc_curr_diff_rates),
  show_notes_in_transactions_soa: toBool(row.show_notes_in_transactions_soa),
})

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountsTable()
    await ensureAccountRelatedTables()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    // Support both naming conventions: account_code/account_name (API) and code/name (frontend)
    let accountCode = String(data.account_code ?? data.code ?? "").trim()
    const accountName = String(data.account_name ?? data.name ?? "").trim()
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
    let allowTransWithDiffCurr = Number(data.allow_trans_with_diff_curr ?? 0)
    if (!Number.isFinite(allowTransWithDiffCurr) || ![0, 1, 2].includes(allowTransWithDiffCurr)) {
      allowTransWithDiffCurr = 0
    }
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

    /*if (!classificationTypeId) {
      return NextResponse.json({ error: "نوع الحساب مطلوب" }, { status: 400 })
    }*/

    const existingCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${accountCode}) AND id <> ${id}`
    if (existingCode.length > 0) {
      // If id is 0 (new record), generate the next sequential code instead of erroring
      if (id === 0) {
        // Extract numeric part from code (e.g., "A0000002" -> 2)
        const match = accountCode.match(/^([A-Za-z]*)(\d+)$/)
        if (match) {
          const prefix = match[1]
          const currentNumber = parseInt(match[2], 10)
          const nextNumber = currentNumber + 1
          const numberLength = match[2].length
          const newCode = prefix + String(nextNumber).padStart(numberLength, '0')
          accountCode = newCode
        } else {
          // If code doesn't have numeric pattern, append _1
          let counter = 1
          let newCode = `${accountCode}_${counter}`
          while (true) {
            const checkCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${newCode})`
            if (checkCode.length === 0) {
              accountCode = newCode
              break
            }
            counter++
          }
        }
      } else {
        return NextResponse.json({ error: "رقم الحساب موجود مسبقاً" }, { status: 400 })
      }
    }

    /*const typeExists = await sql`SELECT id FROM account_classification_types WHERE id = ${classificationTypeId}`
    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع الحساب غير موجود" }, { status: 400 })
    }*/

    if (parentAccountId !== null) {
      const parentExists = await sql`SELECT id FROM account_tbl WHERE id = ${parentAccountId} AND id <> ${id}`
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const updated = await sql`
      UPDATE account_tbl
      SET
        company_id = ${companyId},
        code = ${accountCode},
        type = ${classificationTypeId},
        name = ${accountName},
        name_lang2 = ${nameLang2},
        father_id = ${parentAccountId},
        level_no = ${levelNo},
        finanical_list_id = ${financialListId},
        finanical_list_assests_id = ${financialAssetsId},
        finanical_list_liabilities_id = ${financialLiabilitiesId},
        finanical_list_income_id = ${financialIncomeId},
        currency_id = ${currencyId},
        allow_trans_with_diff_curr = ${allowTransWithDiffCurr},
        iscalc_curr_diff_rates = ${isCalcCurrDiffRates},
        transaction_type = ${transactionType},
        transaction_type_action = ${transactionTypeAction},
        max_transaction_amount = ${maxTransactionAmount},
        max_transaction_amount_action = ${maxTransactionAmountAction},
        max_balance_amount = ${maxBalanceAmount},
        max_balance_action = ${maxBalanceAction},
        budget_exceeding_perc = ${budgetExceedingPerc},
        budget_exceeding_action = ${budgetExceedingAction},
        unified_report_account_no = ${unifiedReportAccountNo},
        unified_report_group_code = ${unifiedReportGroupCode},
        notes = ${description},
        show_notes_in_transactions_soa = ${showNotesInTransactionsSoa},
        status = ${statusCode},
        last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (updated.length === 0) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    }

    await sql`DELETE FROM account_stop_transactions_tbl WHERE account_id = ${id}`
    await sql`DELETE FROM account_costcenters_tbl WHERE account_id = ${id}`
    await sql`DELETE FROM account_classifications_tbl WHERE account_id = ${id}`

    for (const row of stopTransactions) {
      const voucherTypeId = toNullableInt(row?.voucher_types_id)
      if (!voucherTypeId) continue
      const stopDateValue = row?.stop_date ? String(row.stop_date) : null
      await sql`
        INSERT INTO account_stop_transactions_tbl (account_id, voucher_types_id, stop_date)
        VALUES (${id}, ${voucherTypeId}, ${stopDateValue})
      `
    }

    for (const row of costCenters) {
      const costCenterTypeId = toNullableInt(row?.cost_center_type_id)
      const requiredInTransactions = toNullableInt(row?.required_in_transactions)
      const defaultCostCenterId = toNullableInt(row?.default_cost_center_id)
      if (!costCenterTypeId && !defaultCostCenterId) continue
      await sql`
        INSERT INTO account_costcenters_tbl (account_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
        VALUES (${id}, ${costCenterTypeId}, ${requiredInTransactions}, ${defaultCostCenterId})
      `
    }

    for (const row of accountClassifications) {
      const classificationId = toNullableInt(row?.classification_id)
      if (!classificationId) continue
      await sql`
        INSERT INTO account_classifications_tbl (account_id, classification_id)
        VALUES (${id}, ${classificationId})
      `
    }

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
      WHERE a.id = ${id}
    `

    const stopRows = await sql`
      SELECT id, account_id, voucher_types_id, stop_date
      FROM account_stop_transactions_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    const costRows = await sql`
      SELECT id, account_id, cost_center_type_id, required_in_transactions, default_cost_center_id
      FROM account_costcenters_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    const classRows = await sql`
      SELECT id, account_id, classification_id
      FROM account_classifications_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    return NextResponse.json(
      mapAccountRow({
        ...rows[0],
        stop_transactions: stopRows,
        cost_centers: costRows,
        account_classifications: classRows,
      }),
    )
  } catch (error) {
    console.error("Error updating account:", error)
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountsTable()
    await ensureAccountRelatedTables()

    const data = await request.json()
    // Support both naming conventions: account_code/account_name (API) and code/name (frontend)
    let accountCode = String(data.account_code ?? data.code ?? "").trim()
    const accountName = String(data.account_name ?? data.name ?? "").trim()
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
    let allowTransWithDiffCurr = Number(data.allow_trans_with_diff_curr ?? 0)
    if (!Number.isFinite(allowTransWithDiffCurr) || ![0, 1, 2].includes(allowTransWithDiffCurr)) {
      allowTransWithDiffCurr = 0
    }
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

    // Check if code already exists
    const existingCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${accountCode})`
    if (existingCode.length > 0) {
      // Generate the next sequential code instead of erroring
      const match = accountCode.match(/^([A-Za-z]*)(\d+)$/)
      if (match) {
        const prefix = match[1]
        const currentNumber = parseInt(match[2], 10)
        const nextNumber = currentNumber + 1
        const numberLength = match[2].length
        const newCode = prefix + String(nextNumber).padStart(numberLength, '0')
        accountCode = newCode
      } else {
        // If code doesn't have numeric pattern, append _1
        let counter = 1
        let newCode = `${accountCode}_${counter}`
        while (true) {
          const checkCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${newCode})`
          if (checkCode.length === 0) {
            accountCode = newCode
            break
          }
          counter++
        }
      }
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
      )
      VALUES (
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

    const id = inserted[0].id

    for (const row of stopTransactions) {
      const voucherTypeId = toNullableInt(row?.voucher_types_id)
      if (!voucherTypeId) continue
      const stopDateValue = row?.stop_date ? String(row.stop_date) : null
      await sql`
        INSERT INTO account_stop_transactions_tbl (account_id, voucher_types_id, stop_date)
        VALUES (${id}, ${voucherTypeId}, ${stopDateValue})
      `
    }

    for (const row of costCenters) {
      const costCenterTypeId = toNullableInt(row?.cost_center_type_id)
      const requiredInTransactions = toNullableInt(row?.required_in_transactions)
      const defaultCostCenterId = toNullableInt(row?.default_cost_center_id)
      if (!costCenterTypeId && !defaultCostCenterId) continue
      await sql`
        INSERT INTO account_costcenters_tbl (account_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
        VALUES (${id}, ${costCenterTypeId}, ${requiredInTransactions}, ${defaultCostCenterId})
      `
    }

    for (const row of accountClassifications) {
      const classificationId = toNullableInt(row?.classification_id)
      if (!classificationId) continue
      await sql`
        INSERT INTO account_classifications_tbl (account_id, classification_id)
        VALUES (${id}, ${classificationId})
      `
    }

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
      WHERE a.id = ${id}
    `

    const stopRows = await sql`
      SELECT id, account_id, voucher_types_id, stop_date
      FROM account_stop_transactions_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    const costRows = await sql`
      SELECT id, account_id, cost_center_type_id, required_in_transactions, default_cost_center_id
      FROM account_costcenters_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    const classRows = await sql`
      SELECT id, account_id, classification_id
      FROM account_classifications_tbl
      WHERE account_id = ${id}
      ORDER BY id ASC
    `

    return NextResponse.json(
      mapAccountRow({
        ...rows[0],
        stop_transactions: stopRows,
        cost_centers: costRows,
        account_classifications: classRows,
      }),
    )
  } catch (error) {
    console.error("Error creating account:", error)
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE account_tbl
      SET status = 3, last_update_date = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting account:", error)
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
  }
}
