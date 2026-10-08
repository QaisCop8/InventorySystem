import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import crypto from "crypto"
import sql, { resolveCurrentDbName } from "./database"
import { ensurePermissionTables, hasEffectivePermission, syncPermissionDefinitions } from "./permissions"
import { shouldUseSecureCookies } from "./cookie-security"

// جلسة خادمية حقيقية لتسجيل دخول الشركة (تينانت) — نفس نمط management_sessions/mgmt_session في
// lib/management-auth.ts تماماً، لكن مقيَّدة بقاعدة الشركة الحالية (sql من lib/database.ts يُحلّها
// تلقائياً كبقية التطبيق). أساس "التحقق من الصلاحية فعلياً على الخادم" بدل الاعتماد فقط على إخفاء
// الواجهة (Util.checkUserAccess) — انظر خطة الصلاحيات لسياق كامل.
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_COOKIE = "tenant_session"
// كوكي جلسة لكل قاعدة شركة: التبويبات المختلفة قد تعمل على شركات مختلفة في نفس الوقت (هيدر x-tenant-db)،
// والكوكي المشتركة الواحدة كانت تُستبدل بجلسة آخر شركة فُتحت — فترفض الشركة الأخرى كل الطلبات
// بـ"يجب تسجيل الدخول". الكوكي القديمة (بلا اسم القاعدة) تُقرأ احتياطياً حتى لا تُفقد الجلسات القائمة.
const sessionCookieFor = (dbName: string) => `${SESSION_COOKIE}_${dbName}`

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
  const options = { httpOnly: true, secure: await shouldUseSecureCookies(), sameSite: "lax" as const, expires: expiresAt, path: "/" }
  cookieStore.set(sessionCookieFor(await resolveCurrentDbName()), sessionToken, options)
  // الكوكي العامة تبقى لتوافق المسارات/الإصدارات القديمة (احتياطي فقط عند القراءة).
  cookieStore.set(SESSION_COOKIE, sessionToken, options)
}

export async function clearTenantSession(): Promise<void> {
  try {
    const dbName = await resolveCurrentDbName()
    await ensurePermissionTables(dbName)
    const cookieStore = await cookies()
    const tokens = [cookieStore.get(sessionCookieFor(dbName))?.value, cookieStore.get(SESSION_COOKIE)?.value].filter(Boolean) as string[]
    for (const token of tokens) await sql`DELETE FROM tenant_sessions WHERE session_token = ${token}`
    cookieStore.delete(sessionCookieFor(dbName))
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
    const dbName = await resolveCurrentDbName()
    await ensurePermissionTables(dbName)
    // جلسة هذه الشركة أولاً، ثم الكوكي العامة (قد تحمل جلسة شركة أخرى فلا تُطابق هنا).
    const candidates = [request.cookies.get(sessionCookieFor(dbName))?.value, request.cookies.get(SESSION_COOKIE)?.value].filter(Boolean) as string[]
    if (!candidates.length) return null

    let sessionToken = ""
    let sessionRows: any[] = []
    for (const token of candidates) {
      sessionRows = await sql`SELECT user_id, expires_at FROM tenant_sessions WHERE session_token = ${token}`
      if (sessionRows.length) { sessionToken = token; break }
    }
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

export async function requirePermissionByName(
  request: NextRequest,
  permissionName: string,
  branchIdOverride?: number | null,
): Promise<PermissionCheckResult> {
  const user = await getSessionUser(request)
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  }
  await syncPermissionDefinitions(await resolveCurrentDbName())
  const access = (await sql`SELECT id FROM access_list WHERE name = ${permissionName} ORDER BY id LIMIT 1`)[0]
  if (!access) {
    return { ok: false, response: NextResponse.json({ error: `صلاحية ${permissionName} غير معرفة` }, { status: 403 }) }
  }
  const headerBranchId = Number(request.headers.get("x-branch-id"))
  const branchId = Number.isInteger(branchIdOverride) && Number(branchIdOverride) > 0
    ? Number(branchIdOverride)
    : Number.isInteger(headerBranchId) && headerBranchId > 0 ? headerBranchId : null
  const granted = await hasEffectivePermission(user.user_id, Number(access.id), branchId)
  if (!granted) {
    return { ok: false, response: NextResponse.json({ error: `لا يوجد لديك صلاحية ${permissionName}` }, { status: 403 }) }
  }
  return { ok: true, user }
}
