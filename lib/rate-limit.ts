import type { NextRequest } from "next/server"

// حدّ محاولات بسيط بالذاكرة (خادم واحد على Render) لمسارات تسجيل الدخول والرموز — يمنع تخمين كلمات المرور
// ورموز التفعيل. يُعدّ كل طلب POST (ناجحاً أو فاشلاً) لكل عنوان IP ولكل مسار ضمن نافذة زمنية.

type Rule = { path: string; limit: number; windowMs: number }

const MINUTE = 60_000
const RULES: Rule[] = [
  { path: "/api/auth/login", limit: 10, windowMs: 5 * MINUTE },
  { path: "/api/management/auth/login", limit: 10, windowMs: 5 * MINUTE },
  { path: "/api/auth/password-reset", limit: 10, windowMs: 15 * MINUTE },
  { path: "/api/management/auth/signup", limit: 5, windowMs: 15 * MINUTE },
  { path: "/api/management/auth/change-password", limit: 10, windowMs: 15 * MINUTE },
  { path: "/api/permission-approvals", limit: 60, windowMs: 5 * MINUTE },
  // تخمين رموز قسائم المساعدة (القفل بعد 5 أرقام سرية خاطئة يحمي الرمز الواحد، وهذا يحمي من تجربة رموز كثيرة)
  { path: "/api/aid/verify", limit: 60, windowMs: 5 * MINUTE },
]

const hits = new Map<string, { count: number; resetAt: number }>()

export function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip") || "unknown"
}

/** عدد الثواني حتى يُسمح مجدداً، أو null إن كان الطلب ضمن الحد. */
export function rateLimitRetryAfter(request: NextRequest): number | null {
  if (request.method !== "POST") return null
  const rule = RULES.find((entry) => request.nextUrl.pathname === entry.path)
  if (!rule) return null

  const now = Date.now()
  if (hits.size > 10_000) for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key)

  const key = `${rule.path}\u0000${clientIp(request)}`
  const entry = hits.get(key)
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + rule.windowMs })
    return null
  }
  entry.count += 1
  return entry.count > rule.limit ? Math.ceil((entry.resetAt - now) / 1000) : null
}
