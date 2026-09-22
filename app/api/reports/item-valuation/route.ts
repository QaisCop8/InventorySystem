import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { getInventoryReportProducts, getProductBalances, reportDate } from "@/lib/item-inventory-reports"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const organizationId = Number((user as any).organization_id || 1)
    const productId = Number(params.get("product_id") || 0)
    const search = (params.get("search") || "").trim()
    const toDate = reportDate(params.get("to_date"))
    const priceWay = ["last", "fifo"].includes(params.get("price_way") || "") ? params.get("price_way") : "average"
    const withZeros = params.get("with_zeros") === "1"
    const [products, balances] = await Promise.all([
      getInventoryReportProducts(organizationId, productId, search),
      getProductBalances(organizationId, toDate, productId, search),
    ])
    const rows = balances.filter((row: any) => withZeros || Math.abs(Number(row.balance || 0)) > 0.000001).map((row: any) => {
      const price = Number(priceWay === "last" ? row.last_incoming_cost : priceWay === "fifo" ? row.fifo_cost : row.average_cost) || 0
      return { ...row, valuation_price: price, valuation_amount: Number(row.balance || 0) * price }
    })
    return NextResponse.json({ report: "item-valuation", to_date: toDate, products, rows })
  } catch (error) {
    console.error("Item valuation report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقييم البضاعة" }, { status: 500 })
  }
}
