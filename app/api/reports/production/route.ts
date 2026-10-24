import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureProductionTables } from "@/lib/production-vouchers"

// تقارير الانتاج (view): تفصيلي (سطر لكل صنف بكل سند) · المواد المنتجة حسب الصنف · استهلاك المواد الخام حسب الصنف
// · تكلفة كل سند (قيمة المنتَج مقابل الخام). الافتراضي السندات المعتمدة فقط.
const VIEWS = {
  detailed: "production-detailed-report",
  produced: "production-produced-report",
  raw: "production-raw-report",
  vouchers: "production-vouchers-report",
} as const
type View = keyof typeof VIEWS

const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const view = (params.get("view") || "detailed") as View
    if (!(view in VIEWS)) return NextResponse.json({ error: "نوع التقرير غير صالح" }, { status: 400 })
    const denied = await reportAccessDenied(request, [VIEWS[view]])
    if (denied) return denied
    await ensureProductionTables()

    if (params.get("meta") === "1") {
      const [branches, warehouses] = await Promise.all([
        sql`SELECT id, branch_name AS name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY id`,
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
    const rows = await sql.unsafe(text, values)
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("production reports", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل التقرير" }, { status: 500 })
  }
}
