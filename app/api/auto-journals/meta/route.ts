import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { dateOnly, getBaseCurrencyId, getRateByDate } from "@/lib/auto-journals"
import { autoJournalErrorResponse, ensureAutoJournalSchema } from "../_lib"

// بيانات مشتركة لشاشات القيود الآلية: العملات وأسعارها بالتاريخ، الحسابات الفرعية الفعالة، أنواع البطاقات.
export async function GET(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const authorization = await authorizeTransaction(request, "journal", "view")
    if (!authorization.ok) return authorization.response
    const date = dateOnly(new URL(request.url).searchParams.get("date"))

    const baseCurrencyId = await getBaseCurrencyId()
    const currencyRows = await sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`
    const currencies = []
    for (const row of currencyRows) {
      currencies.push({ ...row, id: Number(row.id), rate: (await getRateByDate(Number(row.id), date, baseCurrencyId)) ?? null })
    }

    const accounts = await sql`
      SELECT a.id, a.code, a.name, a.type, a.currency_id, a.finanical_list_id, COALESCE(a.iscalc_curr_diff_rates, false) AS iscalc_curr_diff_rates
      FROM account_tbl a
      WHERE COALESCE(a.status, 1) <> 3
        AND NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id = a.id)
      ORDER BY a.code
    `
    const cardTypes = await sql`
      SELECT id, name, main_type, currency_id FROM credit_cards_types_tbl WHERE COALESCE(status, 1) <> 3 ORDER BY name
    `

    return NextResponse.json({ date, base_currency_id: baseCurrencyId, currencies, accounts, card_types: cardTypes })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر تحميل بيانات القيود")
  }
}
