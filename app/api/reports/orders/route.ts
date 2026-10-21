import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"

// تقارير الطلبيات (components/reports/orders-report.tsx) — طلبيات المبيعات (order_type 1) والمشتريات (2) من orders/order_items.
// view: detailed تفصيلي بالأسطر، total إجمالي لكل طلبية، by-item حسب الصنف، by-party حسب العميل/المورد،
// backlog الكميات غير المسلّمة، by-salesman حسب المندوب. قيمة السطر = الكمية × السعر × (1 − الخصم%).
// الحالات: 1 غير جاهزة، 2 جاهزة، 3 مرسلة جزئياً، 4 مرسلة كلياً، 5 ملغاة، 6 مغلقة.
// ملاحظة: أجزاء sql`` المتداخلة لا تُعيد ترقيم $n، لذا يُبنى الاستعلام نصاً واحداً بمعاملات مربوطة عبر bind().
const VIEWS = {
  detailed: "orders-detailed-report",
  total: "orders-total-report",
  "by-item": "orders-by-item-report",
  "by-party": "orders-by-party-report",
  backlog: "orders-backlog-report",
  "by-salesman": "orders-by-salesman-report",
  summary: "order-reports",
} as const
type View = keyof typeof VIEWS

const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)

const LINE_VALUE = "(COALESCE(oi.quantity, 0) * COALESCE(oi.price, 0) * (1 - COALESCE(oi.discount, 0) / 100.0))"
const REMAINING = "GREATEST(COALESCE(oi.quantity, 0) - COALESCE(oi.delivered_quantity, 0), 0)"

