import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { appOrigin, startCompanyPayment } from "@/lib/company-billing"
import { lahzaPublicKey } from "@/lib/lahza"

// يبدأ (أو يكمل) دفع اشتراك شركة بانتظار الدفع عبر لحظة ⇒ { authorizationUrl } للتحويل لصفحة الدفع،
// أو { provisioned: true } إن كانت دفعة سابقة قد اكتملت وأُنشئت الشركة.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const companyId = Number((await params).id)
    if (!Number.isInteger(companyId) || companyId <= 0) return NextResponse.json({ error: "الشركة غير صالحة" }, { status: 400 })
    const body = await request.json().catch(() => ({}))
    const mode = body?.mode === "popup" && lahzaPublicKey() ? "popup" : "redirect"
    return NextResponse.json(await startCompanyPayment(companyId, session, appOrigin(request), mode))
  } catch (error) {
    console.error("[management/companies/payment] error:", error)
    const status = Number((error as { status?: number })?.status) || 502
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر بدء عملية الدفع" }, { status })
  }
}
