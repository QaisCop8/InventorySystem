import { type NextRequest, NextResponse } from "next/server"
import { resolveLineCostCenters } from "@/lib/cost-center-defaults"

export const dynamic = "force-dynamic"

// GET ?account_id=&product_id=&warehouse_id= ⇐ مراكز التكلفة الافتراضية لسطر صنف بالسند
// (الصنف ← المستودع ← حساب الصنف — كما في شامل GetItemDefaultCostCenter)
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const result = await resolveLineCostCenters({
      accountId: Number(params.get("account_id")) || null,
      productId: Number(params.get("product_id")) || null,
      warehouseId: Number(params.get("warehouse_id")) || null,
    })
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("Error resolving line cost centers:", error)
    return NextResponse.json({ error: error?.message || "تعذر تحديد مراكز التكلفة" }, { status: 500 })
  }
}
