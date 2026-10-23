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
    // الإضافات (المتغيرات والخصائص) والتوابع لكل صنف — نفس قاعدة طلبية المبيعات: 1 الصنف فقط، 2 التوابع فقط، 3 الصنف والتوابع
    const ids = catalog.products.map((product: any) => Number(product.id))
    const [extras, relations] = ids.length ? await Promise.all([
      sql`SELECT id, attributes, related_items_mode FROM products WHERE id = ANY(${ids}::int[])`,
      sql`SELECT product_id, related_id FROM product_related_items WHERE product_id = ANY(${ids}::int[]) ORDER BY id`,
    ]) : [[], []]
    const extraById = new Map<number, any>(extras.map((row: any) => [Number(row.id), row]))
    const relatedById = new Map<number, number[]>()
    for (const row of relations as any[]) relatedById.set(Number(row.product_id), [...(relatedById.get(Number(row.product_id)) || []), Number(row.related_id)])
    const products = catalog.products.map((product: any) => {
      const extra = extraById.get(Number(product.id))
      const groups = (Array.isArray(extra?.attributes) ? extra.attributes : [])
        .map((group: any) => ({ name: String(group?.name || "").trim(), values: (Array.isArray(group?.values) ? group.values : []).map((value: unknown) => String(value || "").trim()).filter(Boolean) }))
        .filter((group: any) => group.name && group.values.length)
      return { ...product, addon_groups: groups, related_items_mode: Math.min(3, Math.max(1, Number(extra?.related_items_mode || 1))), related_ids: relatedById.get(Number(product.id)) || [] }
    })
    return NextResponse.json({ ...catalog, products, session: null, can_pay: auth.permissions.pay })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant catalog GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الأصناف" }, { status: errorStatus(error) })
  }
}
