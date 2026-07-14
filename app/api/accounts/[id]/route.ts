import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 })
    }

    // Search for account by code
    const result = await sql`
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

