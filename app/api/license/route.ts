import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { getCurrentCompanyLicense } from "@/lib/company-license"

// ترخيص الشركة الحالية (الحدود + الاستخدام + الطلبات المعلقة) — للشاشات التي تضيف مستخدمين أو فروعاً.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    return NextResponse.json({ license: await getCurrentCompanyLicense() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    console.error("[license GET]", error)
    return NextResponse.json({ error: error?.message || "تعذر تحميل بيانات الترخيص" }, { status: 500 })
  }
}
