import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureProductionTables, productionProductsInfo } from "@/lib/production-vouchers"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"

// تقارير الانتاج (view): تفصيلي (سطر لكل صنف بكل سند) · المواد المنتجة حسب الصنف · استهلاك المواد الخام حسب الصنف
// · تكلفة كل سند (قيمة المنتَج مقابل الخام). الافتراضي السندات المعتمدة فقط.
const VIEWS = {
  detailed: "production-detailed-report",
  produced: "production-produced-report",
  raw: "production-raw-report",
  vouchers: "production-vouchers-report",
  // 2026-11-24 المرحلة 4: انحراف الاستهلاك عن الوصفة، ربحية المنتجات (فعلي مقابل معياري وسعر البيع)، إنتاجية العمال ومراكز العمل، ولوحة الانتاج
  variance: "production-variance-report",
  profitability: "production-profitability-report",
  workers: "production-workers-report",
  centers: "production-centers-report",
  dashboard: "production-dashboard",
} as const
type View = keyof typeof VIEWS

const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)

export async function GET(request: NextRequest) {
  // الفهارس تُبنى بالخلفية مرة لكل قاعدة — لا ينتظرها التقرير
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const params = request.nextUrl.searchParams
    const view = (params.get("view") || "detailed") as View
    if (!(view in VIEWS)) return NextResponse.json({ error: "نوع التقرير غير صالح" }, { status: 400 })
    const denied = await reportAccessDenied(request, [VIEWS[view]])
    if (denied) return denied
    await ensureProductionTables()

    if (params.get("meta") === "1") {
      const [branches, warehouses] = await Promise.all([
        sql`SELECT id, branch_name AS name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND COALESCE(status, 1) <> 3 ORDER BY id`,
        sql`SELECT id, warehouse_code AS code, warehouse_name AS name FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY id`,
      ])
      return NextResponse.json({ branches, warehouses })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), `${today.slice(0, 7)}-01`)
    const to = isoDate(params.get("to_date"), today)
    const branchIds = ids(params.get("branch_ids"))
    const warehouseIds = ids(params.get("warehouse_ids"))
    const statuses = String(params.get("statuses") || "2").split(",").map(Number).filter((status) => [1, 2].includes(status))
    const search = String(params.get("q") || "").trim()

    // نص واحد بمعاملات مرقّمة (لا تداخل أجزاء sql`` — انظر ملاحظة إعادة الترقيم في lib/database.ts)
    const values: unknown[] = []
    const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
    const where = [
      `p.vch_date BETWEEN ${bind(from)}::date AND ${bind(to)}::date`,
      `p.status = ANY(${bind(statuses.length ? statuses : [2])}::int[])`,
      branchIds.length ? `p.branch_id = ANY(${bind(branchIds)}::int[])` : "",
      warehouseIds.length ? `(CASE WHEN i.role = 1 THEN p.finished_store_id ELSE p.raw_store_id END) = ANY(${bind(warehouseIds)}::int[])` : "",
      search ? `(pr.product_name ILIKE ${bind(`%${search}%`)} OR pr.product_code ILIKE ${bind(`%${search}%`)} OR p.code ILIKE ${bind(`%${search}%`)})` : "",
    ].filter(Boolean).join(" AND ")
    // شروط رأس السند فقط (تقارير العمال/المراكز/اللوحة لا تمر بأسطر الأصناف)
    const headerValues: unknown[] = []
    const hbind = (value: unknown) => { headerValues.push(value); return `${headerValues.length}` }
    const headerWhere = [
      `p.vch_date BETWEEN ${hbind(from)}::date AND ${hbind(to)}::date`,
      `p.status = ANY(${hbind(statuses.length ? statuses : [2])}::int[])`,
      branchIds.length ? `p.branch_id = ANY(${hbind(branchIds)}::int[])` : "",
    ].filter(Boolean).join(" AND ")

    if (view === "dashboard") return NextResponse.json(await dashboard(headerWhere, headerValues, branchIds, from, to))
    if (view === "workers") {
      const rows = await sql.unsafe(`
        SELECT w.employee_id, MAX(w.worker_name) AS worker_name, COUNT(DISTINCT p.id)::int AS vouchers,
          ROUND(SUM(w.hours)::numeric, 2) AS hours, ROUND(SUM(w.hours * w.hourly_rate)::numeric, 2) AS labor_cost,
          ROUND((SUM(w.hours * w.hourly_rate) / NULLIF(SUM(w.hours), 0))::numeric, 3) AS avg_rate,
          ROUND(SUM(pv.quantity)::numeric, 3) AS produced_quantity, ROUND(SUM(pv.value)::numeric, 2) AS produced_value
        FROM production_vouchers_tbl p
        JOIN production_voucher_workers_tbl w ON w.production_id = p.id
        LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity, SUM(quantity * price) AS value FROM production_voucher_items_tbl WHERE production_id = p.id AND role = 1) pv ON TRUE
        WHERE ${headerWhere}
        GROUP BY w.employee_id, COALESCE(w.employee_id::text, w.worker_name)
        ORDER BY hours DESC`, headerValues)
      return NextResponse.json({ rows })
    }
    if (view === "centers") {
      const rows = await sql.unsafe(`
        SELECT wc.id, wc.name AS center_name, COUNT(p.id)::int AS vouchers, ROUND(SUM(COALESCE(p.machine_hours, 0))::numeric, 2) AS machine_hours,
          ROUND(SUM(COALESCE(oc.amount, 0))::numeric, 2) AS overhead_cost,
          ROUND(SUM(COALESCE(pv.quantity, 0))::numeric, 3) AS produced_quantity, ROUND(SUM(COALESCE(pv.value, 0))::numeric, 2) AS produced_value,
          ROUND((SUM(COALESCE(pv.quantity, 0)) / NULLIF(SUM(COALESCE(p.machine_hours, 0)), 0))::numeric, 3) AS output_per_hour
        FROM production_vouchers_tbl p
        JOIN production_work_centers_tbl wc ON wc.id = p.work_center_id
        LEFT JOIN LATERAL (SELECT SUM(quantity) AS quantity, SUM(quantity * price) AS value FROM production_voucher_items_tbl WHERE production_id = p.id AND role = 1) pv ON TRUE
        LEFT JOIN LATERAL (SELECT SUM(amount) AS amount FROM production_voucher_costs_tbl WHERE production_id = p.id AND cost_type = 'overhead') oc ON TRUE
        WHERE ${headerWhere}
        GROUP BY wc.id, wc.name
        ORDER BY produced_value DESC`, headerValues)
      return NextResponse.json({ rows })
    }

    const base = `
      FROM production_vouchers_tbl p
      JOIN production_voucher_items_tbl i ON i.production_id = p.id
      LEFT JOIN products pr ON pr.id = i.item_id
      LEFT JOIN units u ON u.id = i.unit_id
      LEFT JOIN branches b ON b.id = p.branch_id
      LEFT JOIN warehouses w ON w.id = CASE WHEN i.role = 1 THEN p.finished_store_id ELSE p.raw_store_id END
      WHERE ${where}`

    let text = ""
    if (view === "detailed") {
      text = `
        SELECT p.id AS production_id, p.code, p.vch_date::text AS vch_date, p.status, b.branch_name, i.role,
          pr.product_code, pr.product_name, u.unit_name, w.warehouse_name,
          ROUND(i.quantity::numeric, 3) AS quantity, ROUND(i.price::numeric, 3) AS price, ROUND((i.quantity * i.price)::numeric, 2) AS value
        ${base}
        ORDER BY p.vch_date DESC, p.id DESC, i.role, i.sort_order`
    } else if (view === "produced" || view === "raw") {
      text = `
        SELECT i.item_id, MAX(pr.product_code) AS product_code, MAX(pr.product_name) AS product_name, MAX(u.unit_name) AS unit_name,
          COUNT(DISTINCT p.id)::int AS vouchers,
          ROUND(SUM(i.quantity)::numeric, 3) AS quantity,
          ROUND(SUM(i.quantity * i.price)::numeric, 2) AS value,
          ROUND((SUM(i.quantity * i.price) / NULLIF(SUM(i.quantity), 0))::numeric, 3) AS avg_price
        ${base} AND i.role = ${view === "produced" ? 1 : 2}
        GROUP BY i.item_id
        ORDER BY value DESC, quantity DESC`
    } else if (view === "variance") {
      // الكمية المعيارية = الوصفة (مع الهدر المتوقع) × الكمية المنتجة، محفوظة على سطر الخام المضاف من الوصفة
      text = `
        SELECT i.item_id, MAX(pr.product_code) AS product_code, MAX(pr.product_name) AS product_name, MAX(u.unit_name) AS unit_name,
          COUNT(DISTINCT p.id)::int AS vouchers,
          ROUND(SUM(i.standard_quantity)::numeric, 3) AS standard_quantity,
          ROUND(SUM(i.quantity)::numeric, 3) AS quantity,
          ROUND(SUM(i.quantity - i.standard_quantity)::numeric, 3) AS variance_quantity,
          ROUND((100 * SUM(i.quantity - i.standard_quantity) / NULLIF(SUM(i.standard_quantity), 0))::numeric, 2) AS variance_percent,
          ROUND(SUM((i.quantity - i.standard_quantity) * i.price)::numeric, 2) AS variance_value
        ${base} AND i.role = 2 AND i.standard_quantity IS NOT NULL
        GROUP BY i.item_id
        ORDER BY ABS(SUM((i.quantity - i.standard_quantity) * i.price)) DESC`
    } else if (view === "profitability") {
      text = `
        SELECT i.item_id, MAX(pr.product_code) AS product_code, MAX(pr.product_name) AS product_name, MAX(u.unit_name) AS unit_name,
          COUNT(DISTINCT p.id)::int AS vouchers,
          ROUND(SUM(i.quantity)::numeric, 3) AS quantity,
          ROUND(SUM(i.quantity * i.price)::numeric, 2) AS value,
          ROUND((SUM(i.quantity * i.price) / NULLIF(SUM(i.quantity), 0))::numeric, 4) AS actual_unit_cost
        ${base} AND i.role = 1
        GROUP BY i.item_id
        ORDER BY value DESC`
    } else {
      text = `
        SELECT p.id AS production_id, p.code, p.vch_date::text AS vch_date, p.status, b.branch_name,
          MAX(CASE WHEN i.role = 1 THEN w.warehouse_name END) AS finished_store_name,
          MAX(CASE WHEN i.role = 2 THEN w.warehouse_name END) AS raw_store_name,
          string_agg(CASE WHEN i.role = 1 THEN pr.product_name END, '، ' ORDER BY i.sort_order) AS produced_names,
          ROUND(SUM(CASE WHEN i.role = 1 THEN i.quantity ELSE 0 END)::numeric, 3) AS produced_quantity,
          ROUND(SUM(CASE WHEN i.role = 1 THEN i.quantity * i.price ELSE 0 END)::numeric, 2) AS produced_value,
          ROUND(SUM(CASE WHEN i.role = 2 THEN i.quantity * i.price ELSE 0 END)::numeric, 2) AS raw_value,
          ROUND(SUM(CASE WHEN i.role = 1 THEN i.quantity * i.price ELSE -(i.quantity * i.price) END)::numeric, 2) AS difference
        ${base}
        GROUP BY p.id, p.code, p.vch_date, p.status, b.branch_name
        ORDER BY p.vch_date DESC, p.id DESC`
    }
    const rows = (await sql.unsafe(text, values)) as any[]
    if (view === "profitability") return NextResponse.json({ rows: await withProfitability(rows, from, to) })
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("production reports", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل التقرير" }, { status: 500 })
  }
}

