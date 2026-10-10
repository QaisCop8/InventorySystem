import { NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { ensureLicenseTables } from "@/lib/company-license"

export async function GET(request: NextRequest) {
  try {
    await ensureLicenseTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    const status = request.nextUrl.searchParams.get("status")
    const rows = await managementSql`
      SELECT r.*, c.name AS company_name, COALESCE(c.number_of_users, 1) AS number_of_users, COALESCE(c.number_of_branches, 1) AS number_of_branches,
             COALESCE(c.number_of_pos_points, 0) AS number_of_pos_points,
             d.full_name AS decided_by_name
      FROM company_license_requests r
      JOIN companies c ON c.id = r.company_id
      LEFT JOIN users d ON d.id = r.decided_by
      WHERE (${status}::text IS NULL OR r.status = ${status})
      ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
      LIMIT 300`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/license-requests GET] error:", error)
    return NextResponse.json({ error: "تعذر تحميل طلبات الترخيص" }, { status: 500 })
  }
}
