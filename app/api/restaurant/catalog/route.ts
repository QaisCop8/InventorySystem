import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeRestaurant, ensureRestaurantTables, errorStatus } from "@/lib/restaurant"
import { ensurePosTables, getPosPoint } from "@/app/api/pos/_lib"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensureTables as ensureCreditCardTables } from "@/app/api/credit-cards/_lib"
import { buildPosCatalog } from "@/app/api/pos/_catalog"
import { getSessionUser } from "@/lib/tenant-auth"

// أصناف وأسعار الموقع = كتالوج نقطة البيع المرتبطة به (نفس الأسعار والوحدات والحملات التي يحسبها الكاشير عند الدفع).
// can_pay: المستخدم من مستخدمي النقطة ولديه عهدة مفتوحة عليها (الدفع يمر عبر api/pos/sales).
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const locationId = Number(request.nextUrl.searchParams.get("location_id")) || 0
    await ensureSalesTables(); await ensurePosTables(); await ensureCreditCardTables(); await ensureRestaurantTables()
    const location = locationId ? (await sql`SELECT id, branch_id, pos_point_id FROM restaurant_locations_tbl WHERE id = ${locationId} AND status <> 3`)[0] : null
    if (!location) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
    const auth = await authorizeRestaurant(request, [], location.branch_id)
    if (!auth.ok) return auth.response
    const pointId = Number(location.pos_point_id) || 0
    if (!pointId) return NextResponse.json({ error: "لم تُحدَّد نقطة بيع لهذا الموقع؛ عيّنها من تعريف المواقع لتظهر الأصناف والأسعار" }, { status: 400 })
    const point = (await sql`
      SELECT p.*, c.currency_name, c.currency_code
      FROM pos_points_tbl p LEFT JOIN currency c ON c.id = p.currency_id
      WHERE p.id = ${pointId} AND p.status = 1
    `)[0]
    if (!point) return NextResponse.json({ error: "نقطة البيع المرتبطة بالموقع غير نشطة" }, { status: 400 })
    const catalog = await buildPosCatalog(point, pointId, auth.userId, Number(point.price_category_id))
    const pointUser = await getPosPoint(pointId, auth.userId)
    return NextResponse.json({ ...catalog, can_pay: Boolean(pointUser && catalog.session) })
  } catch (error) {
    console.error("restaurant catalog GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الأصناف" }, { status: errorStatus(error) })
  }
}
