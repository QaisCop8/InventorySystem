import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeRestaurant, ensureRestaurantTables, errorStatus, locationSalePoint } from "@/lib/restaurant"
import { ensurePosTables } from "@/app/api/pos/_lib"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensureTables as ensureCreditCardTables } from "@/app/api/credit-cards/_lib"
import { buildPosCatalog } from "@/app/api/pos/_catalog"
import { getSessionUser } from "@/lib/tenant-auth"

// أصناف وأسعار الموقع من إعدادات البيع الخاصة به (المستودع، فئة السعر، العملة) — مستقلة عن نقاط بيع الكاشير.
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const locationId = Number(request.nextUrl.searchParams.get("location_id")) || 0
    await ensureSalesTables(); await ensurePosTables(); await ensureCreditCardTables(); await ensureRestaurantTables()
    const location = locationId ? (await sql`SELECT * FROM restaurant_locations_tbl WHERE id = ${locationId} AND status <> 3`)[0] : null
    if (!location) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
    const auth = await authorizeRestaurant(request, [], location.branch_id)
    if (!auth.ok) return auth.response
    const point = await locationSalePoint(location, auth.userId)
    const catalog = await buildPosCatalog(point, 0, auth.userId, Number(point.price_category_id))
    return NextResponse.json({ ...catalog, session: null, can_pay: auth.permissions.pay })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant catalog GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الأصناف" }, { status: errorStatus(error) })
  }
}
