import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET() {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const rows = await managementSql`
      SELECT id, full_name, email, is_platform_admin, is_active, email_verified, created_at
      FROM users
      ORDER BY created_at DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/users GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب المستخدمين" }, { status: 500 })
  }
}