const num = (value: unknown) => Number(value) || 0
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

/**
 * ربحية المنتجات: الكلفة المعيارية للوحدة (الوصفة مع الهدر بمتوسط الكلفة بنهاية الفترة + تكاليف الوصفة) مقابل الكلفة الفعلية،
 * ومتوسط سعر البيع للوحدة الرئيسية من فواتير المبيعات في الفترة ⇐ هامش الوحدة ونسبته.
 */
async function withProfitability(rows: any[], from: string, to: string) {
  const ids = rows.map((row) => Number(row.item_id)).filter(Boolean)
  if (!ids.length) return rows
  const [infos, sales] = await Promise.all([
    productionProductsInfo(ids, to),
    sql`
      SELECT vi.item_id,
        SUM(COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0) * COALESCE(NULLIF(vh.rate, 0), 1)) AS amount,
        SUM(COALESCE(NULLIF(to_jsonb(vi)->>'main_unit_quantity', '')::numeric, vi.qnty, 0)) AS quantity
      FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      WHERE vh.vch_type = 12 AND vh.status IS DISTINCT FROM 3 AND vi.item_id = ANY(${ids}::int[])
        AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day')
      GROUP BY vi.item_id
    `.catch(() => [] as any[]),
  ])
  const byId = new Map(infos.map((info) => [info.product.id, info]))
  const saleById = new Map((sales as any[]).map((row) => [Number(row.item_id), num(row.quantity) > 0 ? num(row.amount) / num(row.quantity) : 0]))
  return rows.map((row) => {
    const info = byId.get(Number(row.item_id))
    const recipeCosts = info?.recipe ? num(info.recipe.labor_cost) + num(info.recipe.overhead_cost) + num(info.recipe.packaging_cost) : 0
    const standard = info && info.components.length ? info.components.reduce((sum, component) => sum + component.per_unit * component.product.price, 0) + recipeCosts : null
    const actual = num(row.actual_unit_cost)
    const sale = saleById.get(Number(row.item_id)) || 0
    return {
      ...row,
      standard_unit_cost: standard === null ? null : round(standard, 4),
      cost_variance_percent: standard ? round(((actual - standard) / standard) * 100) : null,
      avg_sale_price: sale ? round(sale, 4) : null,
      unit_margin: sale ? round(sale - actual, 4) : null,
      margin_percent: sale ? round(((sale - actual) / sale) * 100) : null,
    }
  })
}

