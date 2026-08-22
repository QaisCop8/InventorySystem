import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"

export async function GET(req: NextRequest) {
  try {
    if (!(await getSessionUser(req))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    await ensurePermissionTables(await resolveCurrentDbName())

    const { searchParams } = new URL(req.url)
    const roleId = searchParams.get("roleId")
    const branchId = Number(searchParams.get("branchId"))

    if (!roleId || !Number.isInteger(branchId) || branchId <= 0) {
      return NextResponse.json({ error: "roleId and branchId are required" }, { status: 400 })
    }

    const rows = await sql`
      SELECT
        al.id AS access_id,
        al.name AS access_name,
        ac.name AS category_name,
        COALESCE(rbp.is_granted, rp.is_granted, FALSE) AS is_granted,
        CASE WHEN rbp.access_id IS NOT NULL THEN 'branch_role' WHEN rp.access_id IS NOT NULL THEN 'role' ELSE 'none' END AS permission_source
      FROM access_list al
      LEFT JOIN access_category ac ON al.category_id = ac.id
      LEFT JOIN role_branch_permissions rbp
        ON rbp.access_id = al.id AND rbp.role_id = ${roleId} AND rbp.branch_id = ${branchId}
      LEFT JOIN role_permissions rp ON rp.access_id = al.id AND rp.role_id = ${roleId}
      ORDER BY ac.id, COALESCE(al.sort_order, 999999), al.id
    `

    return NextResponse.json(rows)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch role access" }, { status: 500 })
  }
}
