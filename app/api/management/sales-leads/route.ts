import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { createSalesLead } from "@/lib/company-billing"

// "ارسال بطاقة للمبيعات" من صفحة خيارات الدفع
export async function POST(request: NextRequest) {
  try {
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const data = await request.json().catch(() => ({}))
    const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max)
    const name = text(data.name, 150), email = text(data.email, 150), phone = text(data.phone, 40), whatsapp = text(data.whatsapp, 40), notes = text(data.notes, 2000)
    if (!name || !email || !phone || !whatsapp) return NextResponse.json({ error: "الاسم والبريد الإلكتروني والهاتف والواتساب مطلوبة" }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "البريد الإلكتروني غير صالح" }, { status: 400 })
    if (!/^[+\d\s()-]{6,40}$/.test(phone) || !/^[+\d\s()-]{6,40}$/.test(whatsapp)) return NextResponse.json({ error: "رقم الهاتف غير صالح" }, { status: 400 })
    let companyId: number | null = Number(data.company_id) || null
    let companyName = ""
    if (companyId) {
      const [company] = await managementSql`
        SELECT c.id, c.name FROM companies c JOIN user_company uc ON uc.company_id = c.id WHERE c.id = ${companyId} AND uc.user_id = ${session.id}`
      companyId = company ? Number(company.id) : null
      companyName = company ? String(company.name) : ""
    }
    const lead = await createSalesLead({ companyId, userId: session.id, name, email, phone, whatsapp, notes, companyName })
    return NextResponse.json({ success: true, id: lead.id }, { status: 201 })
  } catch (error) {
    console.error("[management/sales-leads] error:", error)
    return NextResponse.json({ error: "تعذّر إرسال الطلب" }, { status: 500 })
  }
}
