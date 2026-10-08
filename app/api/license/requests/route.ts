import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { createLicenseRequest, LICENSE_RESOURCE_LABELS, type LicenseResource } from "@/lib/company-license"
import { sendMail } from "@/lib/email"

const PLATFORM_ADMIN_EMAIL = "qais.sabbah@iscosoft.com"

// طلب زيادة عدد المستخدمين/الفروع المرخّص — يُعتمد أو يُرفض من لوحة تحكم المنصة.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const resource = String(data.resource) as LicenseResource
    if (!(resource in LICENSE_RESOURCE_LABELS)) return NextResponse.json({ error: "نوع الطلب غير صالح" }, { status: 400 })
    const profile = (await sql`SELECT full_name, email FROM user_settings WHERE user_id = ${Number(user.user_id)} LIMIT 1`)[0]
    const created = await createLicenseRequest({
      resource, quantity: Number(data.quantity), reason: data.reason,
      tenantUserId: Number(user.user_id), requestedByName: profile?.full_name || user.full_name, requestedByEmail: profile?.email || null,
    })
    await sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: `طلب زيادة ${LICENSE_RESOURCE_LABELS[resource].plural} — ${created.companyName}`,
      html: `<div dir="rtl"><p>طلبت شركة "${created.companyName}" زيادة عدد ${LICENSE_RESOURCE_LABELS[resource].plural} المرخّص بمقدار ${created.quantity}.</p><p>مقدم الطلب: ${profile?.full_name || user.full_name}</p>${data.reason ? `<p>السبب: ${String(data.reason)}</p>` : ""}<p>يرجى مراجعة الطلب من لوحة الإدارة.</p></div>`,
    }).catch((error: unknown) => console.error("[license request] mail failed", error))
    return NextResponse.json({ success: true, request: created }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر إرسال الطلب" }, { status: 400 })
  }
}
