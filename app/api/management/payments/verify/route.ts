import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { confirmCompanyPayment } from "@/lib/company-billing"

// صفحة العودة من لحظة تستدعي هذا بالمرجع: يتحقق من الدفع لدى لحظة ثم يُنشئ قاعدة الشركة.
export async function POST(request: NextRequest) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const { reference } = await request.json().catch(() => ({}))
    if (!/^[A-Za-z0-9.=-]{6,100}$/.test(String(reference || ""))) return NextResponse.json({ error: "مرجع الدفع غير صالح" }, { status: 400 })
    return NextResponse.json(await confirmCompanyPayment(String(reference), session))
  } catch (error) {
    console.error("[management/payments/verify] error:", error)
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر التحقق من الدفع" }, { status })
  }
}
