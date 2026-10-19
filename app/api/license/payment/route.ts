import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { getCurrentCompanyLicense, LICENSE_RESOURCE_LABELS, type LicenseResource } from "@/lib/company-license"
import { licensePaymentInfo, startLicensePayment } from "@/lib/company-billing"

// زيادة الترخيص بالدفع الإلكتروني (لحظة) من داخل الشركة:
//   GET  ⇒ هل الدفع مفعّل + سعر الوحدة لكل مورد
//   POST { resource, quantity, reason? } ⇒ بيانات نافذة الدفع المنبثقة (المرجع والمبلغ مسجّلان بالخادم)
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    return NextResponse.json(await licensePaymentInfo())
  } catch (error) {
    console.error("[license/payment GET] error:", error)
    return NextResponse.json({ enabled: false })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const resource = String(data.resource) as LicenseResource
    if (!(resource in LICENSE_RESOURCE_LABELS)) return NextResponse.json({ error: "نوع الطلب غير صالح" }, { status: 400 })
    const license = await getCurrentCompanyLicense()
    if (!license) return NextResponse.json({ error: "لا يوجد ترخيص مرتبط بهذه الشركة" }, { status: 400 })
    const profile = (await sql`SELECT full_name, email FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]
    const result = await startLicensePayment({
      companyId: license.companyId,
      resource,
      quantity: Number(data.quantity),
      reason: data.reason,
      limitBefore: license.limits[resource],
      used: license.usage[resource],
      tenantUserId: user.user_id,
      requestedByName: profile?.full_name || user.full_name,
      email: String(profile?.email || "").trim(),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[license/payment POST] error:", error)
    const status = Number((error as { status?: number })?.status) || 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذّر بدء عملية الدفع" }, { status })
  }
}
