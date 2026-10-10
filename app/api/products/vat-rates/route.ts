import { NextResponse, type NextRequest } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { itemLevelVatEnabled, itemVatRates } from "@/lib/item-vat-server"

// نسب ضريبة الأصناف + حالة إعداد "الضريبة على مستوى الصنف" — للإرساليات/الفواتير وطلبيات المبيعات.
// GET /api/products/vat-rates?ids=1,2,3  ⇒  { enabled, rates: { "1": 16, "2": 0, "3": null } }
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const ids = String(request.nextUrl.searchParams.get("ids") || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 500)
    const [enabled, rates] = await Promise.all([itemLevelVatEnabled(), itemVatRates(ids)])
    return NextResponse.json({ enabled, rates: Object.fromEntries(rates) })
  } catch (error) {
    console.error("Item VAT rates error:", error)
    return NextResponse.json({ error: "تعذر تحميل نسب ضريبة الأصناف" }, { status: 500 })
  }
}
