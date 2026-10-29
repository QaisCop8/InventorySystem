import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeUserAdmin } from "@/lib/user-admin-access"

interface RoleAccessPayload {
  roleId: number
  branchId: number
  inherit?: boolean
  accesses: { access_id: number; is_granted: boolean }[]
}

export async function POST(req: NextRequest) {
  // إعدادات المستخدمين والصلاحيات: الحفظ للمسؤول أو لمن يملك صلاحية إدارة المستخدمين والصلاحيات
  // (authorizeUserAdmin يتحقق من الجلسة؛ الجداول موجودة لأن الشاشة حمّلتها عبر role-access)
  const userAdmin = await authorizeUserAdmin(req as any)
  if (!userAdmin.ok) return userAdmin.response
  try {
    const body: RoleAccessPayload = await req.json()

    if (!body.roleId || !Number.isInteger(Number(body.branchId)) || Number(body.branchId) <= 0 || !Array.isArray(body.accesses)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { roleId, accesses, branchId } = body

    if (body.inherit) {
      await sql`DELETE FROM role_branch_permissions WHERE role_id = ${roleId} AND branch_id = ${branchId}`
      return NextResponse.json({ success: true })
    }

    // كل الصلاحيات بأمر واحد بدل أمر لكل صلاحية (~800 رحلة متتالية لقاعدة بعيدة كانت تجعل الحفظ يستغرق دقائق)
    const latestByAccessId = new Map<number, boolean>()
    for (const access of accesses) {
      const accessId = Number(access.access_id)
      if (!Number.isInteger(accessId) || accessId <= 0 || typeof access.is_granted !== "boolean") {
        return NextResponse.json({ error: "Invalid access entry" }, { status: 400 })
      }
      latestByAccessId.set(accessId, access.is_granted)
    }

    const accessIds = [...latestByAccessId.keys()]
    if (accessIds.length) {
      const grantedValues = accessIds.map((accessId) => latestByAccessId.get(accessId)!)
      await sql`
        INSERT INTO role_branch_permissions (role_id, branch_id, access_id, is_granted)
        SELECT ${roleId}, ${branchId}, permission.access_id, permission.is_granted
        FROM unnest(${accessIds}::int[], ${grantedValues}::boolean[]) AS permission(access_id, is_granted)
        ON CONFLICT (role_id, branch_id, access_id) DO UPDATE
        SET is_granted = EXCLUDED.is_granted
        WHERE role_branch_permissions.is_granted IS DISTINCT FROM EXCLUDED.is_granted
      `
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save role access" }, { status: 500 })
  }
}
