import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { retryCompanyProvisioning } from "@/lib/company-billing"

// "اعادة المحاولة": إعادة اعتماد (إنشاء قاعدة) شركة مدفوعة فشل اعتمادها — بلا دفع جديد.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const companyId = Number((await params).id)
    if (!Number.isInteger(companyId) || companyId <= 0) return NextResponse.json({ error: "الشركة غير صالحة" }, { status: 400 })
    return NextResponse.json(await retryCompanyProvisioning(companyId, session))
  } catch (error) {
    console.error("[management/companies/retry-provisioning] error:", error)
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّرت إعادة المحاولة" }, { status })
  }
}
