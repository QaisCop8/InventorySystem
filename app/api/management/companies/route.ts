import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import { ensureManagementTables } from "@/lib/management-db"
import managementSql from "@/lib/management-db"
import { sendMail } from "@/lib/email"

const PLATFORM_ADMIN_EMAIL = "qais.sabbah@iscosoft.com"

export async function GET() {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const rows = await managementSql`
      SELECT c.id, c.name, c.status, c.created_at
      FROM companies c
      JOIN user_company uc ON uc.company_id = c.id
      WHERE uc.user_id = ${session.id}
      ORDER BY c.created_at DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/companies GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الشركات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

    const data = await request.json()
    const name = String(data.name || "").trim()
    if (!name) return NextResponse.json({ error: "اسم الشركة مطلوب" }, { status: 400 })

    const inserted = await managementSql`
      INSERT INTO companies (name, status, created_by)
      VALUES (${name}, 'pending', ${session.id})
      RETURNING id, name, status, created_at
    `
    const company = inserted[0]

    await managementSql`
      INSERT INTO user_company (user_id, company_id, role)
      VALUES (${session.id}, ${company.id}, 'owner')
    `

    await sendMail({
      to: PLATFORM_ADMIN_EMAIL,
      subject: "طلب إنشاء شركة جديدة بانتظار الموافقة",
      html: `<div dir="rtl"><p>طلب المستخدم ${session.full_name} (${session.email}) إنشاء شركة جديدة باسم "${name}".</p><p>يرجى مراجعة الطلب من لوحة الإدارة.</p></div>`,
    })

    return NextResponse.json({ success: true, company })
  } catch (error) {
    console.error("[management/companies POST] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الشركة" }, { status: 500 })
  }
}
