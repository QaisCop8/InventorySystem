import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

const validDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

export async function GET(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session?.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const userSearch = (params.get("user") || "").trim().slice(0, 120)
    const userPattern = userSearch ? `%${userSearch}%` : null
    const rawCompanyId = Number(params.get("company_id"))
    const companyId = Number.isInteger(rawCompanyId) && rawCompanyId > 0 ? rawCompanyId : null
    const fromDate = validDate(params.get("from"))
    const toDate = validDate(params.get("to"))

    const rows = await managementSql`
      SELECT id, management_user_id, tenant_user_id, user_email, user_name,
             company_id, company_name, db_name, login_type, ip_address, user_agent, logged_at
      FROM management_login_audit
      WHERE (${userPattern}::text IS NULL OR user_email ILIKE ${userPattern} OR COALESCE(user_name, '') ILIKE ${userPattern})
        AND (${companyId}::int IS NULL OR company_id = ${companyId})
        AND (${fromDate}::date IS NULL OR logged_at >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR logged_at < ${toDate}::date + INTERVAL '1 day')
      ORDER BY logged_at DESC, id DESC
      LIMIT 500
    `

    return NextResponse.json({ rows, limit: 500 })
  } catch (error) {
    console.error("[management/admin/login-audit GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب سجل الدخول" }, { status: 500 })
  }
}
