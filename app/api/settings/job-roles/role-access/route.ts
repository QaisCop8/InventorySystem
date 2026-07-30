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

    if (!roleId) {
      return NextResponse.json({ error: "roleId is required" }, { status: 400 })
    }

    const rows = await sql`
      SELECT
        al.id AS access_id,
        al.name AS access_name,
        ac.name AS category_name,
        COALESCE(rp.is_granted, FALSE) AS is_granted
      FROM access_list al
      LEFT JOIN access_category ac ON al.category_id = ac.id
      LEFT JOIN role_permissions rp ON rp.access_id = al.id AND rp.role_id = ${roleId}
      ORDER BY ac.id, al.id
    `

    return NextResponse.json(rows)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch role access" }, { status: 500 })
  }
}
