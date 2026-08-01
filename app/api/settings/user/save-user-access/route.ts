import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePermissionTables } from "@/lib/permissions"

interface AccessPayload {
  userId: number
  branchId: number
  inherit?: boolean
  accesses: { access_id: number; is_granted: boolean }[]
}

export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionUser(req))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    const body: AccessPayload = await req.json()
    await ensurePermissionTables(await resolveCurrentDbName())

    if (!body.userId || !Number.isInteger(Number(body.branchId)) || Number(body.branchId) <= 0 || !Array.isArray(body.accesses)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { userId, accesses, branchId } = body

    if (body.inherit) {
      await sql`DELETE FROM user_branch_permissions WHERE user_id = ${userId} AND branch_id = ${branchId}`
      return NextResponse.json({ success: true })
    }

    // For each access, either insert or update
    for (const access of accesses) {
      await sql`
        INSERT INTO user_branch_permissions (user_id, branch_id, access_id, is_granted)
        VALUES (${userId}, ${branchId}, ${access.access_id}, ${access.is_granted})
        ON CONFLICT (user_id, branch_id, access_id) DO UPDATE
        SET is_granted = EXCLUDED.is_granted
      `
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save user access" }, { status: 500 })
  }
}
