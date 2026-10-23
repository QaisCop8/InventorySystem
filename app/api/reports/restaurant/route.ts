import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureRestaurantTables } from "@/lib/restaurant"

// تقارير المطاعم (view): الطاولات، الطلبات تفصيلي، الأصناف المباعة، حسب النادل، حسب الموقع، أوقات الذروة.
// الإيراد = مبالغ فواتير الدفع (restaurant_order_payments_tbl) — الدفعات الجزئية محسوبة. الطلبات المدموجة (merged)
// مستبعدة لأن أصنافها ودفعاتها انتقلت للطلب الهدف. إيراد طلب على عدة طاولات (دمج/نقل) يُقسم بالتساوي بينها.
const VIEWS = {
  tables: "restaurant-tables-report",
  orders: "restaurant-orders-report",
  items: "restaurant-items-report",
  waiters: "restaurant-waiters-report",
  locations: "restaurant-locations-report",
  hours: "restaurant-hours-report",
} as const
type View = keyof typeof VIEWS

const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const STATUSES = ["open", "paid", "cancelled"]
const TYPES = ["dine_in", "takeaway"]

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const view = (params.get("view") || "tables") as View
    if (!(view in VIEWS)) return NextResponse.json({ error: "نوع التقرير غير صالح" }, { status: 400 })
    const denied = await reportAccessDenied(request, [VIEWS[view]])
    if (denied) return denied
    await ensureRestaurantTables()

    if (params.get("meta") === "1") {
      const [locations, branches, users] = await Promise.all([
        sql`SELECT id, name, code FROM restaurant_locations_tbl WHERE status <> 3 ORDER BY sort_order, id`,
        sql`SELECT DISTINCT b.id, b.branch_name AS name FROM restaurant_locations_tbl l JOIN branches b ON b.id = l.branch_id WHERE l.status <> 3 ORDER BY 2`,
        sql`SELECT DISTINCT o.opened_by AS id, COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), o.opened_by) AS name
            FROM restaurant_orders_tbl o LEFT JOIN user_settings us ON us.user_id::text = o.opened_by WHERE o.opened_by IS NOT NULL ORDER BY 2`,
      ])
      return NextResponse.json({ locations, branches, users })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), `${today.slice(0, 7)}-01`)
    const to = isoDate(params.get("to_date"), today)
    const locationIds = ids(params.get("location_ids"))
    const branchIds = ids(params.get("branch_ids"))
    const statuses = String(params.get("statuses") || "").split(",").filter((status) => STATUSES.includes(status))
    const types = String(params.get("order_types") || "").split(",").filter((type) => TYPES.includes(type))
    const userIds = String(params.get("user_ids") || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 200)

    // نص واحد بمعاملات مرقّمة (لا تداخل أجزاء sql`` — انظر ملاحظة إعادة الترقيم في lib/database.ts)
    const values: unknown[] = []
    const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
    const where = [
      `o.status <> 'merged'`,
      `o.opened_at::date BETWEEN ${bind(from)}::date AND ${bind(to)}::date`,
      locationIds.length ? `o.location_id = ANY(${bind(locationIds)}::int[])` : "",
      branchIds.length ? `o.branch_id = ANY(${bind(branchIds)}::int[])` : "",
      statuses.length ? `o.status = ANY(${bind(statuses)}::text[])` : "",
      types.length ? `o.order_type = ANY(${bind(types)}::text[])` : "",
      userIds.length ? `o.opened_by = ANY(${bind(userIds)}::text[])` : "",
    ].filter(Boolean).join(" AND ")

    const base = `
      f AS (
        SELECT o.*,
          COALESCE(paid.amount, 0) AS paid_amount, paid.invoices,
          EXTRACT(EPOCH FROM (COALESCE(o.closed_at, NOW()) - o.opened_at)) / 60 AS minutes
        FROM restaurant_orders_tbl o
        LEFT JOIN LATERAL (
          SELECT SUM(amount) AS amount, string_agg(NULLIF(vch_code, ''), '، ' ORDER BY id) AS invoices
          FROM restaurant_order_payments_tbl WHERE order_id = o.id
        ) paid ON TRUE
        WHERE ${where}
      )`
    const userName = (column: string) => `COALESCE((SELECT COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), ${column}) FROM user_settings us WHERE us.user_id::text = ${column} LIMIT 1), ${column})`

    let text = ""
    if (view === "tables") {
      const tableFilters = [
        `t.status <> 3`, `l.status <> 3`,
        locationIds.length ? `t.location_id = ANY(${bind(locationIds)}::int[])` : "",
        branchIds.length ? `l.branch_id = ANY(${bind(branchIds)}::int[])` : "",
      ].filter(Boolean).join(" AND ")
      text = `WITH ${base},
        tt AS (SELECT DISTINCT ot.order_id, ot.table_id FROM restaurant_order_tables_tbl ot JOIN f ON f.id = ot.order_id),
        cnt AS (SELECT order_id, COUNT(*) AS n FROM tt GROUP BY order_id)
        SELECT t.id, t.name AS table_name, l.name AS location_name, b.branch_name, t.seats,
          COUNT(f.id) FILTER (WHERE f.status <> 'cancelled')::int AS times_used,
          COUNT(f.id) FILTER (WHERE f.status = 'cancelled')::int AS cancelled,
          COALESCE(SUM(f.guests) FILTER (WHERE f.status <> 'cancelled'), 0)::int AS guests,
          ROUND(COALESCE(SUM(f.paid_amount / cnt.n), 0)::numeric, 2) AS revenue,
          ROUND(COALESCE(SUM(f.paid_amount / cnt.n) / NULLIF(COUNT(f.id) FILTER (WHERE f.status <> 'cancelled'), 0), 0)::numeric, 2) AS avg_revenue,
          ROUND(AVG(f.minutes) FILTER (WHERE f.status = 'paid'))::int AS avg_minutes,
          MAX(f.opened_at) AS last_used
        FROM restaurant_tables_tbl t
        JOIN restaurant_locations_tbl l ON l.id = t.location_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN tt ON tt.table_id = t.id
        LEFT JOIN f ON f.id = tt.order_id
        LEFT JOIN cnt ON cnt.order_id = f.id
        WHERE ${tableFilters}
        GROUP BY t.id, t.name, l.name, b.branch_name, t.seats, l.sort_order, t.sort_order
        ORDER BY revenue DESC, times_used DESC, l.sort_order, t.sort_order`
    } else if (view === "orders") {
      text = `WITH ${base}
        SELECT f.id, f.order_no, f.opened_at, f.closed_at, f.status, f.order_type, f.guests, f.takeaway_name,
          l.name AS location_name, b.branch_name,
          (SELECT string_agg(DISTINCT t.name, ' + ') FROM restaurant_order_tables_tbl ot JOIN restaurant_tables_tbl t ON t.id = ot.table_id WHERE ot.order_id = f.id) AS tables,
          ${userName("f.opened_by")} AS opened_by_name,
          (SELECT COUNT(*)::int FROM restaurant_order_items_tbl i WHERE i.order_id = f.id) AS items,
          ROUND(f.minutes)::int AS minutes, f.paid_amount, f.invoices, f.cancel_reason
        FROM f
        JOIN restaurant_locations_tbl l ON l.id = f.location_id
        LEFT JOIN branches b ON b.id = f.branch_id
        ORDER BY f.opened_at DESC`
    } else if (view === "items") {
      text = `WITH ${base}
        SELECT i.product_id, MAX(i.product_code) AS product_code, MAX(i.product_name) AS product_name, MAX(i.unit_name) AS unit_name,
          COUNT(DISTINCT i.order_id)::int AS orders,
          ROUND(SUM(i.paid_quantity)::numeric, 3) AS quantity,
          ROUND(AVG(i.price)::numeric, 2) AS avg_price,
          ROUND(SUM(i.paid_quantity * i.price * (1 - i.discount / 100))::numeric, 2) AS value
        FROM restaurant_order_items_tbl i JOIN f ON f.id = i.order_id
        WHERE f.status <> 'cancelled' AND i.paid_quantity > 0
        GROUP BY i.product_id
        ORDER BY value DESC`
    } else if (view === "waiters") {
      text = `WITH ${base}
        SELECT f.opened_by AS user_id, ${userName("f.opened_by")} AS user_name,
          COUNT(*) FILTER (WHERE f.status <> 'cancelled')::int AS orders,
          COUNT(*) FILTER (WHERE f.order_type = 'takeaway' AND f.status <> 'cancelled')::int AS takeaway_orders,
          COUNT(*) FILTER (WHERE f.status = 'cancelled')::int AS cancelled,
          COALESCE(SUM(f.guests) FILTER (WHERE f.status <> 'cancelled'), 0)::int AS guests,
          ROUND(SUM(f.paid_amount)::numeric, 2) AS revenue,
          ROUND((SUM(f.paid_amount) / NULLIF(COUNT(*) FILTER (WHERE f.status <> 'cancelled'), 0))::numeric, 2) AS avg_revenue
        FROM f GROUP BY f.opened_by ORDER BY revenue DESC NULLS LAST`
    } else if (view === "locations") {
      text = `WITH ${base}
        SELECT l.id, l.name AS location_name, b.branch_name,
          COUNT(f.id) FILTER (WHERE f.status <> 'cancelled')::int AS orders,
          COUNT(f.id) FILTER (WHERE f.order_type = 'dine_in' AND f.status <> 'cancelled')::int AS dine_in_orders,
          COUNT(f.id) FILTER (WHERE f.order_type = 'takeaway' AND f.status <> 'cancelled')::int AS takeaway_orders,
          COUNT(f.id) FILTER (WHERE f.status = 'cancelled')::int AS cancelled,
          COALESCE(SUM(f.guests) FILTER (WHERE f.status <> 'cancelled'), 0)::int AS guests,
          ROUND(COALESCE(SUM(f.paid_amount), 0)::numeric, 2) AS revenue,
          ROUND(COALESCE(SUM(f.paid_amount) / NULLIF(COUNT(f.id) FILTER (WHERE f.status <> 'cancelled'), 0), 0)::numeric, 2) AS avg_revenue,
          ROUND(AVG(f.minutes) FILTER (WHERE f.status = 'paid'))::int AS avg_minutes
        FROM f JOIN restaurant_locations_tbl l ON l.id = f.location_id LEFT JOIN branches b ON b.id = l.branch_id
        GROUP BY l.id, l.name, b.branch_name, l.sort_order ORDER BY revenue DESC`
    } else {
      text = `WITH ${base}
        SELECT EXTRACT(HOUR FROM f.opened_at)::int AS hour,
          COUNT(*) FILTER (WHERE f.status <> 'cancelled')::int AS orders,
          COALESCE(SUM(f.guests) FILTER (WHERE f.status <> 'cancelled'), 0)::int AS guests,
          ROUND(SUM(f.paid_amount)::numeric, 2) AS revenue,
          ROUND((SUM(f.paid_amount) / NULLIF(COUNT(*) FILTER (WHERE f.status <> 'cancelled'), 0))::numeric, 2) AS avg_revenue
        FROM f GROUP BY 1 ORDER BY 1`
    }
    const rows = await sql.unsafe(text, values)
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("restaurant reports", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل التقرير" }, { status: 500 })
  }
}
