import { cookies, headers } from "next/headers"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import crypto from "crypto"
import sql, { memoInTransaction, resolveCurrentDbName } from "./database"
import { ensurePermissionTables, hasEffectivePermission, syncPermissionDefinitions } from "./permissions"
import { shouldUseSecureCookies } from "./cookie-security"
import { SESSION_COOKIE, isCompanySessionCookie, sessionCookieFor, sessionTokenCandidates, userSessionCookieFor } from "./session-cookies"

// جلسة خادمية حقيقية لتسجيل دخول الشركة (تينانت) — نفس نمط management_sessions/mgmt_session في
// lib/management-auth.ts تماماً، لكن مقيَّدة بقاعدة الشركة الحالية (sql من lib/database.ts يُحلّها
// تلقائياً كبقية التطبيق). أساس "التحقق من الصلاحية فعلياً على الخادم" بدل الاعتماد فقط على إخفاء
// الواجهة (Util.checkUserAccess) — انظر خطة الصلاحيات لسياق كامل.
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// كوكي جلسة لكل قاعدة شركة ولكل مستخدم (lib/session-cookies.ts): التبويبات قد تعمل على شركات مختلفة وبمستخدمين
// مختلفين في نفس الوقت — كوكي واحدة كانت تُستبدل بآخر دخول فيُطالَب المستخدم الآخر بالدخول من جديد.

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export type ActiveSessionElsewhere = { user_agent: string | null; ip_address: string | null; created_at: string; last_seen_at: string }

// «مسجَّل من جهاز آخر» = جلسة استُخدمت خلال هذه المدة (lib/api-session-gate.ts يحدّث last_seen_at ما دام التبويب مفتوحاً).
// جلسة أقدم (متصفح أُغلق دون خروج، أو جلسة قبل هذه الميزة بلا last_seen_at) لا تمنع الدخول وتُنهى بصمت عنده.
const ACTIVE_SESSION_MINUTES = 15

// معرّف ثابت لهذا المتصفح (سنة): جلسات نفس الجهاز تُعرف به حتى لو استُبدلت كوكي جلسة (دخول مستخدم آخر، أو جلسات
// قبل الكوكيز لكل مستخدم) — بدونه كانت جلسة نفس الجهاز تُعامَل كـ«جهاز آخر».
const DEVICE_COOKIE = "noon_device"
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/

async function currentDeviceId(): Promise<string | null> {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value || ""
  return DEVICE_ID_PATTERN.test(value) ? value : null
}

async function ensureDeviceId(): Promise<string> {
  const existing = await currentDeviceId()
  if (existing) return existing
  const deviceId = crypto.randomBytes(16).toString("hex")
  ;(await cookies()).set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure: await shouldUseSecureCookies(), sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 })
  return deviceId
}

// رموز جلسات هذا المتصفح على الشركة (كل مستخدميه وتبويباته تشترك بالكوكيز) — جلسته ليست "جهازاً آخر"
async function browserSessionTokens(): Promise<string[]> {
  const cookieStore = await cookies()
  const dbName = await resolveCurrentDbName()
  return [...new Set(cookieStore.getAll().filter((cookie) => isCompanySessionCookie(cookie.name, dbName)).map((cookie) => cookie.value).filter(Boolean))]
}

/** جهاز واحد لكل مستخدم: جلسة مستخدمة حالياً لنفس المستخدم من متصفح/جهاز آخر (أحدثها نشاطاً)، أو null. */
export async function findActiveSessionElsewhere(userId: string): Promise<ActiveSessionElsewhere | null> {
  await ensurePermissionTables(await resolveCurrentDbName())
  const ownTokens = await browserSessionTokens()
  const deviceId = await currentDeviceId()
  const rows = await sql`
    SELECT user_agent, ip_address,
           created_at AT TIME ZONE current_setting('TimeZone') AS created_at,
           last_seen_at AT TIME ZONE current_setting('TimeZone') AS last_seen_at
    FROM tenant_sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      AND last_seen_at > CURRENT_TIMESTAMP - make_interval(mins => ${ACTIVE_SESSION_MINUTES})
      AND NOT (session_token = ANY(${ownTokens}::text[]))
      AND (${deviceId}::text IS NULL OR device_id IS DISTINCT FROM ${deviceId})
    ORDER BY last_seen_at DESC
    LIMIT 1
  `
  return (rows[0] as ActiveSessionElsewhere | undefined) ?? null
}

/**
 * جهاز واحد لكل مستخدم: كل جلساته الأخرى تُعلَّم مُزاحة (لا تُحذف) فيعرف الجهاز القديم عند طلبه التالي أنه خرج بسبب
 * دخول من جهاز آخر (lib/api-session-gate.ts). الجلسة المستخدمة حالياً لا تصل هنا إلا بعد تأكيد المستخدم
 * (replaceOtherDevices) — المسارات تتحقق أولاً بـfindActiveSessionElsewhere.
 */
