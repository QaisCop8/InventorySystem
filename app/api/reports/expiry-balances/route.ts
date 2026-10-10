import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportDate } from "@/lib/item-inventory-reports"
import { lotBalances } from "@/lib/stock-lots"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// تقرير أرصدة الأصناف حسب تاريخ الصلاحية: رصيد كل صنف مفصَّلاً حسب (المستودع، تاريخ الصلاحية، الرقم
// التشغيلي) حتى تاريخ التقرير — من دفتر الدفعات نفسه الذي تعتمده سندات المخزون والجرد (lib/stock-lots.ts،
// المرحّل فقط كبقية تقارير المخزون)، بالوحدة الرئيسية. لكل دفعة: الأيام المتبقية وحالة الصلاحية
// (منتهي / قريب الانتهاء خلال N يوم / ساري).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const parseIds = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const round = (value: number) => Math.round(value * 1000) / 1000

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["expiry-balances-report"])
    if (reportDenied) return reportDenied
    const params = request.nextUrl.searchParams

    const [products, warehouses, branches] = await Promise.all([
      sql`SELECT p.id, p.product_code, p.product_name, u.unit_name AS main_unit, g.group_name AS category,
            COALESCE((to_jsonb(p)->>'has_expiry_date')::boolean, false) AS has_expiry
          FROM products p
          LEFT JOIN units u ON u.id = p.measurment_unit
          LEFT JOIN item_groups g ON g.id = p.category_id
          WHERE COALESCE(p.deleted, false) = false AND COALESCE(p.status, 1) <> 3 AND COALESCE(p.type, 1) = 1
          ORDER BY p.product_code, p.product_name`,
      sql`SELECT id, warehouse_code code, warehouse_name name FROM warehouses WHERE COALESCE(status, 1) <> 3 ORDER BY warehouse_code`,
      sql`SELECT id, branch_code code, branch_name name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_code`,
    ])
    if (params.get("meta") === "1") {
      // الفلتر يعرض الأصناف المتتبَّعة بالصلاحية فقط (بقية الأصناف لا صلاحية لها أصلاً)
      return NextResponse.json({ products: (products as any[]).filter((row) => row.has_expiry), warehouses, branches })
    }

    const toDate = reportDate(params.get("to_date"))
    const productIds = parseIds(params.get("product_ids"))
    const warehouseIds = parseIds(params.get("warehouse_ids"))
    const branchIds = parseIds(params.get("branch_ids"))
    const nearDays = Math.max(1, Math.min(3650, Number(params.get("near_days")) || 30))
    const status = params.get("status") || "all" // all | expired | near | valid
    const includeNoExpiry = params.get("include_no_expiry") === "1"
    const fromExpiry = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from_expiry") || "") ? String(params.get("from_expiry")) : null
    const toExpiry = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to_expiry") || "") ? String(params.get("to_expiry")) : null

    const productById = new Map((products as any[]).map((row) => [Number(row.id), row]))
    // افتراضياً: الأصناف المتتبَّعة بالصلاحية فقط (إلا إن اختيرت أصناف بعينها)
    const scopeIds = productIds.length ? productIds : (products as any[]).filter((row) => row.has_expiry).map((row) => Number(row.id))
    if (!scopeIds.length) return NextResponse.json({ to_date: toDate, near_days: nearDays, rows: [] })
    const scopeWarehouses = (warehouses as any[]).filter((row) => !warehouseIds.length || warehouseIds.includes(Number(row.id)))
    const branchScope: (number | null)[] = branchIds.length ? branchIds : [null]

    const end = Date.parse(toDate)
    const rows: any[] = []
    for (const warehouse of scopeWarehouses) {
      for (const branchId of branchScope) {
        const lots = await lotBalances({ warehouseId: Number(warehouse.id), productIds: scopeIds, branchId, toDate, mode: "posted" })
        for (const lot of lots) {
          if (!lot.expiry_date && !includeNoExpiry) continue
          const product = productById.get(lot.item_id)
          if (!product) continue
          const daysLeft = lot.expiry_date ? Math.round((Date.parse(lot.expiry_date) - end) / 86_400_000) : null
          const lotStatus = daysLeft == null ? "none" : daysLeft < 0 ? "expired" : daysLeft <= nearDays ? "near" : "valid"
          if (status !== "all" && lotStatus !== status) continue
          if (fromExpiry && (!lot.expiry_date || lot.expiry_date < fromExpiry)) continue
          if (toExpiry && (!lot.expiry_date || lot.expiry_date > toExpiry)) continue
          rows.push({
            product_id: lot.item_id,
            product_code: product.product_code,
            product_name: product.product_name,
            main_unit: product.main_unit || "",
            category: product.category || "",
            warehouse_id: Number(warehouse.id),
            warehouse_name: warehouse.name,
            expiry_date: lot.expiry_date,
            batch_no: lot.batch_no || "",
            quantity: round(lot.quantity),
            days_left: daysLeft,
            status: lotStatus,
          })
        }
      }
    }

    // دمج نفس الدفعة إن جاءت من عدة فروع لنفس المستودع
    const merged = new Map<string, any>()
    for (const row of rows) {
      const key = `${row.product_id}|${row.warehouse_id}|${row.expiry_date || ""}|${row.batch_no.toUpperCase()}`
      const current = merged.get(key)
      if (current) current.quantity = round(current.quantity + row.quantity)
      else merged.set(key, { ...row })
    }
    const result = [...merged.values()]
      .filter((row) => Math.abs(row.quantity) > 1e-6)
      .sort((a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999") || String(a.product_code).localeCompare(String(b.product_code)))
    return NextResponse.json({ to_date: toDate, near_days: nearDays, rows: result })
  } catch (error) {
    console.error("Expiry balances report error:", error)
    return NextResponse.json({ error: "تعذر تحميل أرصدة الأصناف حسب الصلاحية" }, { status: 500 })
  }
}
