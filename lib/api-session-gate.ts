import type { NextRequest } from "next/server"
import sql, { resolveTenantDbFromValues, withTenantDb } from "./database"

// بوابة الجلسة لكل مسارات /api (يستدعيها middleware.ts): لا يصل طلب لأي مسار إلا بجلسة شركة صالحة
// لنفس القاعدة التي يحددها هيدر x-tenant-db/كوكي tenant_db. سابقاً كانت ~270 مساراً بلا أي فحص، والقاعدة
// تُختار من هيدر يرسله المتصفح — فمعرفة اسم قاعدة شركة كانت تكفي لقراءة بياناتها وتعديلها.
// الجلسة نفسها تُقرأ كما في lib/tenant-auth.ts (loadSessionUser): كوكي الشركة أولاً ثم الكوكي العامة.

const SESSION_COOKIE = "tenant_session"
const CACHE_TTL_MS = 30_000
const CACHE_MAX = 5_000

// ذاكرة قصيرة حتى لا يضيف كل طلب API استعلامين على Neon (لوحة الرئيسية تطلق عشرات الطلبات معاً)
const validated = new Map<string, { userId: string; until: number }>()

export type ApiSessionResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string }

function cacheKey(dbName: string, token: string) {
  return `${dbName}\u0000${token}`
}

export function forgetApiSession(request: NextRequest) {
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith(SESSION_COOKIE)) continue
    for (const key of validated.keys()) if (key.endsWith(`\u0000${cookie.value}`)) validated.delete(key)
  }
}

export async function checkApiSession(request: NextRequest): Promise<ApiSessionResult> {
  const dbName = await resolveTenantDbFromValues(request.headers.get("x-tenant-db"), request.cookies.get("tenant_db")?.value ?? null)
  if (!dbName) {
    return { ok: false, status: 403, error: "الشركة المفتوحة في هذا التبويب غير متاحة حالياً (منتهية الاشتراك أو غير معتمدة) — أعد اختيار الشركة" }
  }

  const tokens = [request.cookies.get(`${SESSION_COOKIE}_${dbName}`)?.value, request.cookies.get(SESSION_COOKIE)?.value]
    .filter((token): token is string => Boolean(token) && /^[a-f0-9]{16,255}$/i.test(String(token)))
  if (!tokens.length) return { ok: false, status: 401, error: "يجب تسجيل الدخول" }

  const now = Date.now()
  for (const token of tokens) {
    const cached = validated.get(cacheKey(dbName, token))
    if (cached && cached.until > now) return { ok: true, userId: cached.userId }
  }

  try {
    for (const token of tokens) {
      const rows: any[] = await withTenantDb(dbName, () => sql`
        SELECT s.user_id, s.expires_at
        FROM tenant_sessions s
        JOIN user_settings u ON u.user_id::text = s.user_id::text
        WHERE s.session_token = ${token} AND u.is_active IS TRUE
        LIMIT 1
      `)
      const row = rows[0]
      if (!row || new Date(row.expires_at) < new Date()) continue
      if (validated.size >= CACHE_MAX) validated.clear()
      validated.set(cacheKey(dbName, token), { userId: String(row.user_id), until: now + CACHE_TTL_MS })
      return { ok: true, userId: String(row.user_id) }
    }
  } catch (error: any) {
    // قاعدة بلا جدول tenant_sessions بعد (لم يسجّل أحد الدخول إليها): لا جلسة. غير ذلك (انقطاع الاتصال) خطأ مؤقت.
    if (error?.code !== "42P01") {
      console.error("[api-session-gate] session check failed:", error)
      return { ok: false, status: 503, error: "تعذّر التحقق من الجلسة حالياً، حاول مرة أخرى" }
    }
  }
  return { ok: false, status: 401, error: "يجب تسجيل الدخول" }
}