export async function createTenantSession(userId: string, device: { ip?: string | null; userAgent?: string | null; replaceOtherDevices?: boolean } = {}): Promise<void> {
  await ensurePermissionTables(await resolveCurrentDbName())

  const ownTokens = await browserSessionTokens()
  const deviceId = await ensureDeviceId()
  // جلسة هذا المتصفح القديمة تُستبدل بالجديدة (لا تتراكم جلسات لنفس الجهاز)
  if (ownTokens.length) await sql`DELETE FROM tenant_sessions WHERE user_id = ${userId} AND session_token = ANY(${ownTokens}::text[])`
  await sql`
    UPDATE tenant_sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ${"other_device"}
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
  `

  const sessionToken = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  const ip = device.ip?.split(",")[0]?.trim().slice(0, 64) || null
  await sql`
    INSERT INTO tenant_sessions (user_id, session_token, expires_at, ip_address, user_agent, last_seen_at, device_id)
    VALUES (${userId}, ${sessionToken}, ${expiresAt}, ${ip}, ${device.userAgent?.slice(0, 500) || null}, CURRENT_TIMESTAMP, ${deviceId})
  `

  const cookieStore = await cookies()
  const options = { httpOnly: true, secure: await shouldUseSecureCookies(), sameSite: "lax" as const, expires: expiresAt, path: "/" }
  const dbName = await resolveCurrentDbName()
  // كوكي هذا المستخدم (تبويباته ترسل x-user-id فتُختار جلسته حتى لو دخل مستخدم آخر بعده على نفس المتصفح)
  cookieStore.set(userSessionCookieFor(dbName, userId), sessionToken, options)
  // آخر دخول على الشركة + العامة: احتياط لطلبات بلا x-user-id
  cookieStore.set(sessionCookieFor(dbName), sessionToken, options)
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

// خروج مستخدم هذا التبويب فقط (x-user-id): جلسات المستخدمين الآخرين على نفس المتصفح تبقى
export async function clearTenantSession(): Promise<void> {
  try {
    const dbName = await resolveCurrentDbName()
    await ensurePermissionTables(dbName)
    const cookieStore = await cookies()
    const rawUserId = ((await headers()).get("x-user-id") || "").trim()
    const userId = /^\d+$/.test(rawUserId) ? rawUserId : ""
    const named = [...(userId ? [userSessionCookieFor(dbName, userId)] : []), sessionCookieFor(dbName), SESSION_COOKIE]
    const tokens = sessionTokenCandidates((name) => cookieStore.get(name)?.value, dbName, userId)
    for (const token of tokens) {
      if (userId) await sql`DELETE FROM tenant_sessions WHERE session_token = ${token} AND user_id = ${Number(userId)}`
      else await sql`DELETE FROM tenant_sessions WHERE session_token = ${token}`
    }
    // ما بقي من هذه الرموز جلسات مستخدمين آخرين (آخر دخول على الشركة قد يكون لغيره) — كوكيزها تبقى
    const otherUsersTokens = userId
      ? (await sql`SELECT session_token FROM tenant_sessions WHERE session_token = ANY(${tokens}::text[])`).map((row: any) => row.session_token as string)
      : []
    for (const name of named) {
      const value = cookieStore.get(name)?.value
      if (value && !otherUsersTokens.includes(value)) cookieStore.delete(name)
    }
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
  return memoInTransaction(`session-user:${request.headers.get("x-user-id") || ""}:${request.headers.get("cookie") || ""}`, () => loadSessionUser(request))
}

async function loadSessionUser(request: NextRequest): Promise<TenantSessionUser | null> {
  try {
    const dbName = await resolveCurrentDbName()
    await ensurePermissionTables(dbName)
    // جلسة مستخدم هذا التبويب أولاً، ثم آخر دخول على الشركة، ثم العامة (lib/session-cookies.ts)
    const userIdHint = request.headers.get("x-user-id")
    const candidates = sessionTokenCandidates((name) => request.cookies.get(name)?.value, dbName, userIdHint)
    if (!candidates.length) return null

    let sessionToken = ""
    let sessionRows: any[] = []
    for (const token of candidates) {
      sessionRows = await sql`SELECT user_id, expires_at FROM tenant_sessions WHERE session_token = ${token} AND revoked_at IS NULL`
      if (sessionRows.length) { sessionToken = token; break }
    }
    if (sessionRows.length === 0) return null

    const session = sessionRows[0]
    // التبويب لمستخدم آخر غير صاحب الجلسة المتاحة ⇐ لا جلسة (لا يعمل تبويب مستخدم بجلسة مستخدم غيره)
    if (userIdHint && String(session.user_id) !== String(userIdHint).trim()) return null
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
