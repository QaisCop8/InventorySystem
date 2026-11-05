import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import crypto from "crypto"
import sql, { memoInTransaction, resolveCurrentDbName } from "./database"
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

export type ActiveSessionElsewhere = { user_agent: string | null; ip_address: string | null; created_at: string }

// رموز جلسات هذا المتصفح (كل تبويباته تشترك بالكوكيز) — جلسته على نفس الشركة ليست "جهازاً آخر"
async function browserSessionTokens(): Promise<string[]> {
  const cookieStore = await cookies()
  const dbName = await resolveCurrentDbName()
  return [cookieStore.get(sessionCookieFor(dbName))?.value, cookieStore.get(SESSION_COOKIE)?.value].filter((token): token is string => Boolean(token))
}

/** جهاز واحد لكل مستخدم: جلسة سارية لنفس المستخدم من متصفح/جهاز آخر (أحدثها)، أو null. */
export async function findActiveSessionElsewhere(userId: string): Promise<ActiveSessionElsewhere | null> {
  await ensurePermissionTables(await resolveCurrentDbName())
  const ownTokens = await browserSessionTokens()
  const rows = await sql`
    SELECT user_agent, ip_address, created_at AT TIME ZONE current_setting('TimeZone') AS created_at
    FROM tenant_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      AND NOT (session_token = ANY(${ownTokens}::text[]))
    ORDER BY created_at DESC
    LIMIT 1
  `
  return (rows[0] as ActiveSessionElsewhere | undefined) ?? null
}

/**
 * replaceOtherDevices: المستخدم أكّد «سجّل الخروج من الجهاز الآخر» — جلساته الأخرى تُعلَّم مُزاحة (لا تُحذف)
 * فيعرف الجهاز القديم عند طلبه التالي أنه خرج بسبب دخول من جهاز آخر (lib/api-session-gate.ts).
 */
export async function createTenantSession(userId: string, device: { ip?: string | null; userAgent?: string | null; replaceOtherDevices?: boolean } = {}): Promise<void> {
  await ensurePermissionTables(await resolveCurrentDbName())

  const ownTokens = await browserSessionTokens()
  // جلسة هذا المتصفح القديمة تُستبدل بالجديدة (لا تتراكم جلسات لنفس الجهاز)
  if (ownTokens.length) await sql`DELETE FROM tenant_sessions WHERE user_id = ${userId} AND session_token = ANY(${ownTokens}::text[])`
  if (device.replaceOtherDevices) {
    await sql`
      UPDATE tenant_sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ${"other_device"}
      WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    `
  }

  const sessionToken = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const ip = device.ip?.split(",")[0]?.trim().slice(0, 64) || null
  await sql`
    INSERT INTO tenant_sessions (user_id, session_token, expires_at, ip_address, user_agent)
    VALUES (${userId}, ${sessionToken}, ${expiresAt}, ${ip}, ${device.userAgent?.slice(0, 500) || null})
  `

  const cookieStore = await cookies()
  const options = { httpOnly: true, secure: await shouldUseSecureCookies(), sameSite: "lax" as const, expires: expiresAt, path: "/" }
  cookieStore.set(sessionCookieFor(await resolveCurrentDbName()), sessionToken, options)
  // الكوكي العامة تبقى لتوافق المسارات/الإصدارات القديمة (احتياطي فقط عند القراءة).
  cookieStore.set(SESSION_COOKIE, sessionToken, options)
}

/** إيقاف/حذف مستخدم: كل جلساته على أي جهاز تنتهي فوراً، ويعرف الجهاز عند طلبه التالي أن حسابه أُوقف. */
export async function revokeUserSessions(userId: string | number, reason: "account_disabled" | "other_device"): Promise<void> {
  await ensurePermissionTables(await resolveCurrentDbName())
  await sql`
    UPDATE tenant_sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ${reason}
    WHERE user_id = ${Number(userId)} AND revoked_at IS NULL
  `
}

/** أول مستخدم في الشركة (أصغر رقم مستخدم — مدير النظام الذي أنشأها): لا يُوقف ولا يُحذف. */
export async function isPrimaryCompanyUser(userId: string | number): Promise<boolean> {
  const row = (await sql`SELECT MIN(user_id) AS first_id FROM user_settings`)[0] as { first_id: number | null } | undefined
  return row?.first_id != null && Number(row.first_id) === Number(userId)
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

// داخل معاملة (حفظ فاتورة الكاشير يتحقق من الصلاحية عدة مرات) تُقرأ الجلسة مرة واحدة لنفس الكوكي
export function getSessionUser(request: NextRequest): Promise<TenantSessionUser | null> {
  return memoInTransaction(`session-user:${request.headers.get("cookie") || ""}`, () => loadSessionUser(request))
}

async function loadSessionUser(request: NextRequest): Promise<TenantSessionUser | null> {
  try {
    const dbName = await resolveCurrentDbName()
    await ensurePermissionTables(dbName)
    // جلسة هذه الشركة أولاً، ثم الكوكي العامة (قد تحمل جلسة شركة أخرى فلا تُطابق هنا).
    const candidates = [request.cookies.get(sessionCookieFor(dbName))?.value, request.cookies.get(SESSION_COOKIE)?.value].filter(Boolean) as string[]
    if (!candidates.length) return null

    let sessionToken = ""
    let sessionRows: any[] = []
    for (const token of candidates) {
      sessionRows = await sql`SELECT user_id, expires_at FROM tenant_sessions WHERE session_token = ${token} AND revoked_at IS NULL`
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
