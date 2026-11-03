import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { createLicenseRequest, LICENSE_RESOURCE_LABELS, type LicenseResource } from "@/lib/company-license"
import { sendMail } from "@/lib/email"
import { createSalesLead } from "@/lib/company-billing"

const PLATFORM_ADMIN_EMAIL = "sabbahsoft2026@gmail.com"

// طلب زيادة عدد المستخدمين/الفروع المرخّص — يُعتمد أو يُرفض من لوحة تحكم المنصة.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const resource = String(data.resource) as LicenseResource
    if (!(resource in LICENSE_RESOURCE_LABELS)) return NextResponse.json({ error: "نوع الطلب غير صالح" }, { status: 400 })
    const profile = (await sql`SELECT full_name, email FROM user_settings WHERE user_id = ${Number(user.user_id)} LIMIT 1`)[0]
    // بطاقة للمبيعات (الدفع الإلكتروني مخفي): رقم التواصل إلزامي ويُحفظ مع السبب ليظهر في طلبات الترخيص بلوحة الإدارة
    const salesCard = data.sales_card === true
    const phone = String(data.contact_phone || "").trim().slice(0, 40)
    const whatsapp = String(data.contact_whatsapp || "").trim().slice(0, 40)
    if (salesCard && !/^[+\d\s()-]{6,40}$/.test(phone)) return NextResponse.json({ error: "أدخل رقم هاتف صحيحاً للتواصل" }, { status: 400 })
    const reason = salesCard
      ? [String(data.reason || "").trim(), `بطاقة للمبيعات — هاتف: ${phone}${whatsapp ? ` — واتساب: ${whatsapp}` : ""}`].filter(Boolean).join("\n")
      : data.reason
    const created = await createLicenseRequest({
      resource, quantity: Number(data.quantity), reason,
      tenantUserId: Number(user.user_id), requestedByName: profile?.full_name || user.full_name, requestedByEmail: profile?.email || null,
    })
    void sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: `طلب زيادة ${LICENSE_RESOURCE_LABELS[resource].plural} — ${created.companyName}`,
      html: `<div dir="rtl"><p>طلبت شركة "${created.companyName}" زيادة عدد ${LICENSE_RESOURCE_LABELS[resource].plural} المرخّص بمقدار ${created.quantity}.</p><p>مقدم الطلب: ${profile?.full_name || user.full_name}</p>${data.reason ? `<p>السبب: ${String(data.reason)}</p>` : ""}<p>يرجى مراجعة الطلب من لوحة الإدارة.</p></div>`,
    }).catch((error: unknown) => console.error("[license request] mail failed", error))
    if (salesCard) {
      await createSalesLead({
        companyId: Number((created as any).company_id) || null,
        name: profile?.full_name || user.full_name || "", email: profile?.email || "", phone, whatsapp,
        notes: `طلب زيادة ${LICENSE_RESOURCE_LABELS[resource].plural} بمقدار ${created.quantity}${data.reason ? ` — ${String(data.reason)}` : ""}`,
        companyName: created.companyName,
      }).catch((error: unknown) => console.error("[license request] sales lead failed", error))
    }
    return NextResponse.json({ success: true, request: created }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر إرسال الطلب" }, { status: 400 })
  }
}
