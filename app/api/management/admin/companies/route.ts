import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get("status")

    const rows = status
      ? await managementSql`
          SELECT c.id, c.name, c.status, c.db_name, c.created_at,
                 u.full_name AS requested_by_name, u.email AS requested_by_email
          FROM companies c
          LEFT JOIN users u ON u.id = c.created_by
          WHERE c.status = ${status}
          ORDER BY c.created_at DESC
        `
      : await managementSql`
          SELECT c.id, c.name, c.status, c.db_name, c.created_at,
                 u.full_name AS requested_by_name, u.email AS requested_by_email
          FROM companies c
          LEFT JOIN users u ON u.id = c.created_by
          ORDER BY c.created_at DESC
        `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/companies GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الشركات" }, { status: 500 })
  }
}
