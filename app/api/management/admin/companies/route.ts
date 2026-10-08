import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql from "@/lib/management-db"
import { countTenantUsage, ensureLicenseTables } from "@/lib/company-license"

export async function GET(request: NextRequest) {
  try {
    await ensureLicenseTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get("status")
    const withUsage = request.nextUrl.searchParams.get("usage") === "1"

    const rows = await managementSql`
      SELECT c.id, c.name, c.status, c.db_name, c.created_at, c.expiry_date,
             COALESCE(c.number_of_users, 1) AS number_of_users, COALESCE(c.number_of_branches, 1) AS number_of_branches,
             u.full_name AS requested_by_name, u.email AS requested_by_email,
             (SELECT COUNT(*)::int FROM company_license_requests r WHERE r.company_id = c.id AND r.status = 'pending') AS pending_license_requests
      FROM companies c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE (${status}::text IS NULL OR c.status = ${status})
      ORDER BY c.created_at DESC
    `

    // الاستخدام الفعلي من قاعدة كل شركة (مستخدمون نشطون/فروع غير محذوفة) — اختياري لأنه يفتح اتصالاً لكل شركة.
    if (withUsage) {
      await Promise.all(rows.map(async (row: any) => {
        if (!row.db_name || row.status === "pending" || row.status === "rejected") return
        try { row.usage = await countTenantUsage(row.db_name) } catch { row.usage = null }
      }))
    }

    return NextResponse.json(rows)
  } catch (error) {
    console.error("[management/admin/companies GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الشركات" }, { status: 500 })
  }
}
