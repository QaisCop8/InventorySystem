import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName, withTenantTransaction } from "@/lib/database"
import { authorizeFile } from "@/lib/file-permissions"
import { ensurePermissionTables } from "@/lib/permissions"

// مستخدمو الفرع (زر "صلاحيات المستخدمين" في بطاقة الفرع): عضوية user_branches.
// اصطلاح الجدول: مستخدم بلا أي صف = غير مقيَّد (يصل لكل الفروع)؛ صف أو أكثر = يقتصر عليها.
// لذلك: إلغاء تحديد مستخدم غير مقيَّد يمنحه كل الفروع الأخرى صراحةً (ليُحرم من هذا الفرع فقط)،
// ولا يُسمح بإزالة آخر فرع لمستخدم مقيَّد (وإلا صار بلا صفوف = يصل لكل الفروع).

type Row = { user_id: string; username: string; full_name: string; branches: number[] }

async function loadUsers(): Promise<Row[]> {
  const users = await sql`
    SELECT us.user_id::text AS user_id, COALESCE(us.username, '') AS username, COALESCE(NULLIF(us.full_name, ''), us.username, us.user_id::text) AS full_name,
      COALESCE(ARRAY_AGG(ub.branch_id) FILTER (WHERE ub.branch_id IS NOT NULL), '{}') AS branches
    FROM user_settings us
    LEFT JOIN user_branches ub ON ub.user_id::text = us.user_id::text
    WHERE COALESCE(us.is_active, true) = true
    GROUP BY us.user_id, us.username, us.full_name
    ORDER BY 3
  ` as any[]
  return users.map((row) => ({ ...row, branches: (row.branches || []).map(Number) }))
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authorization = await authorizeFile(request, "branches", "view")
    if (!authorization.ok) return authorization.response
    await ensurePermissionTables(await resolveCurrentDbName())
    const branchId = Number(params.id)
    if (!Number.isInteger(branchId) || branchId <= 0) return NextResponse.json({ error: "معرّف الفرع غير صالح" }, { status: 400 })
    const users = await loadUsers()
    return NextResponse.json({
      users: users.map((user) => ({
        user_id: user.user_id, username: user.username, full_name: user.full_name,
        unrestricted: user.branches.length === 0,
        has_access: user.branches.length === 0 || user.branches.includes(branchId),
        branch_count: user.branches.length,
      })),
    })
  } catch (error) {
    console.error("[branches/users] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل مستخدمي الفرع" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authorization = await authorizeFile(request, "branches", "update")
    if (!authorization.ok) return authorization.response
    await ensurePermissionTables(await resolveCurrentDbName())
    const branchId = Number(params.id)
    if (!Number.isInteger(branchId) || branchId <= 0) return NextResponse.json({ error: "معرّف الفرع غير صالح" }, { status: 400 })
    const body = await request.json().catch(() => ({}))
    const selected = new Set<string>((Array.isArray(body.user_ids) ? body.user_ids : []).map((id: unknown) => String(id)))

    return await withTenantTransaction(async () => {
      const users = await loadUsers()
      const allBranches = ((await sql`SELECT id FROM branches WHERE COALESCE(status, 1) <> 3`) as any[]).map((row) => Number(row.id))
      const blocked: string[] = []
      for (const user of users) {
        const unrestricted = user.branches.length === 0
        const hasAccess = unrestricted || user.branches.includes(branchId)
        const wants = selected.has(user.user_id)
        if (wants && !hasAccess) {
          await sql`INSERT INTO user_branches (user_id, branch_id) VALUES (${user.user_id}, ${branchId}) ON CONFLICT DO NOTHING`
        } else if (!wants && hasAccess) {
          if (unrestricted) {
            // كان يصل لكل الفروع: يُمنح كل الفروع الأخرى صراحةً
            const others = allBranches.filter((id) => id !== branchId)
            if (!others.length) { blocked.push(user.full_name); continue }
            for (const other of others) await sql`INSERT INTO user_branches (user_id, branch_id) VALUES (${user.user_id}, ${other}) ON CONFLICT DO NOTHING`
          } else if (user.branches.length === 1) {
            blocked.push(user.full_name)
          } else {
            await sql`DELETE FROM user_branches WHERE user_id::text = ${user.user_id} AND branch_id = ${branchId}`
          }
        }
      }
      if (blocked.length) {
        throw Object.assign(new Error(`لا يمكن إزالة هذا الفرع لأنه الفرع الوحيد للمستخدم: ${blocked.slice(0, 5).join("، ")} — أضف له فرعاً آخر أولاً`), { status: 400 })
      }
      return NextResponse.json({ success: true })
    })
  } catch (error: any) {
    if (error?.status === 400) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("[branches/users] PUT failed", error)
    return NextResponse.json({ error: "تعذر حفظ صلاحيات المستخدمين" }, { status: 500 })
  }
}
