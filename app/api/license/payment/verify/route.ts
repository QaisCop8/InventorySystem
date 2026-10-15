import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { getCurrentCompanyLicense } from "@/lib/company-license"
import { confirmLicensePayment } from "@/lib/company-billing"

// بعد نجاح نافذة الدفع: التحقق لدى لحظة ثم اعتماد الطلب ورفع حد الترخيص فوراً (لشركة الجلسة الحالية فقط).
export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const { reference } = await request.json().catch(() => ({}))
    if (!/^[A-Za-z0-9.=-]{6,100}$/.test(String(reference || ""))) return NextResponse.json({ error: "مرجع الدفع غير صالح" }, { status: 400 })
    const license = await getCurrentCompanyLicense()
    if (!license) return NextResponse.json({ error: "لا يوجد ترخيص مرتبط بهذه الشركة" }, { status: 400 })
    return NextResponse.json(await confirmLicensePayment(String(reference), license.companyId))
  } catch (error) {
    console.error("[license/payment/verify] error:", error)
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر التحقق من الدفع" }, { status })
  }
}
