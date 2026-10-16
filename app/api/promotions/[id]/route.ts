import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensurePromotionTables } from "@/lib/promotions"
import { PromotionInputError, loadPromotion, parsePromotion, savePromotionChildren } from "../_payload"

type Ctx = { params: Promise<{ id: string }> | { id: string } }
const promotionId = async (ctx: Ctx) => Number((await ctx.params).id)

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "promotion", "view")
    if (!authorization.ok) return authorization.response
    await ensurePromotionTables()
    const promotion = await loadPromotion(await promotionId(ctx))
    if (!promotion) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })
    return NextResponse.json(promotion)
  } catch (error) {
    console.error("[promotions] GET detail failed", error)
    return NextResponse.json({ error: "تعذر تحميل العرض" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "promotion", "update")
    if (!authorization.ok) return authorization.response
    await ensurePromotionTables()
    const id = await promotionId(ctx)
    const data = await request.json().catch(() => ({}))
    // تجميد/تفعيل فقط
    if (Object.keys(data).every((key) => key === "status")) {
      const status = Number(data.status) === 2 ? 2 : 1
      const updated = await sql`UPDATE promotions_tbl SET status = ${status}, updated_at = NOW() WHERE id = ${id} AND status <> 3 RETURNING id`
      if (!updated.length) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })
      return NextResponse.json({ success: true })
    }
    const payload = await parsePromotion(data)
    await withTenantTransaction(async () => {
      const current = (await sql`SELECT code FROM promotions_tbl WHERE id = ${id} AND status <> 3 FOR UPDATE`)[0] as any
      if (!current) throw new PromotionInputError("العرض غير موجود")
      const code = payload.code || String(current.code)
      if ((await sql`SELECT 1 FROM promotions_tbl WHERE UPPER(code) = ${code} AND status <> 3 AND id <> ${id}`).length) throw new PromotionInputError("رقم العرض مستخدم مسبقاً")
      await sql`
        UPDATE promotions_tbl SET code = ${code}, name = ${payload.name}, promo_type = ${payload.promo_type}, start_date = ${payload.start_date}, end_date = ${payload.end_date},
          status = ${payload.status}, priority = ${payload.priority}, all_customers = ${payload.all_customers}, currency_id = ${payload.currency_id},
          vch_types = ${payload.vch_types}::int[], branch_ids = ${payload.branch_ids}::int[], notes = ${payload.notes}, updated_at = NOW()
        WHERE id = ${id}
      `
      await savePromotionChildren(id, payload)
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PromotionInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[promotions] PUT failed", error)
    return NextResponse.json({ error: "تعذر حفظ العرض" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    const authorization = await authorizeTransaction(request, "promotion", "delete")
    if (!authorization.ok) return authorization.response
    await ensurePromotionTables()
    const deleted = await sql`UPDATE promotions_tbl SET status = 3, updated_at = NOW() WHERE id = ${await promotionId(ctx)} AND status <> 3 RETURNING id`
    if (!deleted.length) return NextResponse.json({ error: "العرض غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[promotions] DELETE failed", error)
    return NextResponse.json({ error: "تعذر حذف العرض" }, { status: 500 })
  }
}
