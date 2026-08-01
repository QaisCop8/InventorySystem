import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import crypto from "crypto"
import sql, { resolveCurrentDbName } from "./database"
import { ensurePermissionTables, hasEffectivePermission } from "./permissions"

// جلسة خادمية حقيقية لتسجيل دخول الشركة (تينانت) — نفس نمط management_sessions/mgmt_session في
// lib/management-auth.ts تماماً، لكن مقيَّدة بقاعدة الشركة الحالية (sql من lib/database.ts يُحلّها
// تلقائياً كبقية التطبيق). أساس "التحقق من الصلاحية فعلياً على الخادم" بدل الاعتماد فقط على إخفاء
// الواجهة (Util.checkUserAccess) — انظر خطة الصلاحيات لسياق كامل.
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_COOKIE = "tenant_session"

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function createTenantSession(userId: string): Promise<void> {
  await ensurePermissionTables(await resolveCurrentDbName())

  const sessionToken = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await sql`
    INSERT INTO tenant_sessions (user_id, session_token, expires_at)
    VALUES (${userId}, ${sessionToken}, ${expiresAt})
  `

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  })
}

export async function clearTenantSession(): Promise<void> {
  try {
    await ensurePermissionTables(await resolveCurrentDbName())
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
    if (sessionToken) {
      await sql`DELETE FROM tenant_sessions WHERE session_token = ${sessionToken}`
    }
    cookieStore.delete(SESSION_COOKIE)
  } catch (error) {
    console.error("[tenant-auth] clearTenantSession error:", error)
  }
}

export interface TenantSessionUser {
  user_id: string
  username: string
  full_name: string
}

export async function getSessionUser(request: NextRequest): Promise<TenantSessionUser | null> {
  try {
    await ensurePermissionTables(await resolveCurrentDbName())
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value
    if (!sessionToken) return null

    const sessionRows = await sql`SELECT user_id, expires_at FROM tenant_sessions WHERE session_token = ${sessionToken}`
    if (sessionRows.length === 0) return null

    const session = sessionRows[0]
    if (new Date(session.expires_at) < new Date()) {
      await sql`DELETE FROM tenant_sessions WHERE session_token = ${sessionToken}`
      return null
    }

    const userRows = await sql`
      SELECT user_id, username, full_name, is_active FROM user_settings WHERE user_id = ${session.user_id}
    `
    if (userRows.length === 0) return null
    const user = userRows[0]
    if (!user.is_active) return null

    return { user_id: user.user_id, username: user.username, full_name: user.full_name }
  } catch (error) {
    console.error("[tenant-auth] getSessionUser error:", error)
    return null
  }
}

export type PermissionCheckResult =
  | { ok: true; user: TenantSessionUser }
  | { ok: false; response: NextResponse }

export async function requirePermission(request: NextRequest, accessId: number): Promise<PermissionCheckResult> {
  const user = await getSessionUser(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  }
  const requestedBranchId = Number(request.headers.get("x-branch-id"))
  const branchId = Number.isInteger(requestedBranchId) && requestedBranchId > 0 ? requestedBranchId : null
  const granted = await hasEffectivePermission(user.user_id, accessId, branchId)
  if (!granted) {
    return { ok: false, response: NextResponse.json({ error: "لا يوجد لديك صلاحية" }, { status: 403 }) }
  }
  return { ok: true, user }
}