/** لوحة الانتاج: مؤشرات الفترة، الانتاج اليومي، توزيع الكلفة، أعلى المنتجات، أوامر الانتاج المفتوحة/المتأخرة، والهدر. */
async function dashboard(where: string, values: unknown[], branchIds: number[], from: string, to: string) {
  const [kpis, costs, daily, top, variance, orders] = await Promise.all([
    sql.unsafe(`
      SELECT COUNT(DISTINCT p.id)::int AS vouchers,
        COALESCE(SUM(i.quantity) FILTER (WHERE i.role = 1), 0) AS produced_quantity,
        COALESCE(SUM(i.quantity * i.price) FILTER (WHERE i.role = 1), 0) AS produced_value,
        COALESCE(SUM(i.quantity * i.price) FILTER (WHERE i.role = 2), 0) AS raw_value,
        COUNT(DISTINCT i.item_id) FILTER (WHERE i.role = 1)::int AS products
      FROM production_vouchers_tbl p JOIN production_voucher_items_tbl i ON i.production_id = p.id
      WHERE ${where}`, values),
    sql.unsafe(`
      SELECT c.cost_type, COALESCE(SUM(c.amount), 0) AS amount
      FROM production_vouchers_tbl p JOIN production_voucher_costs_tbl c ON c.production_id = p.id
      WHERE ${where} GROUP BY c.cost_type`, values),
    sql.unsafe(`
      SELECT p.vch_date::text AS day,
        COALESCE(SUM(i.quantity * i.price) FILTER (WHERE i.role = 1), 0) AS produced_value,
        COALESCE(SUM(i.quantity * i.price) FILTER (WHERE i.role = 2), 0) AS raw_value,
        COUNT(DISTINCT p.id)::int AS vouchers
      FROM production_vouchers_tbl p JOIN production_voucher_items_tbl i ON i.production_id = p.id
      WHERE ${where} GROUP BY p.vch_date ORDER BY p.vch_date`, values),
    sql.unsafe(`
      SELECT i.item_id, MAX(pr.product_name) AS product_name, SUM(i.quantity) AS quantity, SUM(i.quantity * i.price) AS value
      FROM production_vouchers_tbl p JOIN production_voucher_items_tbl i ON i.production_id = p.id AND i.role = 1
      LEFT JOIN products pr ON pr.id = i.item_id
      WHERE ${where} GROUP BY i.item_id ORDER BY value DESC LIMIT 8`, values),
    sql.unsafe(`
      SELECT COALESCE(SUM(i.standard_quantity * i.price), 0) AS standard_value,
        COALESCE(SUM((i.quantity - i.standard_quantity) * i.price), 0) AS variance_value
      FROM production_vouchers_tbl p JOIN production_voucher_items_tbl i ON i.production_id = p.id AND i.role = 2
      WHERE ${where} AND i.standard_quantity IS NOT NULL`, values),
    sql`
      SELECT COUNT(*) FILTER (WHERE status IN (1, 2))::int AS open_orders,
        COUNT(*) FILTER (WHERE status = 2)::int AS in_progress,
        COUNT(*) FILTER (WHERE status IN (1, 2) AND due_date IS NOT NULL AND due_date < CURRENT_DATE)::int AS late_orders,
        COUNT(*) FILTER (WHERE status = 3 AND closed_at IS NULL AND updated_at::date BETWEEN ${from}::date AND ${to}::date)::int AS completed_orders
      FROM production_orders_tbl
      WHERE (${branchIds.length === 0} OR branch_id = ANY(${branchIds}::int[]))
    `.catch(() => [{}] as any[]),
  ])
  const k = (kpis as any[])[0] || {}
  const v = (variance as any[])[0] || {}
  const extra = (costs as any[]).reduce((sum, row) => sum + num(row.amount), 0)
  const produced = num(k.produced_value)
  return {
    from, to,
    kpis: {
      vouchers: num(k.vouchers), products: num(k.products), produced_quantity: round(num(k.produced_quantity), 3), produced_value: round(produced),
      raw_value: round(num(k.raw_value)), extra_costs: round(extra),
      raw_share: produced ? round((num(k.raw_value) / produced) * 100) : 0,
      variance_value: round(num(v.variance_value)), variance_percent: num(v.standard_value) ? round((num(v.variance_value) / num(v.standard_value)) * 100) : 0,
    },
    cost_breakdown: [{ cost_type: "raw", amount: round(num(k.raw_value)) }, ...(costs as any[]).map((row) => ({ cost_type: String(row.cost_type), amount: round(num(row.amount)) }))].filter((row) => row.amount > 0),
    daily: (daily as any[]).map((row) => ({ day: String(row.day).slice(0, 10), produced_value: round(num(row.produced_value)), raw_value: round(num(row.raw_value)), vouchers: num(row.vouchers) })),
    top_products: (top as any[]).map((row) => ({ product_name: row.product_name || "", quantity: round(num(row.quantity), 3), value: round(num(row.value)) })),
    orders: (orders as any[])[0] || {},
  }
}

