import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { ensureTables as ensureSalesTables, fetchSalesVoucherItems } from "@/app/api/sales-vouchers/_lib"
import { fetchVoucherItems as fetchStockVoucherItems } from "@/app/api/stock-vouchers/_lib"
import { PUT as updateSalesVoucher } from "@/app/api/sales-vouchers/route"
import { PUT as updateStockVoucher } from "@/app/api/stock-vouchers/route"
import { ensurePosTables, getOpenPosSession, getPosPoint, requestBranchId, requestUserId } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureSalesTables()
    await ensurePosTables()
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const userId = requestUserId(request)
    if (!pointId || !userId) return NextResponse.json({ error: "بيانات نقطة البيع غير مكتملة" }, { status: 400 })
    const point = await getPosPoint(pointId, userId, requestBranchId(request))
    if (!point) return NextResponse.json({ error: "نقطة البيع غير متاحة" }, { status: 403 })
    const q = String(request.nextUrl.searchParams.get("q") || "").trim()
    const sessionId = Number(request.nextUrl.searchParams.get("session_id") || 0)
    const id = Number(request.nextUrl.searchParams.get("id") || 0)
    if (request.nextUrl.searchParams.has("session_id") && (!Number.isSafeInteger(sessionId) || sessionId <= 0))
      return NextResponse.json({ error: "معرف الوردية غير صالح" }, { status: 400 })
    if (request.nextUrl.searchParams.has("id") && (!Number.isSafeInteger(id) || id <= 0))
      return NextResponse.json({ error: "معرف الفاتورة غير صالح" }, { status: 400 })

    const rows = await sql`
      SELECT vh.id, vh.vch_code, vh.vch_date, vh.vch_type, vh.customer_name, vh.amount, vh.status,
        vh.pos_receipt_voucher_id,
        (SELECT receipt.vch_code FROM voucher_header_tbl receipt WHERE receipt.id=vh.pos_receipt_voucher_id) receipt_vch_code,
        COALESCE((SELECT json_agg(json_build_object('method', p.payment_method, 'amount', p.amount, 'reference', p.reference, 'due_date', p.due_date) ORDER BY p.id) FROM pos_sale_payments_tbl p WHERE p.voucher_id = vh.id), '[]') payments
      FROM voucher_header_tbl vh
      WHERE (EXISTS (SELECT 1 FROM pos_sale_payments_tbl p WHERE p.voucher_id = vh.id AND p.pos_point_id = ${pointId}) OR (vh.pos_point_id = ${pointId} AND vh.vch_type = 9))
        AND (${sessionId} = 0 OR vh.pos_session_id = ${sessionId} OR EXISTS (SELECT 1 FROM pos_sale_payments_tbl p WHERE p.voucher_id = vh.id AND p.session_id = ${sessionId} AND p.pos_point_id = ${pointId}))
        AND vh.status <> 3
        AND (${id} = 0 OR vh.id = ${id})
        AND (${q} = '' OR CONCAT_WS(' ', vh.vch_code, vh.customer_name, vh.amount::text) ILIKE ${`%${q}%`})
      ORDER BY vh.id DESC LIMIT 100
    `
    if (!id) return NextResponse.json({ rows })
    if (!rows.length) return NextResponse.json({ error: "الفاتورة غير موجودة في نقطة البيع" }, { status: 404 })
    const voucher = rows[0]
    const items = Number(voucher.vch_type) === 9 ? await fetchStockVoucherItems(id) : await fetchSalesVoucherItems(id)
    return NextResponse.json({ ...voucher, items })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل فواتير النقطة" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const id = Number(request.nextUrl.searchParams.get("id") || 0)
    const userId = requestUserId(request)
    if (!Number.isSafeInteger(id) || id <= 0 || !pointId || !userId)
      return NextResponse.json({ error: "معرف الفاتورة أو نقطة البيع غير صالح" }, { status: 400 })
    return await withTenantTransaction(async () => {
      await ensureSalesTables()
      await ensurePosTables()
      const point = await getPosPoint(pointId, userId, requestBranchId(request))
      if (!point) return NextResponse.json({ error: "نقطة البيع غير متاحة" }, { status: 403 })
      const session = await getOpenPosSession(pointId, userId)
      if (!session) return NextResponse.json({ error: "يجب فتح الوردية لحذف فاتورة" }, { status: 400 })
      const rows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${id} AND (pos_point_id = ${pointId} OR EXISTS (SELECT 1 FROM pos_sale_payments_tbl p WHERE p.voucher_id = ${id} AND p.pos_point_id = ${pointId})) FOR UPDATE`
      if (!rows.length) return NextResponse.json({ error: "الفاتورة غير موجودة في نقطة البيع" }, { status: 404 })
      const voucher = rows[0]
      const belongsToShift = Number(voucher.pos_session_id) === Number(session.id) ||
        Boolean((await sql`SELECT 1 FROM pos_sale_payments_tbl WHERE voucher_id = ${id} AND session_id = ${Number(session.id)} LIMIT 1`)[0])
      if (!belongsToShift)
        return NextResponse.json({ error: "يمكن حذف فواتير الوردية الحالية فقط" }, { status: 400 })
      if (Number(voucher.status) === 3)
        return NextResponse.json({ error: "الفاتورة محذوفة بالفعل" }, { status: 400 })
      const forwarded = new NextRequest(new URL(Number(voucher.vch_type) === 9 ? "/api/stock-vouchers" : "/api/sales-vouchers", request.url), {
        method: "PUT", headers: request.headers, body: JSON.stringify({ ...voucher, id, status: 3, items: [] }),
      })
      const result = Number(voucher.vch_type) === 9 ? await updateStockVoucher(forwarded) : await updateSalesVoucher(forwarded)
      if (!result.ok) {
        const failure = await result.json()
        throw Object.assign(new Error(String(failure?.error || "تعذر حذف الفاتورة")), { status: result.status })
      }
      return NextResponse.json({ success: true })
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حذف الفاتورة" }, { status: Number((error as { status?: number })?.status) || 500 })
  }
}
