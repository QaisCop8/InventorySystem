import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensurePosTables, getOpenPosSession, getPosPoint, requestBranchId, requestUserId } from "../_lib"

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

export async function GET(request: NextRequest) {
  try {
    await ensurePosTables()
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const userId = requestUserId(request)
    if (!pointId || !userId) return NextResponse.json({ error: "نقطة البيع والمستخدم مطلوبان" }, { status: 400 })
    const point = await getPosPoint(pointId, userId, requestBranchId(request))
    if (!point) return NextResponse.json({ error: "نقطة البيع غير متاحة" }, { status: 403 })
    const rows = await sql`
      SELECT d.id,d.draft_code,d.customer_id,d.salesman_id,d.mode,d.note,d.discount_value,d.items,d.created_at,d.updated_at,
             COALESCE(a.name,'عميل نقدي') customer_name
      FROM pos_sale_drafts_tbl d
      LEFT JOIN account_tbl a ON a.id=d.customer_id
      WHERE d.pos_point_id=${pointId} AND d.user_id=${Number(userId)} AND d.status='draft'
      ORDER BY d.updated_at DESC,d.id DESC
    `
    return NextResponse.json({ rows })
  } catch (error) {
    return NextResponse.json({ error: errorText(error, "تعذر تحميل مسودات الكاشير") }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensurePosTables()
    const data = await request.json()
    const pointId = Number(data.pos_point_id || 0)
    const userId = requestUserId(request)
    if (!pointId || !userId || !Array.isArray(data.items) || !data.items.length) return NextResponse.json({ error: "بيانات المسودة غير مكتملة" }, { status: 400 })
    const point = await getPosPoint(pointId, userId, requestBranchId(request))
    if (!point) return NextResponse.json({ error: "نقطة البيع غير متاحة" }, { status: 403 })
    const session = await getOpenPosSession(pointId, userId)
    if (!session) return NextResponse.json({ error: "يجب فتح العهدة قبل حفظ المسودة" }, { status: 400 })
    const code = `TMP-${Date.now().toString(36).toUpperCase()}`
    const rows = await sql`
      INSERT INTO pos_sale_drafts_tbl(draft_code,pos_point_id,pos_session_id,user_id,customer_id,salesman_id,mode,note,discount_value,items)
      VALUES(${code},${pointId},${Number(session.id)},${Number(userId)},${Number(data.pos_customer_id)||null},${Number(data.salesman_id)||null},${String(data.pos_mode||"sale")},${String(data.note||"")},${Number(data.discount_value||0)},${JSON.stringify(data.items)}::jsonb)
      RETURNING *
    `
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: errorText(error, "تعذر حفظ مسودة الكاشير") }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensurePosTables()
    const id = Number(request.nextUrl.searchParams.get("id") || 0)
    const userId = requestUserId(request)
    if (!id || !userId) return NextResponse.json({ error: "معرف المسودة غير صالح" }, { status: 400 })
    const rows = await sql`UPDATE pos_sale_drafts_tbl SET status='cancelled',updated_at=NOW() WHERE id=${id} AND user_id=${Number(userId)} AND status='draft' RETURNING id`
    if (!rows.length) return NextResponse.json({ error: "المسودة غير موجودة" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: errorText(error, "تعذر حذف المسودة") }, { status: 500 })
  }
}
