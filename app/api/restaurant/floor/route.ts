import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeRestaurant, errorStatus } from "@/lib/restaurant"

// لوحة الطاولات للفرع النشط: المواقع النشطة وطاولاتها وحالة كل طاولة (الطلب المفتوح، المتبقي، الطاولات المدموجة)
// + صلاحيات المطعم الفعّالة للمستخدم على هذا الفرع (لإظهار/إخفاء الأزرار؛ الخادم يفرضها في api/restaurant/orders)
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRestaurant(request, [])
    if (!auth.ok) return auth.response
    const [locations, tables, takeaways] = await Promise.all([
      sql`
        SELECT l.id, l.code, l.name, l.color,
               (l.warehouse_id IS NOT NULL AND l.currency_id IS NOT NULL AND l.price_category_id IS NOT NULL AND l.sales_book_id IS NOT NULL) AS configured
        FROM restaurant_locations_tbl l
        WHERE l.status = 1 AND l.branch_id = ${auth.branchId}
        ORDER BY l.sort_order, l.id
      `,
      sql`
        SELECT t.id, t.name, t.seats, t.shape, t.location_id,
               o.id AS order_id, o.order_no, o.guests, o.opened_at, o.revision, ot.is_primary,
               COALESCE(us.full_name, us.username, o.opened_by) AS opened_by_name,
               COALESCE(totals.remaining, 0) AS remaining, COALESCE(totals.items, 0) AS items_count,
               COALESCE(paid.amount, 0) AS paid_amount,
               mates.names AS merged_with
        FROM restaurant_tables_tbl t
        JOIN restaurant_locations_tbl l ON l.id = t.location_id AND l.status = 1 AND l.branch_id = ${auth.branchId}
        LEFT JOIN restaurant_order_tables_tbl ot ON ot.table_id = t.id AND ot.active
        LEFT JOIN restaurant_orders_tbl o ON o.id = ot.order_id AND o.status = 'open'
        LEFT JOIN user_settings us ON us.user_id::text = o.opened_by
        LEFT JOIN LATERAL (
          SELECT ROUND(SUM(GREATEST(i.quantity - i.paid_quantity, 0) * i.price * (1 - i.discount / 100)), 2) AS remaining,
                 COUNT(*) FILTER (WHERE i.quantity - i.paid_quantity > 0) AS items
          FROM restaurant_order_items_tbl i WHERE i.order_id = o.id
        ) totals ON o.id IS NOT NULL
        LEFT JOIN LATERAL (SELECT SUM(amount) AS amount FROM restaurant_order_payments_tbl WHERE order_id = o.id) paid ON o.id IS NOT NULL
        LEFT JOIN LATERAL (
          SELECT string_agg(t2.name, ' + ' ORDER BY t2.sort_order, t2.id) AS names
          FROM restaurant_order_tables_tbl ot2 JOIN restaurant_tables_tbl t2 ON t2.id = ot2.table_id
          WHERE ot2.order_id = o.id AND ot2.active AND ot2.table_id <> t.id
        ) mates ON o.id IS NOT NULL
        WHERE t.status = 1
        ORDER BY l.sort_order, l.id, t.sort_order, t.id
      `,
      // الطلبات السفرية المفتوحة (بلا طاولات)
      sql`
        SELECT o.id AS order_id, o.order_no, o.takeaway_name, o.location_id, o.opened_at, o.revision,
               COALESCE(us.full_name, us.username, o.opened_by) AS opened_by_name,
               COALESCE(totals.remaining, 0) AS remaining, COALESCE(totals.items, 0) AS items_count,
               COALESCE(paid.amount, 0) AS paid_amount
        FROM restaurant_orders_tbl o
        LEFT JOIN user_settings us ON us.user_id::text = o.opened_by
        LEFT JOIN LATERAL (
          SELECT ROUND(SUM(GREATEST(i.quantity - i.paid_quantity, 0) * i.price * (1 - i.discount / 100)), 2) AS remaining,
                 COUNT(*) FILTER (WHERE i.quantity - i.paid_quantity > 0) AS items
          FROM restaurant_order_items_tbl i WHERE i.order_id = o.id
        ) totals ON TRUE
        LEFT JOIN LATERAL (SELECT SUM(amount) AS amount FROM restaurant_order_payments_tbl WHERE order_id = o.id) paid ON TRUE
        WHERE o.branch_id = ${auth.branchId} AND o.status = 'open' AND o.order_type = 'takeaway'
        ORDER BY o.opened_at
      `,
    ])
    return NextResponse.json({
      branch_id: auth.branchId,
      permissions: auth.permissions,
      locations,
      tables: tables.map((row: any) => ({
        ...row,
        remaining: Number(row.remaining) || 0,
        paid_amount: Number(row.paid_amount) || 0,
        items_count: Number(row.items_count) || 0,
      })),
      takeaways: takeaways.map((row: any) => ({
        ...row,
        remaining: Number(row.remaining) || 0,
        paid_amount: Number(row.paid_amount) || 0,
        items_count: Number(row.items_count) || 0,
      })),
      server_time: new Date().toISOString(),
    })
  } catch (error) {
    console.error("restaurant floor GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الطاولات" }, { status: errorStatus(error) })
  }
}
