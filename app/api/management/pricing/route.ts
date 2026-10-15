import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { getPricing, savePricing } from "@/lib/company-billing"
import { isLahzaConfigured, isLahzaTestMode } from "@/lib/lahza"

// أسعار اشتراك الشركات: GET لأي مستخدم إدارة (لعرض السعر عند إنشاء شركة)، PUT لمسؤول المنصة فقط.
export async function GET() {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const pricing = await getPricing()
    return NextResponse.json({ pricing, enabled: isLahzaConfigured() && pricing.base_price > 0, testMode: isLahzaTestMode() })
  } catch (error) {
    console.error("[management/pricing GET] error:", error)
    return NextResponse.json({ error: "تعذّر تحميل الأسعار" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getManagementSession()
    if (!session?.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية تعديل الأسعار" }, { status: 403 })
    const pricing = await savePricing(await request.json())
    return NextResponse.json({ pricing })
  } catch (error) {
    console.error("[management/pricing PUT] error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر حفظ الأسعار" }, { status: 400 })
  }
}
