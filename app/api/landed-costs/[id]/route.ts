import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureLandedCostSchema } from "@/lib/landed-costs"
import { workingPeriodErrorMessage } from "@/lib/working-period"

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const docId = async (ctx: Ctx) => Number((await ctx.params).id)

// GET: المستند + بنوده + توزيعه الحالي على أسطر الفاتورة. PATCH {action:"cancel"}: إلغاء المستند وقيده معاً.
export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "landed_cost", "view")
    if (!authorization.ok) return authorization.response
    await ensureLandedCostSchema()
    const id = await docId(ctx)
    const header = (await sql`
      SELECT lc.*, lc.doc_date::text AS doc_date, vh.vch_code AS purchase_code, vh.vch_date::date::text AS purchase_date,
        acc.name AS supplier_name, c.currency_code, pc.currency_code AS purchase_currency_code,
        da.code AS debit_account_code, da.name AS debit_account_name, jv.vch_code AS journal_code, b.branch_name
      FROM landed_costs_tbl lc
      LEFT JOIN voucher_header_tbl vh ON vh.id = lc.purchase_voucher_id
      LEFT JOIN account_tbl acc ON acc.id = vh.account_id
      LEFT JOIN currency c ON c.id = lc.currency_id
      LEFT JOIN currency pc ON pc.id = vh.currency_id
      LEFT JOIN account_tbl da ON da.id = lc.debit_account_id
      LEFT JOIN voucher_header_tbl jv ON jv.id = lc.journal_voucher_id
      LEFT JOIN branches b ON b.id = lc.branch_id
      WHERE lc.id = ${id}
    `)[0]
    if (!header) return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 })
    const [charges, allocations] = await Promise.all([
      sql`
        SELECT ch.*, a.code AS account_code, a.name AS account_name
        FROM landed_cost_charges_tbl ch LEFT JOIN account_tbl a ON a.id = ch.account_id
        WHERE ch.landed_cost_id = ${id} ORDER BY ch.id
      `,
      // المستند الملغى لا يظهر في الـView؛ يُعرض توزيعه فقط وهو فعّال.
      sql`
        SELECT l.voucher_item_id, l.basis, l.amount, p.product_code, p.product_name, u.unit_name, vi.qnty, vi.bonus
        FROM landed_cost_lines_v l
        JOIN voucher_items_tbl vi ON vi.id = l.voucher_item_id
        LEFT JOIN products p ON p.id = l.product_id
        LEFT JOIN units u ON u.id = vi.unit_id
        WHERE l.landed_cost_id = ${id}
        ORDER BY vi.id
      `,
    ])
    return NextResponse.json({ header, charges, allocations })
  } catch (error) {
    console.error("[landed-costs] GET id failed", error)
    return NextResponse.json({ error: "تعذر تحميل المستند" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "landed_cost", "delete")
    if (!authorization.ok) return authorization.response
    await ensureLandedCostSchema()
    const id = await docId(ctx)
    const data = await request.json().catch(() => ({}))
    if (data.action !== "cancel") return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    const userId = String(authorization.userId)
    const outcome = await withTenantTransaction(async () => {
      const row = (await sql`SELECT id, status, journal_voucher_id FROM landed_costs_tbl WHERE id = ${id} FOR UPDATE`)[0] as any
      if (!row) return "missing"
      if (Number(row.status) === 3) return "cancelled"
      if (row.journal_voucher_id) {
        await sql`
          UPDATE voucher_header_tbl SET status = 3, vch_status = 1, last_update_date = CURRENT_TIMESTAMP
          WHERE id = ${Number(row.journal_voucher_id)} AND status <> 3
        `
      }
      await sql`UPDATE landed_costs_tbl SET status = 3, updated_by = ${userId}, updated_at = NOW() WHERE id = ${id}`
      return "ok"
    })
    if (outcome === "missing") return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 })
    if (outcome === "cancelled") return NextResponse.json({ error: "المستند ملغى مسبقاً" }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    const periodError = workingPeriodErrorMessage(error)
    if (periodError) return NextResponse.json({ error: periodError }, { status: 400 })
    console.error("[landed-costs] PATCH failed", error)
    return NextResponse.json({ error: "تعذر إلغاء المستند" }, { status: 500 })
  }
}
