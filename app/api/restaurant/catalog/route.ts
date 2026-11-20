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
    // ?order_type=takeaway ⇐ أسعار «فئة السعر للسفري»؛ وإلا «فئة السعر للطاولات»
    const orderType = request.nextUrl.searchParams.get("order_type") === "takeaway" ? "takeaway" : "dine_in"
    const point = await locationSalePoint(location, auth.userId, orderType)
    const catalog = await buildPosCatalog(point, 0, auth.userId, Number(point.price_category_id))
    // الإضافات والتوابع يرفقها buildPosCatalog (attachProductExtras). حقول الشاشة فقط: الصور تُحمَّل عند ظهور الصنف
    // (api/restaurant/product-images) بدل تضمينها كلها في الكتالوج
    const products = catalog.products.map((product: any) => {
      const image = String(product.product_image || "")
      return {
        id: Number(product.id), product_code: product.product_code, product_name: product.product_name, unit_id: product.unit_id, unit_name: product.unit_name,
        first_price: product.first_price, category_name: product.category_name, group_printer: product.group_printer, item_printer: product.item_printer, unit_prices: product.unit_prices,
        image_url: /^(https?:|\/)/i.test(image) ? image : null, has_image: Boolean(image) && !/^(https?:|\/)/i.test(image),
        addon_groups: product.addon_groups, restaurant_extras: product.restaurant_extras, restaurant_extras_mode: product.restaurant_extras_mode, restaurant_followup_group_id: product.restaurant_followup_group_id, group_id: product.group_id, related_items_mode: product.related_items_mode, related_ids: product.related_ids, related_items: product.related_items,
      }
    })
    // خدمة اضافات المطعم للموقع: سطر «اضافات» بمجموع أسعار الإضافات المختارة
    const extrasService = Number(location.extras_service_id) > 0
      ? (await sql`SELECT p.id, p.product_name, u.id AS unit_id, u.unit_name FROM products p LEFT JOIN LATERAL (SELECT pu.unit_id FROM product_units pu WHERE pu.product_id = p.id ORDER BY pu.id LIMIT 1) du ON true LEFT JOIN units u ON u.id = du.unit_id WHERE p.id = ${Number(location.extras_service_id)} AND COALESCE(p.deleted, false) = false`)[0] || null
      : null
    return NextResponse.json({ ...catalog, products, session: null, can_pay: auth.permissions.pay, extras_service: extrasService, settings_at: location.updated_at })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant catalog GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الأصناف" }, { status: errorStatus(error) })
  }
}
