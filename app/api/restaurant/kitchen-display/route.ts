import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeRestaurant, errorStatus } from "@/lib/restaurant"
import { kitchenAction, kitchenBoard } from "@/lib/restaurant-kitchen"

export const dynamic = "force-dynamic"

// شاشة المطبخ: GET ?view=active|done&location_id ⇐ بطاقات الطلبات · POST {action: done|reject|dismiss|recall, order_id, seen, reason}
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRestaurant(request, ["kitchenScreen"])
    if (!auth.ok) return auth.response
    const params = request.nextUrl.searchParams
    const locationId = Number(params.get("location_id")) || null
    const view = params.get("view") === "done" ? "done" : "active"
    const [cards, locations] = await Promise.all([
      kitchenBoard(auth.branchId, locationId, view),
      sql`SELECT id, name FROM restaurant_locations_tbl WHERE branch_id = ${auth.branchId} AND status = 1 ORDER BY id`,
    ])
    return NextResponse.json({ cards, locations: locations.map((row: any) => ({ id: Number(row.id), name: String(row.name) })), now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("kitchen display GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل شاشة المطبخ" }, { status: errorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(() => ({}))
    const orderId = Number(data?.order_id)
    if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "معرف الطلب غير صالح" }, { status: 400 })
    const row = (await sql`SELECT branch_id FROM restaurant_orders_tbl WHERE id = ${orderId}`.catch(() => []))[0]
    if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    const auth = await authorizeRestaurant(request, ["kitchenScreen"], row.branch_id)
    if (!auth.ok) return auth.response
    await withTenantTransaction(() => kitchenAction({
      orderId, branchId: auth.branchId, action: String(data.action || ""), userId: auth.userId,
      seen: data.seen === undefined ? undefined : data.seen ?? null, reason: data.reason,
    }))
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500) console.error("kitchen display POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status })
  }
}
