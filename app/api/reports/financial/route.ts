import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"

const TYPES = ["vouchers", "transactions", "trial-balance", "balance-sheet", "income-statement"] as const
type ReportType = (typeof TYPES)[number]
const ids = (value: string | null) => String(value || "").split(",").map(Number).filter(value => Number.isInteger(value) && value > 0)
const date = (value: string | null, fallback: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback
const voucherNames: Record<number, string> = { 4:"سند قبض",5:"سند صرف",6:"إشعار دائن",7:"إشعار مدين",8:"سند إدخال",9:"سند إخراج",10:"إرسالية داخلية",11:"سند استعمال",12:"فاتورة مبيعات",13:"إرسالية مبيعات",14:"إرسالية برسم البيع",15:"مرتجع إرسالية برسم البيع",16:"مرتجع مبيعات",17:"فاتورة مشتريات",18:"إرسالية مشتريات",19:"مرتجع مشتريات",20:"طلب صناعة داخلي" }
const voucherCase = `CASE vh.vch_type ${Object.entries(voucherNames).map(([id,name]) => `WHEN ${id} THEN '${name}'`).join(" ")} ELSE 'سند قيد' END`

async function ensureFinancialDefinitions() {
  await sql`CREATE TABLE IF NOT EXISTS balance_sheet_assets_items (id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,status INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE TABLE IF NOT EXISTS balance_sheet_liabilities_items (id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,status INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE TABLE IF NOT EXISTS income_statement_items (id SERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,status INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAccountsTable(); await ensureVoucherTables(); await ensureFinancialDefinitions()

    const p = request.nextUrl.searchParams
    const reportType = (TYPES.includes(p.get("type") as ReportType) ? p.get("type") : "transactions") as ReportType
    const today = new Date().toISOString().slice(0,10)
    const fromDate = date(p.get("from_date"), `${today.slice(0,4)}-01-01`)
    const toDate = date(p.get("to_date"), today)
    const accountIds = ids(p.get("account_ids")), currencyIds = ids(p.get("currency_ids")), branchIds = ids(p.get("branch_ids")), salesmanIds = ids(p.get("salesman_ids")), voucherTypes = ids(p.get("voucher_types"))
    const level = Math.max(0, Number(p.get("level")) || 0)
    const status = ["all","draft","posted"].includes(p.get("status") || "") ? p.get("status")! : "posted"
    const includeZero = p.get("include_zero") === "1", baseCurrency = p.get("base_currency") === "1", showCounter = p.get("show_counter_accounts") === "1"
    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id=${user.user_id}`
    const permitted = memberships.map((row:any)=>Number(row.branch_id)).filter(Number.isFinite)
    const effectiveBranches = branchIds.length ? branchIds.filter(id => !permitted.length || permitted.includes(id)) : permitted
    if (branchIds.length && !effectiveBranches.length) return NextResponse.json({ error:"لا تملك صلاحية على الفروع المحددة" },{status:403})

    const [accounts,currencies,branches,salesmen] = await Promise.all([
      sql`SELECT id,code,name,type,level_no,currency_id FROM account_tbl WHERE COALESCE(status,1)<>3 ORDER BY code`,
      sql`SELECT id,currency_code,currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      effectiveBranches.length ? sql`SELECT id,branch_code,branch_name FROM branches WHERE id=ANY(${effectiveBranches}::int[]) AND COALESCE(status,1)<>3 ORDER BY branch_name` : sql`SELECT id,branch_code,branch_name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`,
      sql`SELECT id,code,name FROM salesmen WHERE COALESCE(is_active,true) ORDER BY name`,
    ])
    const meta = { accounts,currencies,branches,salesmen,voucher_types:Object.entries(voucherNames).map(([id,name])=>({id:Number(id),name})) }
    if (p.get("meta") === "1") return NextResponse.json({meta})

    const amount = `ABS(CASE WHEN ${baseCurrency ? "TRUE" : "FALSE"} THEN COALESCE(NULLIF(vjd.base_curr_amount,0),vjd.amount*COALESCE(vjd.rate,1)) ELSE vjd.amount END)`
    const list = (values:number[]) => values.join(",")
    // Every interpolated list contains validated positive integers only; the remaining choices
    // come from closed enums above. Keeping this fragment parameter-free also avoids nested
    // placeholder numbering when it is inserted after SELECT parameters.
    const common = sql.unsafe(`
      ${status === "posted" ? "vh.status=2" : status === "draft" ? "vh.status=1" : "vh.status<>3"}
      AND ${effectiveBranches.length ? `vh.branch_id=ANY(ARRAY[${list(effectiveBranches)}]::int[])` : "TRUE"}
      AND ${currencyIds.length ? `vjd.currency_id=ANY(ARRAY[${list(currencyIds)}]::int[])` : "TRUE"}
      AND ${salesmanIds.length ? `vh.salesman_id=ANY(ARRAY[${list(salesmanIds)}]::int[])` : "TRUE"}
      AND ${voucherTypes.length ? `vh.vch_type=ANY(ARRAY[${list(voucherTypes)}]::int[])` : "TRUE"}
      AND ${accountIds.length ? `vjd.account_id=ANY(ARRAY[${list(accountIds)}]::int[])` : "TRUE"}
    `)

    let rows: any[] = []
    if (reportType === "transactions") {
      rows = await sql`SELECT vjd.id,vjd.voucher_id,vh.vch_date,vh.vch_code,vh.vch_type,${sql.unsafe(voucherCase)} voucher_type_name,
        vh.status voucher_status,a.code account_code,a.name account_name,
        CASE WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE 0 END debit,
        CASE WHEN vjd.credit_debit=2 THEN ${sql.unsafe(amount)} ELSE 0 END credit,
        c.currency_code,c.currency_name,vjd.rate,COALESCE(vjd.note,vh.note) note,b.branch_name,s.name salesman_name,
        CASE WHEN ${showCounter} THEN (SELECT string_agg(DISTINCT oa.code||' - '||oa.name,'، ') FROM voucher_journal_detail_tbl ov JOIN account_tbl oa ON oa.id=ov.account_id WHERE ov.voucher_id=vjd.voucher_id AND ov.account_id<>vjd.account_id) END counter_accounts
        FROM voucher_journal_detail_tbl vjd JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id JOIN account_tbl a ON a.id=vjd.account_id
        LEFT JOIN currency c ON c.id=vjd.currency_id LEFT JOIN branches b ON b.id=vh.branch_id LEFT JOIN salesmen s ON s.id=vh.salesman_id
        WHERE ${common} AND vh.vch_date>=${fromDate}::date AND vh.vch_date<(${toDate}::date+INTERVAL '1 day')
        ORDER BY vh.vch_date,vh.id,vjd.order_no,vjd.id LIMIT 10000`
    } else if (reportType === "vouchers") {
      rows = await sql`WITH selected AS (SELECT DISTINCT vh.id FROM voucher_header_tbl vh JOIN voucher_journal_detail_tbl vjd ON vjd.voucher_id=vh.id WHERE ${common} AND vh.vch_date>=${fromDate}::date AND vh.vch_date<(${toDate}::date+INTERVAL '1 day'))
        SELECT vh.id,vh.vch_date,vh.vch_code,vh.vch_type,${sql.unsafe(voucherCase)} voucher_type_name,vh.status voucher_status,
          c.currency_code,c.currency_name,vh.rate,vh.amount,vh.note,b.branch_name,s.name salesman_name,
          string_agg(DISTINCT a.code||' - '||a.name,'، ') accounts,
          SUM(CASE WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE 0 END) debit,
          SUM(CASE WHEN vjd.credit_debit=2 THEN ${sql.unsafe(amount)} ELSE 0 END) credit
        FROM selected x JOIN voucher_header_tbl vh ON vh.id=x.id JOIN voucher_journal_detail_tbl vjd ON vjd.voucher_id=vh.id JOIN account_tbl a ON a.id=vjd.account_id
        LEFT JOIN currency c ON c.id=vh.currency_id LEFT JOIN branches b ON b.id=vh.branch_id LEFT JOIN salesmen s ON s.id=vh.salesman_id
        GROUP BY vh.id,c.currency_code,c.currency_name,b.branch_name,s.name ORDER BY vh.vch_date,vh.id LIMIT 10000`
    } else {
      const financialList = reportType === "balance-sheet" ? 1 : reportType === "income-statement" ? 2 : 0
      rows = await sql`SELECT a.id,a.code account_code,a.name account_name,a.level_no,a.finanical_list_id,
          CASE WHEN a.finanical_list_assests_id IS NOT NULL THEN 'assets' WHEN a.finanical_list_liabilities_id IS NOT NULL THEN 'liabilities' ELSE 'unclassified' END statement_side,
          COALESCE(ai.name,li.name,ii.name,'غير مصنف') statement_item,
          COALESCE(SUM(CASE WHEN vh.vch_date<${fromDate}::date AND vjd.credit_debit=1 THEN ${sql.unsafe(amount)} WHEN vh.vch_date<${fromDate}::date AND vjd.credit_debit=2 THEN -${sql.unsafe(amount)} ELSE 0 END),0) opening_balance,
          COALESCE(SUM(CASE WHEN vh.vch_date>=${fromDate}::date AND vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE 0 END),0) debit,
          COALESCE(SUM(CASE WHEN vh.vch_date>=${fromDate}::date AND vjd.credit_debit=2 THEN ${sql.unsafe(amount)} ELSE 0 END),0) credit,
          COALESCE(SUM(CASE WHEN vh.id IS NULL OR (${reportType === "income-statement"} AND vh.vch_date<${fromDate}::date) THEN 0 WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE -${sql.unsafe(amount)} END),0) balance
        FROM account_tbl a LEFT JOIN voucher_journal_detail_tbl vjd ON vjd.account_id=a.id
        LEFT JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id AND ${common} AND vh.vch_date<(${toDate}::date+INTERVAL '1 day')
        LEFT JOIN balance_sheet_assets_items ai ON ai.id=a.finanical_list_assests_id
        LEFT JOIN balance_sheet_liabilities_items li ON li.id=a.finanical_list_liabilities_id
        LEFT JOIN income_statement_items ii ON ii.id=a.finanical_list_income_id
        WHERE COALESCE(a.status,1)<>3 AND (${financialList===0} OR a.finanical_list_id=${financialList}) AND (${level===0} OR a.level_no<=${level}) AND (${accountIds.length===0} OR a.id=ANY(${accountIds}::int[]))
        GROUP BY a.id,a.code,a.name,a.level_no,a.finanical_list_id,a.finanical_list_assests_id,a.finanical_list_liabilities_id,ai.name,li.name,ii.name
        HAVING ${includeZero} OR ABS(COALESCE(SUM(CASE WHEN vh.id IS NULL OR (${reportType === "income-statement"} AND vh.vch_date<${fromDate}::date) THEN 0 WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE -${sql.unsafe(amount)} END),0))>0.00001
        ORDER BY a.code`
    }

    const num=(value:unknown)=>Number(value||0)
    const summary = reportType === "vouchers"
      ? { count:rows.length,total:rows.reduce((s,r)=>s+num(r.amount),0),debit:rows.reduce((s,r)=>s+num(r.debit),0),credit:rows.reduce((s,r)=>s+num(r.credit),0) }
      : reportType === "transactions"
        ? { count:rows.length,debit:rows.reduce((s,r)=>s+num(r.debit),0),credit:rows.reduce((s,r)=>s+num(r.credit),0),balance:rows.reduce((s,r)=>s+num(r.debit)-num(r.credit),0) }
        : { count:rows.length,opening:rows.reduce((s,r)=>s+num(r.opening_balance),0),debit:rows.reduce((s,r)=>s+num(r.debit),0),credit:rows.reduce((s,r)=>s+num(r.credit),0),balance:rows.reduce((s,r)=>s+num(r.balance),0),assets:rows.filter(r=>r.statement_side==="assets").reduce((s,r)=>s+num(r.balance),0),liabilities:rows.filter(r=>r.statement_side==="liabilities").reduce((s,r)=>s+Math.abs(num(r.balance)),0),income:rows.filter(r=>num(r.balance)<0).reduce((s,r)=>s+Math.abs(num(r.balance)),0),expenses:rows.filter(r=>num(r.balance)>0).reduce((s,r)=>s+num(r.balance),0) }
    return NextResponse.json({meta,rows,summary,filters:{report_type:reportType,from_date:fromDate,to_date:toDate,base_currency:baseCurrency}})
  } catch(error) {
    console.error("Financial report error:",error)
    return NextResponse.json({error:"تعذر تحميل التقرير المالي"},{status:500})
  }
}
