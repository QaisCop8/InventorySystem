import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { startSubscriptionPayment } from "@/lib/company-billing"

// تجديد الاشتراك (purpose=renewal) أو تحويل نسخة تجريبية إلى حقيقية (purpose=upgrade مع الأعداد المطلوبة)
// ⇒ بيانات نافذة لحظة المنبثقة. التحقق والتطبيق: /api/management/payments/verify.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const companyId = Number((await params).id)
    if (!Number.isInteger(companyId) || companyId <= 0) return NextResponse.json({ error: "الشركة غير صالحة" }, { status: 400 })
    const data = await request.json().catch(() => ({}))
    const purpose = data.purpose === "upgrade" ? "upgrade" : "renewal"
    const result = await startSubscriptionPayment(companyId, session, purpose, {
      users: data.number_of_users, branches: data.number_of_branches, posPoints: data.number_of_pos_points,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[management/companies/subscription-payment] error:", error)
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر بدء عملية الدفع" }, { status })
  }
}
