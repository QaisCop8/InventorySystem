import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureBankReconciliationTables, RECON_OPEN } from "@/lib/bank-reconciliation"
import { validateLeafAccounts } from "@/lib/leaf-accounts"
import { insertStatementLines, parseStatementLines } from "./_lines"

// التسويات البنكية: GET قائمة التسويات + حسابات البنوك المعرّفة، POST إنشاء تسوية (رأس + أسطر الكشف المستوردة)
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "bank_reconciliation", "view")
    if (!authorization.ok) return authorization.response
    await ensureBankReconciliationTables()
    const accountId = Number(request.nextUrl.searchParams.get("account_id") || 0)
    const [rows, bankAccounts] = await Promise.all([
      sql`
        SELECT r.id, r.account_id, a.code account_code, a.name account_name, c.currency_code,
          r.statement_from::text statement_from, r.statement_to::text statement_to,
          r.opening_balance::float8 opening_balance, r.closing_balance::float8 closing_balance,
          r.status, r.note, r.file_name, r.created_at, r.finalized_at,
          (SELECT COUNT(*)::int FROM bank_statement_lines_tbl l WHERE l.reconciliation_id = r.id) line_count,
          (SELECT COUNT(DISTINCT m.statement_line_id)::int FROM bank_reconciliation_matches_tbl m WHERE m.reconciliation_id = r.id) matched_count
        FROM bank_reconciliations_tbl r
        JOIN account_tbl a ON a.id = r.account_id
        LEFT JOIN currency c ON c.id = a.currency_id
        WHERE (${accountId} = 0 OR r.account_id = ${accountId})
        ORDER BY r.statement_to DESC, r.id DESC
        LIMIT 500
      `,
      sql`
        SELECT ba.id, ba.code, ba.name, ba.jary_account_id account_id, a.code account_code, a.name account_name, c.currency_code
        FROM bank_accounts ba
        JOIN account_tbl a ON a.id = ba.jary_account_id
        LEFT JOIN currency c ON c.id = a.currency_id
        WHERE COALESCE(ba.status, 1) <> 3 AND COALESCE(a.status, 1) <> 3
        ORDER BY ba.code
      `.catch(() => []),
    ])
    return NextResponse.json({ rows, bankAccounts })
  } catch (error) {
    console.error("[bank-reconciliations] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل التسويات البنكية" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(() => ({}))
    const authorization = await authorizeTransaction(request, "bank_reconciliation", "create", data.branch_id)
    if (!authorization.ok) return authorization.response
    await ensureBankReconciliationTables()

    const accountId = Number(data.account_id)
    const from = String(data.statement_from || "").slice(0, 10)
    const to = String(data.statement_to || "").slice(0, 10)
    if (!Number.isInteger(accountId) || accountId <= 0) return NextResponse.json({ error: "يجب اختيار حساب البنك" }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "يجب تحديد فترة الكشف" }, { status: 400 })
    if (to < from) return NextResponse.json({ error: "تاريخ نهاية الكشف يسبق تاريخ بدايته" }, { status: 400 })
    const account = (await sql`SELECT id FROM account_tbl WHERE id = ${accountId} AND COALESCE(status, 1) <> 3`)[0]
    if (!account) return NextResponse.json({ error: "حساب البنك غير موجود" }, { status: 400 })
    const parentError = await validateLeafAccounts([accountId])
    if (parentError) return NextResponse.json({ error: parentError }, { status: 400 })

    const parsed = parseStatementLines(data.lines, from, to)
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const overlap = (await sql`
      SELECT id, statement_from::text statement_from, statement_to::text statement_to FROM bank_reconciliations_tbl
      WHERE account_id = ${accountId} AND statement_from <= ${to}::date AND statement_to >= ${from}::date LIMIT 1
    `)[0]
    if (overlap) return NextResponse.json({ error: `توجد تسوية لنفس الحساب تتداخل مع الفترة (${overlap.statement_from} — ${overlap.statement_to})` }, { status: 409 })

    const created = await withTenantTransaction(async () => {
      const header = (await sql`
        INSERT INTO bank_reconciliations_tbl (account_id, branch_id, statement_from, statement_to, opening_balance, closing_balance, note, file_name, status, created_by)
        VALUES (${accountId}, ${authorization.branchId}, ${from}, ${to}, ${Number(data.opening_balance) || 0}, ${Number(data.closing_balance) || 0},
          ${String(data.note || "").slice(0, 1000) || null}, ${String(data.file_name || "").slice(0, 255) || null}, ${RECON_OPEN}, ${String(authorization.userId)})
        RETURNING id
      `)[0]
      await insertStatementLines(Number(header.id), parsed.lines, 0)
      return header
    })
    return NextResponse.json({ id: Number(created.id), warnings: parsed.warnings }, { status: 201 })
  } catch (error) {
    console.error("[bank-reconciliations] POST failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إنشاء التسوية" }, { status: 500 })
  }
}
