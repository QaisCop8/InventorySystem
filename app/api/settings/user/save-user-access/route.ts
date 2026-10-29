import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeUserAdmin } from "@/lib/user-admin-access"

interface AccessPayload {
  userId: number
  branchId: number
  inherit?: boolean
  accesses: { access_id: number; is_granted: boolean }[]
}

export async function POST(req: NextRequest) {
  // إعدادات المستخدمين والصلاحيات: الحفظ للمسؤول أو لمن يملك صلاحية إدارة المستخدمين والصلاحيات
  const userAdmin = await authorizeUserAdmin(req as any)
  if (!userAdmin.ok) return userAdmin.response
  try {
    // authorizeUserAdmin تحقّق من الجلسة أعلاه، والجداول موجودة (شاشة الصلاحيات حمّلتها عبر user-access) —
    // كان يُعاد التحقق من الجلسة وتشغيل ensurePermissionTables (~20 أمر DDL في كل نسخة خادم جديدة) قبل الحفظ.
    const body: AccessPayload = await req.json()

    if (!body.userId || !Number.isInteger(Number(body.branchId)) || Number(body.branchId) <= 0 || !Array.isArray(body.accesses)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { userId, accesses, branchId } = body

    if (body.inherit) {
      await sql`DELETE FROM user_branch_permissions WHERE user_id = ${userId} AND branch_id = ${branchId}`
      return NextResponse.json({ success: true })
    }

    // Upsert the complete permission set in one database round trip. The old
    // per-permission loop was especially slow for remote tenant databases.
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
        INSERT INTO user_branch_permissions (user_id, branch_id, access_id, is_granted)
        SELECT ${userId}, ${branchId}, permission.access_id, permission.is_granted
        FROM unnest(${accessIds}::int[], ${grantedValues}::boolean[]) AS permission(access_id, is_granted)
        ON CONFLICT (user_id, branch_id, access_id) DO UPDATE
        SET is_granted = EXCLUDED.is_granted
        WHERE user_branch_permissions.is_granted IS DISTINCT FROM EXCLUDED.is_granted
      `
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save user access" }, { status: 500 })
  }
}