// ملخص الطلبيات (components/reports/order-reports.tsx): مؤشرات + شهري + حسب الحالة + أعلى العملاء والأصناف + المتأخرة.
// قيمة الطلبية = total_amount وإلا مجموع أسطرها. "مفتوحة" = الحالات 1-3، "متأخرة" = مفتوحة وتاريخ تسليمها مضى.
async function orderSummary(where: string, values: unknown[]) {
  const base = `
    WITH base AS (
      SELECT o.id, o.order_date, o.delivery_date, o.customer_id, COALESCE(NULLIF(o.customer_name, ''), a.name, '') AS party_name,
        COALESCE(o.order_status, 1) AS order_status, o.order_number,
        COALESCE(NULLIF(o.total_amount, 0), (SELECT SUM(${LINE_VALUE}) FROM order_items oi WHERE oi.order_id = o.id), 0) AS value
      FROM orders o LEFT JOIN account_tbl a ON a.id = o.customer_id
      WHERE ${where}
    )`
  const [kpis, monthly, byStatus, topParties, topItems, late] = await Promise.all([
    sql.unsafe(`${base}
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(value), 0) AS total_value, COALESCE(AVG(value), 0) AS avg_value,
        COUNT(*) FILTER (WHERE order_status IN (1, 2, 3))::int AS open_orders,
        COUNT(*) FILTER (WHERE order_status IN (1, 2, 3) AND delivery_date IS NOT NULL AND delivery_date::date < CURRENT_DATE)::int AS late_orders,
        COUNT(*) FILTER (WHERE order_status IN (4, 6))::int AS completed_orders,
        COUNT(*) FILTER (WHERE order_status = 5)::int AS cancelled_orders,
        COUNT(DISTINCT customer_id)::int AS parties
      FROM base`, values),
    sql.unsafe(`${base}
      SELECT to_char(date_trunc('month', order_date), 'YYYY-MM') AS month, COUNT(*)::int AS orders, COALESCE(SUM(value), 0) AS value
      FROM base GROUP BY 1 ORDER BY 1`, values),
    sql.unsafe(`${base}
      SELECT order_status, COUNT(*)::int AS orders, COALESCE(SUM(value), 0) AS value FROM base GROUP BY 1 ORDER BY 1`, values),
    sql.unsafe(`${base}
      SELECT party_name, COUNT(*)::int AS orders, COALESCE(SUM(value), 0) AS value FROM base GROUP BY customer_id, party_name ORDER BY 3 DESC LIMIT 10`, values),
    sql.unsafe(`${base}
      SELECT COALESCE(MAX(NULLIF(oi.product_name, '')), MAX(p.product_name)) AS product_name, MAX(p.product_code) AS product_code,
        COALESCE(SUM(oi.quantity), 0) AS quantity, COALESCE(SUM(${LINE_VALUE}), 0) AS value
      FROM base b JOIN order_items oi ON oi.order_id = b.id LEFT JOIN products p ON p.id = oi.product_id
      GROUP BY oi.product_id ORDER BY 3 DESC LIMIT 10`, values),
    sql.unsafe(`${base}
      SELECT id, order_number, order_date, delivery_date, party_name, order_status, value, (CURRENT_DATE - delivery_date::date) AS days_late
      FROM base WHERE order_status IN (1, 2, 3) AND delivery_date IS NOT NULL AND delivery_date::date < CURRENT_DATE
      ORDER BY delivery_date LIMIT 20`, values),
  ])
  return { kpis: kpis[0] || {}, monthly, byStatus, topParties, topItems, late }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const view = (params.get("view") || "detailed") as View
    if (!(view in VIEWS)) return NextResponse.json({ error: "نوع تقرير غير معروف" }, { status: 400 })
    const denied = await reportAccessDenied(request, [VIEWS[view]])
    if (denied) return denied
    if ((await sql`SELECT to_regclass('orders') IS NOT NULL AS ok`)[0]?.ok !== true) return NextResponse.json({ rows: [], parties: [], salesmen: [], branches: [] })

    if (params.get("meta") === "1") {
      const [parties, salesmen, branches] = await Promise.all([
        sql`SELECT DISTINCT a.id, a.code, a.name FROM orders o JOIN account_tbl a ON a.id = o.customer_id WHERE COALESCE(o.deleted, false) = false ORDER BY a.name`,
        sql`SELECT id, code, name FROM salesmen ORDER BY name`,
        sql`SELECT id, branch_code AS code, branch_name AS name FROM branches ORDER BY branch_name`,
      ])
      return NextResponse.json({ parties, salesmen, branches })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), `${today.slice(0, 7)}-01`)
    const to = isoDate(params.get("to_date"), today)
    // نوع الطلبيات اختيار متعدد (1 مبيعات، 2 مشتريات)؛ الطلبيات غير المسلّمة للمبيعات فقط
    let orderTypes = ids(params.get("order_types") ?? params.get("order_type")).filter((type) => type === 1 || type === 2)
    if (view === "backlog") orderTypes = [1]
    const statuses = ids(params.get("statuses"))
    const partyIds = ids(params.get("party_ids"))
    const salesmanIds = ids(params.get("salesman_ids"))
    const branchIds = ids(params.get("branch_ids"))
    const search = String(params.get("search") || "").trim()

    const values: unknown[] = []
    const bind = (value: unknown) => { values.push(value); return `$${values.length}` }

    const where = [
      "COALESCE(o.deleted, false) = false",
      `o.order_date::date BETWEEN ${bind(from)}::date AND ${bind(to)}::date`,
    ]
    if (orderTypes.length) where.push(`o.order_type = ANY(${bind(orderTypes)}::int[])`)
    if (statuses.length) where.push(`COALESCE(o.order_status, 1) = ANY(${bind(statuses)}::int[])`)
    if (partyIds.length) where.push(`o.customer_id = ANY(${bind(partyIds)}::int[])`)
    if (salesmanIds.length) where.push(`o.salesman_id = ANY(${bind(salesmanIds)}::int[])`)
    if (branchIds.length) where.push(`o.branch_id = ANY(${bind(branchIds)}::int[])`)
    if (view === "summary") return NextResponse.json({ ...(await orderSummary(where.join(" AND "), values)), from, to })
    const like = search ? bind(`%${search}%`) : ""
    const itemSearch = search ? `(p.product_code ILIKE ${like} OR COALESCE(NULLIF(oi.product_name, ''), p.product_name) ILIKE ${like} OR oi.barcode ILIKE ${like})` : ""

    let text = ""
    if (view === "detailed" || view === "backlog") {
      if (itemSearch) where.push(itemSearch)
      if (view === "backlog") where.push(`${REMAINING} > 0`, "COALESCE(o.order_status, 1) NOT IN (5, 6)")
      text = `
        SELECT o.id AS order_id, o.order_number, o.order_date, o.delivery_date, o.order_type, COALESCE(o.order_status, 1) AS order_status,
          COALESCE(NULLIF(o.customer_name, ''), a.name, '') AS party_name, a.code AS party_code, s.name AS salesman_name, b.branch_name,
          c.currency_code, p.product_code, COALESCE(NULLIF(oi.product_name, ''), p.product_name) AS product_name, u.unit_name,
          COALESCE(oi.quantity, 0) AS quantity, COALESCE(oi.bonus, 0) AS bonus, COALESCE(oi.delivered_quantity, 0) AS delivered_quantity,
          ${REMAINING} AS remaining_quantity, COALESCE(oi.price, 0) AS price, COALESCE(oi.discount, 0) AS discount, ${LINE_VALUE} AS line_value,
          CASE WHEN o.delivery_date IS NOT NULL AND o.delivery_date::date < CURRENT_DATE AND ${REMAINING} > 0 THEN (CURRENT_DATE - o.delivery_date::date) END AS days_late
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN units u ON u.id = oi.unit_id
        LEFT JOIN account_tbl a ON a.id = o.customer_id
        LEFT JOIN salesmen s ON s.id = o.salesman_id
        LEFT JOIN branches b ON b.id = o.branch_id
        LEFT JOIN currency c ON c.id = o.currency_id
        WHERE ${where.join(" AND ")}
        ORDER BY o.order_date DESC, o.id DESC, oi.id
        LIMIT 5000`
    } else if (view === "total") {
      if (search) where.push(`(o.order_number ILIKE ${like} OR COALESCE(NULLIF(o.customer_name, ''), a.name, '') ILIKE ${like} OR o.reference_number ILIKE ${like})`)
      text = `
        SELECT o.id AS order_id, o.order_number, o.order_date, o.delivery_date, o.order_type, COALESCE(o.order_status, 1) AS order_status,
          COALESCE(NULLIF(o.customer_name, ''), a.name, '') AS party_name, a.code AS party_code, s.name AS salesman_name, b.branch_name, c.currency_code,
          o.reference_number, o.customer_order_no,
          COUNT(oi.id)::int AS lines, COALESCE(SUM(oi.quantity), 0) AS quantity, COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity,
          COALESCE(SUM(${REMAINING}), 0) AS remaining_quantity, COALESCE(SUM(${LINE_VALUE}), 0) AS items_value,
          COALESCE(o.discount_amount, 0) AS discount_amount, COALESCE(o.vat_amount, 0) AS vat_amount,
          COALESCE(NULLIF(o.total_amount, 0), SUM(${LINE_VALUE}), 0) AS total_amount
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN account_tbl a ON a.id = o.customer_id
        LEFT JOIN salesmen s ON s.id = o.salesman_id
        LEFT JOIN branches b ON b.id = o.branch_id
        LEFT JOIN currency c ON c.id = o.currency_id
        WHERE ${where.join(" AND ")}
        GROUP BY o.id, a.name, a.code, s.name, b.branch_name, c.currency_code
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT 5000`
    } else if (view === "by-item") {
      if (itemSearch) where.push(itemSearch)
      text = `
        SELECT oi.product_id, MAX(p.product_code) AS product_code, COALESCE(MAX(NULLIF(oi.product_name, '')), MAX(p.product_name)) AS product_name, MAX(u.unit_name) AS unit_name,
          COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(oi.quantity), 0) AS quantity, COALESCE(SUM(oi.bonus), 0) AS bonus,
          COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity, COALESCE(SUM(${REMAINING}), 0) AS remaining_quantity,
          COALESCE(SUM(${LINE_VALUE}), 0) AS line_value,
          CASE WHEN SUM(oi.quantity) > 0 THEN SUM(${LINE_VALUE}) / SUM(oi.quantity) END AS avg_price
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN units u ON u.id = oi.unit_id
        WHERE ${where.join(" AND ")}
        GROUP BY oi.product_id
        ORDER BY SUM(oi.quantity) DESC NULLS LAST
        LIMIT 5000`
    } else if (view === "by-party") {
      if (search) where.push(`(COALESCE(a.name, o.customer_name, '') ILIKE ${like} OR a.code ILIKE ${like})`)
      text = `
        SELECT o.customer_id AS party_id, a.code AS party_code, COALESCE(a.name, MAX(o.customer_name), '') AS party_name,
          COUNT(DISTINCT o.id)::int AS orders,
          COUNT(DISTINCT o.id) FILTER (WHERE COALESCE(o.order_status, 1) IN (1, 2, 3))::int AS open_orders,
          COALESCE(SUM(oi.quantity), 0) AS quantity, COALESCE(SUM(oi.delivered_quantity), 0) AS delivered_quantity,
          COALESCE(SUM(${REMAINING}), 0) AS remaining_quantity, COALESCE(SUM(${LINE_VALUE}), 0) AS line_value,
          MAX(o.order_date) AS last_order_date
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN account_tbl a ON a.id = o.customer_id
        WHERE ${where.join(" AND ")}
        GROUP BY o.customer_id, a.code, a.name
        ORDER BY SUM(${LINE_VALUE}) DESC NULLS LAST
        LIMIT 5000`
    } else {
      if (search) where.push(`COALESCE(s.name, '') ILIKE ${like}`)
      text = `
        SELECT o.salesman_id, COALESCE(s.name, 'بدون مندوب') AS salesman_name, s.code AS salesman_code,
          COUNT(DISTINCT o.id)::int AS orders, COUNT(DISTINCT o.customer_id)::int AS parties,
          COUNT(DISTINCT o.id) FILTER (WHERE COALESCE(o.order_status, 1) IN (4, 6))::int AS completed_orders,
          COUNT(DISTINCT o.id) FILTER (WHERE COALESCE(o.order_status, 1) = 5)::int AS cancelled_orders,
          COALESCE(SUM(oi.quantity), 0) AS quantity, COALESCE(SUM(${LINE_VALUE}), 0) AS line_value
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN salesmen s ON s.id = o.salesman_id
        WHERE ${where.join(" AND ")}
        GROUP BY o.salesman_id, s.name, s.code
        ORDER BY SUM(${LINE_VALUE}) DESC NULLS LAST`
    }
    const rows = await sql.unsafe(text, values)
    return NextResponse.json({ rows, from, to })
  } catch (error) {
    console.error("[reports/orders] failed", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير الطلبيات" }, { status: 500 })
  }
}
