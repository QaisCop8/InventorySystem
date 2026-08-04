import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensurePermissionTables } from "@/lib/permissions"

interface MatrixPayload {
  memberships: { user_id: string; branch_id: number }[]
}

export async function GET(req: NextRequest) {
  try {
    if (!(await getSessionUser(req))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    await ensurePermissionTables(await resolveCurrentDbName())

    const rows = await sql`SELECT user_id, branch_id FROM user_branches`
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to fetch branch access matrix" }, { status: 500 })
  }
}

// استبدال كامل (حذف ثم إدراج) بنفس اصطلاح مسارات ربط الفروع الأخرى (product_branches/
// customer_branches/account_branches) — لا مقارنة/فرق مع الحالة السابقة.
export async function POST(req: NextRequest) {
  try {
    if (!(await getSessionUser(req))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    const body: MatrixPayload = await req.json()
    if (!Array.isArray(body.memberships)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
    await ensurePermissionTables(await resolveCurrentDbName())

    await sql`DELETE FROM user_branches`
    for (const m of body.memberships) {
      if (!m.user_id || !Number.isInteger(Number(m.branch_id))) continue
      await sql`INSERT INTO user_branches (user_id, branch_id) VALUES (${m.user_id}, ${Number(m.branch_id)}) ON CONFLICT DO NOTHING`
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Failed to save branch access matrix" }, { status: 500 })
  }
}
