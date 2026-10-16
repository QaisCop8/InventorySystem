import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensurePromotionTables } from "@/lib/promotions"
import { PromotionInputError, parsePromotion, savePromotionChildren } from "./_payload"

// العروض والأسعار الخاصة: GET القائمة (و?lookup=1 للعملاء/الفروع/العملات)، POST إنشاء عرض
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "promotion", "view")
    if (!authorization.ok) return authorization.response
    await ensurePromotionTables()
    if (request.nextUrl.searchParams.get("lookup") === "1") {
      const [customers, branches, currencies] = await Promise.all([
        sql`SELECT id, code, name FROM account_tbl WHERE type IN (2, 5) AND COALESCE(status, 1) IN (1, 2) ORDER BY code`,
        sql`SELECT id, branch_name name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
        sql`SELECT id, currency_code code, currency_name name FROM currency ORDER BY id`,
      ])
      return NextResponse.json({ customers, branches, currencies })
    }
    const rows = await sql`
      SELECT p.id, p.code, p.name, p.promo_type, p.start_date::text start_date, p.end_date::text end_date, p.status, p.priority, p.all_customers,
        (SELECT COUNT(*)::int FROM promotion_items_tbl i WHERE i.promotion_id = p.id) item_count,
        (SELECT COUNT(*)::int FROM promotion_customers_tbl c WHERE c.promotion_id = p.id) customer_count
      FROM promotions_tbl p WHERE p.status <> 3
      ORDER BY p.status, p.start_date DESC, p.id DESC
    `
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("[promotions] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل العروض" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "promotion", "create")
    if (!authorization.ok) return authorization.response
    await ensurePromotionTables()
    const payload = await parsePromotion(await request.json().catch(() => ({})))
    const saved = await withTenantTransaction(async () => {
      const next = (await sql`SELECT nextval(pg_get_serial_sequence('promotions_tbl', 'id'))::int id`)[0] as any
      const id = Number(next.id)
      const code = payload.code || `PRM${String(id).padStart(6, "0")}`
      if ((await sql`SELECT 1 FROM promotions_tbl WHERE UPPER(code) = ${code} AND status <> 3`).length) throw new PromotionInputError("رقم العرض مستخدم مسبقاً")
      await sql`
        INSERT INTO promotions_tbl (id, code, name, promo_type, start_date, end_date, status, priority, all_customers, currency_id, vch_types, branch_ids, notes, created_by)
        VALUES (${id}, ${code}, ${payload.name}, ${payload.promo_type}, ${payload.start_date}, ${payload.end_date}, ${payload.status}, ${payload.priority},
          ${payload.all_customers}, ${payload.currency_id}, ${payload.vch_types}::int[], ${payload.branch_ids}::int[], ${payload.notes}, ${String(authorization.userId)})
      `
      await savePromotionChildren(id, payload)
      return { id, code }
    })
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
    if (error instanceof PromotionInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[promotions] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ العرض" }, { status: 500 })
  }
}
