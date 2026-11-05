import type { NextRequest } from "next/server"
import sql, { resolveTenantDbFromValues, withTenantDb } from "./database"
import { SESSION_COOKIE, sessionTokenCandidates } from "./session-cookies"

// بوابة الجلسة لكل مسارات /api (يستدعيها middleware.ts): لا يصل طلب لأي مسار إلا بجلسة شركة صالحة
// لنفس القاعدة التي يحددها هيدر x-tenant-db/كوكي tenant_db. سابقاً كانت ~270 مساراً بلا أي فحص، والقاعدة
// تُختار من هيدر يرسله المتصفح — فمعرفة اسم قاعدة شركة كانت تكفي لقراءة بياناتها وتعديلها.
// الجلسة نفسها تُقرأ كما في lib/tenant-auth.ts (loadSessionUser): كوكي الشركة أولاً ثم الكوكي العامة.

const CACHE_TTL_MS = 30_000
const CACHE_MAX = 5_000

// ذاكرة قصيرة حتى لا يضيف كل طلب API استعلامين على Neon (لوحة الرئيسية تطلق عشرات الطلبات معاً)
const validated = new Map<string, { userId: string; until: number }>()

export type ApiSessionResult =
  | { ok: true; userId: string; dbName: string }
  | { ok: false; status: number; error: string; code?: SessionEndedCode }

// جلسة أُنهيت عمداً — الواجهة (auth-context) تُخرج هذا الجهاز وتعرض السبب في «شركاتي»
export type SessionEndedCode = "other_device" | "account_disabled"
const SESSION_ENDED_MESSAGES: Record<SessionEndedCode, string> = {
  other_device: "تم تسجيل خروجك لأن حسابك فُتح من جهاز آخر",
  account_disabled: "تم إيقاف حسابك — راجع مدير النظام",
}
const ended = (code: SessionEndedCode): ApiSessionResult => ({ ok: false, status: 401, error: SESSION_ENDED_MESSAGES[code], code })

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

  // جلسة مستخدم هذا التبويب أولاً (عدة مستخدمين على نفس المتصفح — lib/session-cookies.ts)
  const tokens = sessionTokenCandidates((name) => request.cookies.get(name)?.value, dbName, request.headers.get("x-user-id"))
  if (!tokens.length) return { ok: false, status: 401, error: "يجب تسجيل الدخول" }

  const now = Date.now()
  for (const token of tokens) {
    const cached = validated.get(cacheKey(dbName, token))
    if (cached && cached.until > now) return { ok: true, userId: cached.userId, dbName }
  }

  try {
    for (const token of tokens) {
      const rows = (await withTenantDb(dbName, () => sql`
        SELECT s.user_id, s.expires_at, s.revoked_at, s.revoked_reason, u.is_active
        FROM tenant_sessions s
        JOIN user_settings u ON u.user_id::text = s.user_id::text
        WHERE s.session_token = ${token}
        LIMIT 1
      `).catch((error: any) => {
        // قاعدة لم تُرحَّل بعد لعمود revoked_at (lib/permissions.ts يضيفه عند أول دخول بعد النشر)
        if (error?.code !== "42703") throw error
        return withTenantDb(dbName, () => sql`
          SELECT s.user_id, s.expires_at, NULL AS revoked_at, NULL AS revoked_reason, u.is_active
          FROM tenant_sessions s
          JOIN user_settings u ON u.user_id::text = s.user_id::text
          WHERE s.session_token = ${token}
          LIMIT 1
        `)
      })) as any[]
      const row = rows[0]
      if (!row || new Date(row.expires_at) < new Date()) continue
      // مستخدم موقوف، أو جلسة أزاحها دخول من جهاز آخر (lib/tenant-auth.ts)
      if (row.is_active !== true || row.revoked_reason === "account_disabled") return ended("account_disabled")
      if (row.revoked_at) return ended("other_device")
      if (validated.size >= CACHE_MAX) validated.clear()
      validated.set(cacheKey(dbName, token), { userId: String(row.user_id), until: now + CACHE_TTL_MS })
      // آخر استخدام للجلسة (مرة كل دقيقة على الأكثر، دون انتظار): يميّز جهازاً يعمل الآن عن جلسة متروكة —
      // findActiveSessionElsewhere (lib/tenant-auth.ts) لا يمنع الدخول إلا بسبب جلسة مستخدمة حالياً
      void withTenantDb(dbName, () => sql`
        UPDATE tenant_sessions SET last_seen_at = CURRENT_TIMESTAMP
        WHERE session_token = ${token} AND (last_seen_at IS NULL OR last_seen_at < CURRENT_TIMESTAMP - INTERVAL '1 minute')
      `).catch(() => undefined)
      return { ok: true, userId: String(row.user_id), dbName }
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
