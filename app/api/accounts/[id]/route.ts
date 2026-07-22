import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  statusLabelToCode,
  toBool,
  toNullableInt,
  toNullableFloat,
  ensureAccountsTable,
  ensureAccountRelatedTables,
  mapAccountRow,
} from "../_lib"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    // Try to extract numeric id from the path if present (e.g. /api/accounts/1715)
    const pathname = new URL(request.url).pathname
    const pathSegments = pathname.split("/").filter(Boolean)
    const lastSegment = pathSegments[pathSegments.length - 1]
    const numericId = lastSegment && /^[0-9]+$/.test(lastSegment) ? Number(lastSegment) : null

    let result

    if (numericId) {
      // Search by numeric id
      result = await sql`
        SELECT
          a.id,
          a.company_id,
          a.code,
          a.type,
          a.name,
          a.name_lang2,
          a.father_id,
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
          a.notes,
          a.show_notes_in_transactions_soa,
          a.status,
          a.insert_date,
          a.last_update_date
        FROM account_tbl a
        WHERE a.id = ${numericId}
        LIMIT 1
      `
    } else {
      if (!code) {
        return NextResponse.json({ error: "Code or id is required" }, { status: 400 })
      }

      // Search for account by code
      result = await sql`
        SELECT
          a.id,
          a.company_id,
          a.code,
          a.type,
          a.name,
          a.name_lang2,
          a.father_id,
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
          a.notes,
          a.show_notes_in_transactions_soa,
          a.status,
          a.insert_date,
          a.last_update_date
        FROM account_tbl a
        WHERE a.code = ${code}
        LIMIT 1
      `
    }

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const account = result[0]

    const stopRows = await sql`
      SELECT id, account_id, voucher_types_id, stop_date
      FROM account_stop_transactions_tbl
      WHERE account_id = ${account.id}
      ORDER BY id ASC
    `

    // If account status is 3 (محذوف - deleted), return 403
    if (account.status === 3) {
      return NextResponse.json({ error: "Account deleted" }, { status: 403 })
    }

    // Return account data
    return NextResponse.json({
      id: account.id,
      code: account.code,
      name: account.name,
      name_lang2: account.name_lang2,
      type: account.type,
      father_id: account.father_id,
      level_no: account.level_no,
      finanical_list_id: account.finanical_list_id,
      finanical_list_assests_id: account.finanical_list_assests_id,
      finanical_list_liabilities_id: account.finanical_list_liabilities_id,
      finanical_list_income_id: account.finanical_list_income_id,
      currency_id: account.currency_id,
      allow_trans_with_diff_curr: account.allow_trans_with_diff_curr,
      iscalc_curr_diff_rates: account.iscalc_curr_diff_rates,
      transaction_type: account.transaction_type,
      transaction_type_action: account.transaction_type_action,
      max_transaction_amount: account.max_transaction_amount,
      max_transaction_amount_action: account.max_transaction_amount_action,
      max_balance_amount: account.max_balance_amount,
      max_balance_action: account.max_balance_action,
      budget_exceeding_perc: account.budget_exceeding_perc,
      budget_exceeding_action: account.budget_exceeding_action,
      unified_report_account_no: account.unified_report_account_no,
      unified_report_group_code: account.unified_report_group_code,
      notes: account.notes,
      show_notes_in_transactions_soa: account.show_notes_in_transactions_soa,
      status: account.status,
      stop_transactions: stopRows,
    })
  } catch (error) {
    console.error("Error searching account:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// كان هذا المسار بلا PUT إطلاقاً — أي تعديل لحساب موجود كان يصطدم بـ 405 بلا محتوى JSON، ما يُسبب
// "Unexpected end of JSON input" عند محاولة العميل قراءة رد فارغ كـ JSON. المنطق هنا يطابق POST في
// route.ts (نفس الحقول والتحقق) لكن كتحديث بدل إدراج، مع استبدال صفوف الجداول التابعة بالكامل.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountsTable()
    await ensureAccountRelatedTables()

    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف الحساب غير صالح" }, { status: 400 })
    }

    const existingAccount = await sql`SELECT id FROM account_tbl WHERE id = ${id}`
    if (existingAccount.length === 0) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 })
    }

    const data = await request.json()
    const accountCode = String(data.account_code ?? data.code ?? "").trim()
    const accountName = String(data.account_name ?? data.name ?? "").trim()
    const parentCode = String(data.parent_code ?? data.father_code ?? "").trim()
    let parentAccountId = toNullableInt(data.parent_account_id ?? data.father_id)
    const nameLang2 = String(data.name_lang2 ?? "").trim() || null
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
    const description = String(data.description ?? data.notes ?? "").trim() || null
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

    if (parentAccountId === null && parentCode) {
      const parentByCode = await sql`SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${parentCode}) LIMIT 1`
      if (parentByCode.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
      parentAccountId = Number(parentByCode[0].id)
    }

    if (parentAccountId !== null) {
      if (parentAccountId === id) {
        return NextResponse.json({ error: "لا يمكن ان يكون الحساب اب لنفسه" }, { status: 400 })
      }
      const parentExists = await sql`SELECT id FROM account_tbl WHERE id = ${parentAccountId}`
      if (parentExists.length === 0) {
        return NextResponse.json({ error: "الحساب الرئيسي غير موجود" }, { status: 400 })
      }
    }

    const levelNo = Number(data.level_no ?? (parentAccountId ? 2 : 1))

    const codeTaken = await sql`
      SELECT id FROM account_tbl WHERE LOWER(code) = LOWER(${accountCode}) AND id != ${id} AND status IN (1, 2) LIMIT 1
    `
    if (codeTaken.length > 0) {
      return NextResponse.json({ error: "رقم الحساب مستخدم مسبقاً" }, { status: 400 })
    }

    await sql`
      UPDATE account_tbl SET
        code = ${accountCode},
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
    `

    await sql`DELETE FROM account_stop_transactions_tbl WHERE account_id = ${id}`
    for (const row of stopTransactions) {
      const voucherTypeId = toNullableInt(row?.voucher_types_id)
      if (!voucherTypeId) continue
      const stopDateValue = row?.stop_date ? String(row.stop_date) : null
      await sql`
        INSERT INTO account_stop_transactions_tbl (account_id, voucher_types_id, stop_date)
        VALUES (${id}, ${voucherTypeId}, ${stopDateValue})
      `
    }

    await sql`DELETE FROM account_costcenters_tbl WHERE account_id = ${id}`
    for (const row of costCenters) {
      const costCenterTypeId = toNullableInt(row?.cost_center_type_id)
      const requiredInTransactions = toNullableInt(row?.required_in_transactions ?? row?.status_id)
      const defaultCostCenterId = toNullableInt(row?.default_cost_center_id)
      if (!costCenterTypeId || !defaultCostCenterId) continue
      await sql`
        INSERT INTO account_costcenters_tbl (account_id, cost_center_type_id, required_in_transactions, default_cost_center_id)
        VALUES (${id}, ${costCenterTypeId}, ${requiredInTransactions}, ${defaultCostCenterId})
      `
    }

    await sql`DELETE FROM account_classifications_tbl WHERE account_id = ${id}`
    for (const row of accountClassifications) {
      const classificationId = toNullableInt(row?.classification_id)
      if (!classificationId) continue
      await sql`
        INSERT INTO account_classifications_tbl (account_id, classification_id)
        VALUES (${id}, ${classificationId})
      `
    }

    const updatedRows = await sql`
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
      SELECT id, account_id, voucher_types_id, stop_date FROM account_stop_transactions_tbl
      WHERE account_id = ${id} ORDER BY id ASC
    `
    const costRows = await sql`
      SELECT id, account_id, cost_center_type_id, required_in_transactions, default_cost_center_id
      FROM account_costcenters_tbl WHERE account_id = ${id} ORDER BY id ASC
    `
    const classRows = await sql`
      SELECT id, account_id, classification_id FROM account_classifications_tbl
      WHERE account_id = ${id} ORDER BY id ASC
    `

    const item = mapAccountRow({
      ...updatedRows[0],
      stop_transactions: stopRows,
      cost_centers: costRows,
      account_classifications: classRows,
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error updating account:", error)
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 })
  }
}

