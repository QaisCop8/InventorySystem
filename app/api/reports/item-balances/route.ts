import { NextRequest, NextResponse } from "next/server"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { getInventoryReportProducts, getProductBalances, reportDate, inventoryFilters, inventoryReportMeta } from "@/lib/item-inventory-reports"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["item-balances-report"])
    if (reportDenied) return reportDenied
    const params = request.nextUrl.searchParams
    const organizationId = Number((user as any).organization_id || 1)
    if (params.get("meta") === "1") return NextResponse.json(await inventoryReportMeta(organizationId))
    const productId = Number(params.get("product_id") || 0)
    const search = (params.get("search") || "").trim()
    const toDate = reportDate(params.get("to_date"))
    const withZeros = params.get("with_zeros") === "1"
    const [products, rows] = await Promise.all([
      getInventoryReportProducts(organizationId, productId, search),
      getProductBalances(organizationId, toDate, productId, search, inventoryFilters(params)),
    ])
    return NextResponse.json({ report: "item-balances", to_date: toDate, products,
      rows: withZeros ? rows : rows.filter((row: any) => Math.abs(Number(row.balance || 0)) > 0.000001) })
  } catch (error) {
    console.error("Item balances report error:", error)
    return NextResponse.json({ error: "تعذر تحميل أرصدة الأصناف" }, { status: 500 })
  }
}
