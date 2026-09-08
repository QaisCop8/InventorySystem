import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"

const parseIds = (value: string | null) => String(value || "")
  .split(",")
  .map(Number)
  .filter((id) => Number.isInteger(id) && id > 0)

const validDate = (value: string | null, fallback: string) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback

const voucherTypeName = `CASE period.vch_type
  WHEN 4 THEN 'سند قبض' WHEN 5 THEN 'سند صرف' WHEN 6 THEN 'إشعار دائن'
  WHEN 7 THEN 'إشعار مدين' WHEN 8 THEN 'سند إدخال' WHEN 9 THEN 'سند إخراج'
  WHEN 10 THEN 'إرسالية داخلية' WHEN 11 THEN 'سند استعمال'
  WHEN 12 THEN 'فاتورة مبيعات' WHEN 13 THEN 'إرسالية مبيعات'
  WHEN 14 THEN 'إرسالية برسم البيع' WHEN 15 THEN 'مرتجع إرسالية برسم البيع'
  WHEN 16 THEN 'مرتجع مبيعات' WHEN 17 THEN 'فاتورة مشتريات'
  WHEN 18 THEN 'إرسالية مشتريات' WHEN 19 THEN 'مرتجع مشتريات'
  ELSE 'سند قيد' END`

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
    const salesmanIds = parseIds(params.get("salesman_ids"))
    const today = new Date().toISOString().slice(0, 10)
    const fromDate = validDate(params.get("from_date"), `${today.slice(0, 4)}-01-01`)
    const toDate = validDate(params.get("to_date"), today)
    const status = ["all", "draft", "posted"].includes(params.get("status") || "") ? params.get("status")! : "posted"
    const useBaseCurrency = params.get("base_currency") === "1"
    const showCounterAccounts = params.get("show_counter_accounts") === "1"
    const showCheques = kind === "receivables" && params.get("show_cheques") === "1"

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permittedBranchIds = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const effectiveBranchIds = branchIds.length
      ? branchIds.filter((id) => permittedBranchIds.length === 0 || permittedBranchIds.includes(id))
      : permittedBranchIds

    const [accounts, currencies, branches, salesmen] = await Promise.all([
      sql`SELECT a.id, a.code, a.name, a.type, a.currency_id, c.currency_code, c.currency_name
          FROM account_tbl a LEFT JOIN currency c ON c.id=a.currency_id
          WHERE COALESCE(a.status,1)<>3 AND (${kind === "accounting"} OR a.type IN (2,3,5))
          ORDER BY a.code`,
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      effectiveBranchIds.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE id=ANY(${effectiveBranchIds}::int[]) AND COALESCE(status,1)<>3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`,
      sql`SELECT id, code, name FROM salesmen WHERE COALESCE(is_active,true) ORDER BY name`,
    ])

    if (params.get("meta") === "1" || accountIds.length === 0) {
      return NextResponse.json({ meta: { accounts, currencies, branches, salesmen } })
    }
    if (branchIds.length > 0 && effectiveBranchIds.length === 0) {
      return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })
    }

    const rows = await sql`
      WITH RECURSIVE selected_accounts AS (
        SELECT id FROM account_tbl WHERE id=ANY(${accountIds}::int[])
        UNION
        SELECT child.id FROM account_tbl child JOIN selected_accounts parent ON child.father_id=parent.id
      ), scoped AS (
        SELECT vjd.*, vh.vch_code, vh.vch_date, vh.vch_type, vh.status voucher_status,
               vh.note voucher_note, vh.branch_id, vh.salesman_id,
               a.code account_code, a.name account_name,
               c.currency_code, c.currency_name,
               b.branch_name, s.name salesman_name,
               ABS(CASE WHEN ${useBaseCurrency}
                 THEN COALESCE(NULLIF(vjd.base_curr_amount,0),vjd.amount*COALESCE(vjd.rate,1))
                 ELSE vjd.amount END) line_amount
        FROM voucher_journal_detail_tbl vjd
        JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id
        JOIN account_tbl a ON a.id=vjd.account_id
        LEFT JOIN currency c ON c.id=vjd.currency_id
        LEFT JOIN branches b ON b.id=vh.branch_id
        LEFT JOIN salesmen s ON s.id=vh.salesman_id
        WHERE vjd.account_id IN (SELECT id FROM selected_accounts)
          AND ((${status === "all"} AND vh.status<>3) OR (${status === "posted"} AND vh.status=2) OR (${status === "draft"} AND vh.status=1))
          AND (${effectiveBranchIds.length === 0} OR vh.branch_id=ANY(${effectiveBranchIds}::int[]))
          AND (${currencyIds.length === 0} OR vjd.currency_id=ANY(${currencyIds}::int[]))
          AND (${salesmanIds.length === 0} OR vh.salesman_id=ANY(${salesmanIds}::int[]))
      ), opening AS (
        SELECT account_id, COALESCE(SUM(CASE WHEN credit_debit=1 THEN line_amount ELSE -line_amount END),0) opening_balance
        FROM scoped WHERE vch_date < ${fromDate}::date GROUP BY account_id
      ), period AS (
        SELECT scoped.*,
          CASE WHEN credit_debit=1 THEN line_amount ELSE 0 END debit,
          CASE WHEN credit_debit=2 THEN line_amount ELSE 0 END credit
        FROM scoped WHERE vch_date >= ${fromDate}::date AND vch_date < (${toDate}::date + INTERVAL '1 day')
      )
      SELECT period.id, period.voucher_id, period.vch_code, period.vch_date, period.vch_type,
        ${sql.unsafe(voucherTypeName)} voucher_type_name,
        period.voucher_status, period.account_id, period.account_code, period.account_name,
        period.debit, period.credit, COALESCE(opening.opening_balance,0) opening_balance,
        COALESCE(opening.opening_balance,0) + SUM(period.debit-period.credit)
          OVER (PARTITION BY period.account_id ORDER BY period.vch_date,period.voucher_id,period.order_no,period.id) balance,
        period.currency_id, period.currency_code, period.currency_name, period.rate,
        period.note, period.voucher_note, period.branch_id, period.branch_name,
        period.salesman_id, period.salesman_name,
        CASE WHEN ${showCounterAccounts} THEN (
          SELECT string_agg(DISTINCT other.code || ' - ' || other.name, '، ')
          FROM voucher_journal_detail_tbl other_line JOIN account_tbl other ON other.id=other_line.account_id
          WHERE other_line.voucher_id=period.voucher_id AND other_line.account_id<>period.account_id
        ) ELSE NULL END counter_accounts,
        CASE WHEN ${showCheques} THEN COALESCE((
          SELECT json_agg(json_build_object('number',ch.cheq_num,'amount',ch.amount,'due_date',ch.due_date,
            'bank_account',ch.bank_account,'owner',ch.cheq_owner_name,'status',cs.name) ORDER BY ch.id)
          FROM cheques_tbl ch LEFT JOIN cheque_status_tbl cs ON cs.id=ch.status_id
          WHERE ch.voucher_id=period.voucher_id
        ),'[]'::json) ELSE '[]'::json END cheques
      FROM period LEFT JOIN opening ON opening.account_id=period.account_id
      ORDER BY period.account_code,period.vch_date,period.voucher_id,period.order_no,period.id
    `

    const openingRows = await sql`
      WITH RECURSIVE selected_accounts AS (
        SELECT id FROM account_tbl WHERE id=ANY(${accountIds}::int[])
        UNION SELECT child.id FROM account_tbl child JOIN selected_accounts parent ON child.father_id=parent.id
      )
      SELECT a.id account_id,a.code account_code,a.name account_name,
        COALESCE(SUM(CASE WHEN vjd.credit_debit=1
          THEN ABS(CASE WHEN ${useBaseCurrency} THEN COALESCE(NULLIF(vjd.base_curr_amount,0),vjd.amount*COALESCE(vjd.rate,1)) ELSE vjd.amount END)
          ELSE -ABS(CASE WHEN ${useBaseCurrency} THEN COALESCE(NULLIF(vjd.base_curr_amount,0),vjd.amount*COALESCE(vjd.rate,1)) ELSE vjd.amount END) END)
          FILTER (WHERE vh.vch_date<${fromDate}::date),0) opening_balance
      FROM selected_accounts sa JOIN account_tbl a ON a.id=sa.id
      LEFT JOIN voucher_journal_detail_tbl vjd ON vjd.account_id=a.id
        AND (${currencyIds.length === 0} OR vjd.currency_id=ANY(${currencyIds}::int[]))
      LEFT JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id
        AND ((${status === "all"} AND vh.status<>3) OR (${status === "posted"} AND vh.status=2) OR (${status === "draft"} AND vh.status=1))
        AND (${effectiveBranchIds.length === 0} OR vh.branch_id=ANY(${effectiveBranchIds}::int[]))
        AND (${salesmanIds.length === 0} OR vh.salesman_id=ANY(${salesmanIds}::int[]))
      GROUP BY a.id,a.code,a.name ORDER BY a.code
    `

    const number = (value: unknown) => Number(value || 0)
    const behavior = params.get("behavior") || "all"
    const finalBalanceByAccount = new Map<number, number>()
    for (const row of rows) finalBalanceByAccount.set(Number(row.account_id), number(row.balance))
    for (const row of openingRows) {
      if (!finalBalanceByAccount.has(Number(row.account_id))) finalBalanceByAccount.set(Number(row.account_id), number(row.opening_balance))
    }
    const allowedAccounts = new Set([...finalBalanceByAccount.entries()].filter(([, balance]) =>
      behavior === "debit" ? balance > 0 : behavior === "credit" ? balance < 0 : behavior === "zero" ? balance === 0 : true,
    ).map(([accountId]) => accountId))
    const visibleRows = rows.filter((row: any) => allowedAccounts.has(Number(row.account_id)))
    const visibleOpeningRows = openingRows.filter((row: any) => allowedAccounts.has(Number(row.account_id)))
    const totalDebit = visibleRows.reduce((sum: number, row: any) => sum + number(row.debit), 0)
    const totalCredit = visibleRows.reduce((sum: number, row: any) => sum + number(row.credit), 0)
    const openingBalance = visibleOpeningRows.reduce((sum: number, row: any) => sum + number(row.opening_balance), 0)

    return NextResponse.json({
      meta: { accounts, currencies, branches, salesmen },
      rows: visibleRows,
      opening: visibleOpeningRows,
      summary: { opening_balance: openingBalance, total_debit: totalDebit, total_credit: totalCredit, final_balance: openingBalance + totalDebit - totalCredit },
      filters: { kind, from_date: fromDate, to_date: toDate, base_currency: useBaseCurrency },
    })
  } catch (error) {
    console.error("Account statement report error:", error)
    return NextResponse.json({ error: "تعذر تحميل كشف الحساب" }, { status: 500 })
  }
}
