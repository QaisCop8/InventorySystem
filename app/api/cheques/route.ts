import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { ensureChequeOperationsTable, withAllowedChequeOperations } from "./_lib"

const validDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
const positiveNumber = (value: string | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureAccountsTable()
    await ensureVoucherTables()
    await ensureChequeOperationsTable()

    const params = request.nextUrl.searchParams
    const chequeType = params.get("type") === "2" ? 2 : 1
    const statusId = positiveNumber(params.get("status_id"))
    const currencyId = positiveNumber(params.get("currency_id"))
    const bankId = positiveNumber(params.get("bank_id"))
    const fromDueDate = validDate(params.get("from_due_date"))
    const toDueDate = validDate(params.get("to_due_date"))
    const minAmount = positiveNumber(params.get("min_amount"))
    const maxAmount = positiveNumber(params.get("max_amount"))
    const query = String(params.get("q") || "").trim().slice(0, 100)

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id=${user.user_id}`
    const permittedBranches = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)

    const [statuses, currencies, banks, bankAccounts, accounts] = await Promise.all([
      sql`SELECT id,name FROM cheque_status_tbl ORDER BY id`,
      sql`SELECT id,currency_code,currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`,
      sql`SELECT id,bank_code,bank_name FROM banks WHERE COALESCE(status,1)<>3 ORDER BY bank_name`,
      sql`SELECT ba.id,ba.code,ba.name,ba.currency_id,ba.branch_id,ba.jary_account_id,ba.tahsil_account_id,b.bank_name,br.branch_name
          FROM bank_accounts ba LEFT JOIN branches br ON br.id=ba.branch_id LEFT JOIN banks b ON b.id=br.bank_id
          WHERE COALESCE(ba.status,1)<>3 ORDER BY ba.code`,
      sql`SELECT id,code,name,currency_id FROM account_tbl WHERE COALESCE(status,1)<>3 ORDER BY code LIMIT 5000`,
    ])
    const meta = { statuses, currencies, banks, bank_accounts: bankAccounts, accounts }
    if (params.get("meta") === "1") return NextResponse.json({ meta })

    const rawRows = await sql`
      SELECT c.id,c.cheq_type,c.bank_account,c.cheq_num,c.amount,c.rate,c.received_date,c.trans_date,
             c.due_date,c.pay_date,c.return_date,c.hold_date,c.first_due_date,c.cheq_owner_name,
             c.status_id,c.old_status_id,c.return_count,c.current_account_id,c.bank_account_id,
             c.last_update_date,c.voucher_id,c.last_voucher_id,
             cs.name status_name,cur.currency_code,cur.currency_name,
             bk.bank_name,br.branch_name,ba.code bank_account_code,ba.name bank_account_name,
             customer.code customer_code,customer.name customer_name,
             current_account.code current_account_code,current_account.name current_account_name,
             vh.vch_code,vh.vch_date,vh.branch_id voucher_branch_id,
             COUNT(*) OVER() total_count
      FROM cheques_tbl c
      LEFT JOIN cheque_status_tbl cs ON cs.id=c.status_id
      LEFT JOIN currency cur ON cur.id=c.currency_id
      LEFT JOIN banks bk ON bk.id=c.bank_id
      LEFT JOIN branches br ON br.id=c.branch_id
      LEFT JOIN bank_accounts ba ON ba.id=c.bank_account_id
      LEFT JOIN account_tbl customer ON customer.id=c.customer_id
      LEFT JOIN account_tbl current_account ON current_account.id=c.current_account_id
      LEFT JOIN voucher_header_tbl vh ON vh.id=c.voucher_id
      WHERE c.cheq_type=${chequeType}
        AND (${statusId}::int IS NULL OR c.status_id=${statusId})
        AND (${currencyId}::int IS NULL OR c.currency_id=${currencyId})
        AND (${bankId}::int IS NULL OR c.bank_id=${bankId})
        AND (${fromDueDate}::date IS NULL OR c.due_date>=${fromDueDate}::date)
        AND (${toDueDate}::date IS NULL OR c.due_date<(${toDueDate}::date+INTERVAL '1 day'))
        AND (${minAmount}::double precision IS NULL OR c.amount>=${minAmount})
        AND (${maxAmount}::double precision IS NULL OR c.amount<=${maxAmount})
        AND (${permittedBranches.length === 0} OR vh.branch_id=ANY(${permittedBranches}::int[]))
        AND (${query}='' OR CONCAT_WS(' ',c.cheq_num,c.bank_account,c.cheq_owner_name,vh.vch_code,
             customer.code,customer.name,bk.bank_name,br.branch_name,ba.code,ba.name) ILIKE ${`%${query}%`})
      ORDER BY c.due_date NULLS LAST,c.id DESC
      LIMIT 2000
    `

    const rows = rawRows.map(withAllowedChequeOperations)
    const summary = {
      count: rows.length,
      total: rows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
      due: rows.filter((row: any) => [1, 2, 3].includes(Number(row.status_id))).length,
      returned: rows.filter((row: any) => Number(row.status_id) === 5).length,
    }
    return NextResponse.json({ meta, rows, summary })
  } catch (error) {
    console.error("Cheques query error:", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات الشيكات" }, { status: 500 })
  }
}
