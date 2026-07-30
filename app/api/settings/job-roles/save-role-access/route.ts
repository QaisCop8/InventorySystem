import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"

interface RoleAccessPayload {
  roleId: number
  accesses: { access_id: number; is_granted: boolean }[]
}

export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionUser(req))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    await ensurePermissionTables(await resolveCurrentDbName())

    const body: RoleAccessPayload = await req.json()

    if (!body.roleId || !Array.isArray(body.accesses)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { roleId, accesses } = body

    for (const access of accesses) {
      await sql`
        INSERT INTO role_permissions (role_id, access_id, is_granted)
        VALUES (${roleId}, ${access.access_id}, ${access.is_granted})
        ON CONFLICT (role_id, access_id) DO UPDATE
        SET is_granted = EXCLUDED.is_granted
      `
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save role access" }, { status: 500 })
  }
}
