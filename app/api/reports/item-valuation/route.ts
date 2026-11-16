import { NextRequest, NextResponse } from "next/server"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { applyReportUnits } from "@/lib/report-units"
import sql from "@/lib/database"
import { getProductBalances, reportDate, inventoryFilters, inventoryReportMeta } from "@/lib/item-inventory-reports"

export async function GET(request: NextRequest) {
  // الفهارس تُبنى بالخلفية مرة لكل قاعدة — لا ينتظرها التقرير
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["item-valuation-report"])
    if (reportDenied) return reportDenied
    const params = request.nextUrl.searchParams
    const organizationId = Number((user as any).organization_id || 1)
    if (params.get("meta") === "1") return NextResponse.json(await inventoryReportMeta(organizationId))
    const productId = Number(params.get("product_id") || 0)
    const search = (params.get("search") || "").trim()
    const toDate = reportDate(params.get("to_date"))
    const priceWay = ["last", "fifo"].includes(params.get("price_way") || "") ? params.get("price_way") : "average"
    const withZeros = params.get("with_zeros") === "1"
    // قائمة الأصناف الكاملة لم تعد تُرسل مع النتيجة — الشاشة لا تستخدمها وكانت تضخّم الرد (2026-11-16)
    const balances = await getProductBalances(organizationId, toDate, productId, search, { ...inventoryFilters(params), includeUnposted: true })
    const rows = balances.filter((row: any) => withZeros || Math.abs(Number(row.balance || 0)) > 0.000001).map((row: any) => {
      const price = Number(priceWay === "last" ? row.last_incoming_cost : priceWay === "fifo" ? row.fifo_cost : row.average_cost) || 0
      return { ...row, valuation_price: price, valuation_amount: Number(row.balance || 0) * price }
    })
    // آخر سعر: رقم السند الذي أُخذ منه السعر وتاريخه — للمطابقة مع تقييم الشامل
    if (priceWay === "last") {
      const ids = [...new Set(rows.flatMap((row: any) => [Number(row.last_incoming_voucher_id), Number(row.last_cost_voucher_id)]).filter((id: number) => id > 0))]
      const codes = new Map<number, string>(ids.length ? ((await sql`SELECT id, vch_code FROM voucher_header_tbl WHERE id = ANY(${ids}::int[])`) as any[]).map((row) => [Number(row.id), String(row.vch_code || "")]) : [])
      for (const row of rows as any[]) {
        const code = codes.get(Number(row.last_incoming_voucher_id))
        const costCode = Number(row.last_cost_voucher_id) && Number(row.last_cost_voucher_id) !== Number(row.last_incoming_voucher_id) ? codes.get(Number(row.last_cost_voucher_id)) : null
        row.last_price_source = code ? `${code} — ${row.last_incoming_date}${costCode ? ` (السعر من فاتورة ${costCode})` : ""}` : "سعر أول المدة"
      }
    }
    // الكمية وسعر التقييم بوحدة التقارير (قيمة التقييم لا تتغير)
    const reportRows = await applyReportUnits(rows, { quantityFields: ["balance", "received_quantity", "issued_quantity", "cost_quantity"], unitPriceFields: [...["average_cost", "last_incoming_cost", "fifo_cost"], "valuation_price"] })
    return NextResponse.json({ report: "item-valuation", to_date: toDate, rows: reportRows })
  } catch (error) {
    console.error("Item valuation report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقييم البضاعة" }, { status: 500 })
  }
}
