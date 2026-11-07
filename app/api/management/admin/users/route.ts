import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { ensureBillingTables } from "@/lib/company-billing"

export async function GET() {
  try {
    await ensureManagementTables()
    await ensureBillingTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const rows = await managementSql`
      SELECT u.id, u.full_name, u.email, u.is_platform_admin, u.is_active, u.email_verified, u.created_at,
        -- رقم الجوال المُدخل عند إضافة آخر شركة (عادية أو تجريبية)، وإلا رقم التسجيل، وإلا رقم آخر طلب للمبيعات
        COALESCE(
          (SELECT c.contact_mobile FROM companies c WHERE c.created_by = u.id AND COALESCE(c.contact_mobile, '') <> '' ORDER BY c.id DESC LIMIT 1),
          NULLIF(u.mobile, ''),
          (SELECT l.phone FROM sales_leads l WHERE l.user_id = u.id AND COALESCE(l.phone, '') <> '' ORDER BY l.id DESC LIMIT 1)) AS mobile
      FROM users u
      ORDER BY u.created_at DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/users GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب المستخدمين" }, { status: 500 })
  }
}
