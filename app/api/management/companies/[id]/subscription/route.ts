import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const companyId = Number(params.id)
    if (!companyId) {
      return NextResponse.json({ error: "معرّف الشركة مطلوب" }, { status: 400 })
    }

    const data = await request.json().catch(() => ({}))
    const action = String(data.action || "").trim()

    if (action === "stop") {
      await managementSql`
        UPDATE companies
        SET status = 'stopped', expiry_date = COALESCE(expiry_date, CURRENT_TIMESTAMP)
        WHERE id = ${companyId}
      `
      return NextResponse.json({ success: true })
    }

    // إلغاء الإيقاف — يعيد الشركة الموقوفة لحالة approved دون المساس بتاريخ انتهاء الاشتراك
    // (تمديد الاشتراك فعلياً منفصل عبر action="extend" أدناه).
    if (action === "unstop") {
      await managementSql`
        UPDATE companies
        SET status = 'approved'
        WHERE id = ${companyId} AND status = 'stopped'
      `
      return NextResponse.json({ success: true })
    }

    // تمديد الاشتراك — يضيف سنة واحدة لتاريخ الانتهاء الحالي (وليس سنة من الآن)، مع إعادة
    // الشركة لحالة approved إن كانت موقوفة.
    if (action === "extend") {
      await managementSql`
        UPDATE companies
        SET status = 'approved',
            expiry_date = COALESCE(expiry_date, CURRENT_TIMESTAMP) + INTERVAL '1 year'
        WHERE id = ${companyId}
      `
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 })
  } catch (error) {
    console.error("[management/companies/subscription] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحديث الاشتراك" }, { status: 500 })
  }
}
