import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { reportAmountSql } from "@/lib/report-currency"

const parseIds = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const validDate = (value: string | null, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAccountsTable()
    await ensureVoucherTables()

    const params = request.nextUrl.searchParams
    const kind = params.get("kind") === "receivables" ? "receivables" : "accounting"
    const accountIds = parseIds(params.get("account_ids"))
    const currencyIds = parseIds(params.get("currency_ids"))
    const branchIds = parseIds(params.get("branch_ids"))
    const date = validDate(params.get("to_date"), new Date().toISOString().slice(0, 10))
    const behavior = params.get("behavior") || "all"
    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permittedBranchIds = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const effectiveBranchIds = branchIds.length ? branchIds.filter((id) => permittedBranchIds.length === 0 || permittedBranchIds.includes(id)) : permittedBranchIds

    const [accounts, currencies, branches] = await Promise.all([
      sql`SELECT a.id,a.code,a.name,a.type,a.currency_id,c.currency_code,c.currency_name FROM account_tbl a LEFT JOIN currency c ON c.id=a.currency_id WHERE COALESCE(a.status,1)<>3 AND (${kind === "receivables"} OR NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id=a.id AND COALESCE(child.status,1)<>3)) AND (${kind === "accounting"} OR a.type IN (2,3,5)) ORDER BY a.code`,
      sql`SELECT id,currency_code,currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      effectiveBranchIds.length ? sql`SELECT id,branch_code,branch_name FROM branches WHERE id=ANY(${effectiveBranchIds}::int[]) AND COALESCE(status,1)<>3 ORDER BY branch_name` : sql`SELECT id,branch_code,branch_name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`,
    ])
    const meta = { accounts, currencies, branches }
    if (params.get("meta") === "1" || accountIds.length === 0) return NextResponse.json({ meta })
    if (branchIds.length && !effectiveBranchIds.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const selectedCurrency = Number(params.get("report_currency_id") || currencies[0]?.id || 0)
    const baseCurrency = Number(currencies[0]?.id || selectedCurrency)
    const targetCurrency = currencies.find((currency: any) => Number(currency.id) === selectedCurrency)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })
    const amountSql = reportAmountSql(selectedCurrency, baseCurrency)

    const rows = await sql`
      WITH RECURSIVE selected_accounts AS (
        SELECT id FROM account_tbl WHERE id=ANY(${accountIds}::int[]) AND (${kind === "receivables"} OR NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id=account_tbl.id AND COALESCE(child.status,1)<>3))
        UNION SELECT child.id FROM account_tbl child JOIN selected_accounts parent ON child.father_id=parent.id
      ), balances AS (
        SELECT a.id account_id,a.code account_code,a.name account_name,a.type,a.currency_id,
          COALESCE(SUM(CASE WHEN vh.id IS NOT NULL AND vjd.credit_debit=1 THEN ${sql.unsafe(amountSql)} ELSE 0 END),0) debit,
          COALESCE(SUM(CASE WHEN vh.id IS NOT NULL AND vjd.credit_debit=2 THEN ${sql.unsafe(amountSql)} ELSE 0 END),0) credit
        FROM selected_accounts sa JOIN account_tbl a ON a.id=sa.id
          AND (${kind === "receivables"} OR NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id=a.id AND COALESCE(child.status,1)<>3))
        LEFT JOIN voucher_journal_detail_tbl vjd ON vjd.account_id=a.id
          AND (${currencyIds.length === 0} OR vjd.currency_id=ANY(${currencyIds}::int[]))
        LEFT JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id AND vh.vch_date <= ${date}::date AND vh.status<>3
          AND (${effectiveBranchIds.length === 0} OR vh.branch_id=ANY(${effectiveBranchIds}::int[]))
        GROUP BY a.id,a.code,a.name,a.type,a.currency_id
      )
      SELECT b.*,c.currency_code,c.currency_name,(b.debit-b.credit) balance
      FROM balances b LEFT JOIN currency c ON c.id=b.currency_id
      WHERE (${behavior === "debit"} AND b.debit-b.credit>0) OR (${behavior === "credit"} AND b.debit-b.credit<0) OR (${behavior === "zero"} AND b.debit-b.credit=0) OR (${behavior === "all"})
      ORDER BY b.account_code
    `
    const totalDebit = rows.reduce((sum: number, row: any) => sum + Number(row.debit || 0), 0)
    const totalCredit = rows.reduce((sum: number, row: any) => sum + Number(row.credit || 0), 0)
    return NextResponse.json({ meta, rows: rows.map((row: any) => ({ ...row, currency_id: selectedCurrency, currency_code: targetCurrency.currency_code, currency_name: targetCurrency.currency_name })), summary: { total_debit: totalDebit, total_credit: totalCredit, balance: totalDebit - totalCredit }, filters: { kind, to_date: date, report_currency_id: selectedCurrency } })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ إحدى الحركات. يرجى تعريف سعر الصرف وإعادة عرض التقرير." }, { status: 400 })
    }
    console.error("Account balances report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير الأرصدة" }, { status: 500 })
  }
}
