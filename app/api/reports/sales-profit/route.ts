import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportDate, reportIds } from "@/lib/item-inventory-reports"
import { PROFIT_GROUP_BY, SALES_INVOICE, SALES_RETURN, computeSalesProfitLines, groupSalesProfit, salesProfitMeta, saveSalesCostPrices, type PricingWay, type ProfitFilters, type ProfitGroupBy } from "@/lib/sales-profit"

function readFilters(params: URLSearchParams): ProfitFilters {
  const today = new Date().toISOString().slice(0, 10)
  const from = reportDate(params.get("from_date"), `${today.slice(0, 7)}-01`)
  const to = reportDate(params.get("to_date"), today)
  const types = reportIds(params.get("types")).filter((type) => type === SALES_INVOICE || type === SALES_RETURN)
  const way = params.get("pricing_way")
  return {
    from: from <= to ? from : to, to,
    pricingWay: (way === "last" || way === "fifo" ? way : "average") as PricingWay,
    types: types.length ? types : [SALES_INVOICE, SALES_RETURN],
    productIds: reportIds(params.get("product_ids")), groupIds: reportIds(params.get("group_ids")),
    warehouseIds: reportIds(params.get("warehouse_ids")), branchIds: reportIds(params.get("branch_ids")),
    customerIds: reportIds(params.get("customer_ids")), salesmanIds: reportIds(params.get("salesman_ids")),
    voucherCode: String(params.get("vch_code") || "").trim(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    if (params.get("meta") === "1") return NextResponse.json(await salesProfitMeta())
    const filters = readFilters(params)
    const groupBy = (PROFIT_GROUP_BY.includes(params.get("group_by") as ProfitGroupBy) ? params.get("group_by") : "item") as ProfitGroupBy
    const lines = await computeSalesProfitLines(filters)
    if (filters.voucherCode && !lines.length) return NextResponse.json({ error: "رقم السند غير صحيح أو لا يحتوي أصنافاً مخزنية" }, { status: 404 })
    return NextResponse.json({ ...groupSalesProfit(lines, groupBy), from_date: filters.from, to_date: filters.to, pricing_way: filters.pricingWay, group_by: groupBy }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Sales profit report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير الأرباح" }, { status: 500 })
  }
}

// تسعير الإخراجات: حفظ الكلفة المحسوبة على أسطر سندات المبيعات والمرتجعات ضمن نفس الفلاتر.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const filters = readFilters(request.nextUrl.searchParams)
    const lines = await computeSalesProfitLines(filters)
    const updated = await saveSalesCostPrices(lines)
    return NextResponse.json({ updated, unpriced: lines.filter((line) => !line.priced).length })
  } catch (error) {
    console.error("Sales cost pricing error:", error)
    return NextResponse.json({ error: "تعذر تنفيذ تسعير الإخراجات" }, { status: 500 })
  }
}
