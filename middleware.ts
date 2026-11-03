import { NextResponse, type NextRequest } from "next/server"
import { checkApiSession, forgetApiSession } from "@/lib/api-session-gate"
import { rateLimitRetryAfter } from "@/lib/rate-limit"

// كل مسارات /api تتطلب جلسة شركة صالحة (lib/api-session-gate.ts) ما عدا القائمة العامة أدناه.
// مسارات الإدارة (/api/management) لها جلستها الخاصة (mgmt_session) وتتحقق منها بنفسها.
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/password-reset",
  "/api/management/",
  "/api/portal/", // بوابة العملاء: رابط برمز مُشفَّر
  "/api/whatsapp/webhook",
  "/api/cron/", // سر CRON_SECRET
  "/api/mobile-app",
  "/api/offline/assets",
]

function isPublic(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.method === "OPTIONS") return NextResponse.next()
  const retryAfter = rateLimitRetryAfter(request)
  if (retryAfter !== null) {
    return NextResponse.json(
      { error: `محاولات كثيرة — حاول مرة أخرى بعد ${Math.ceil(retryAfter / 60)} دقيقة` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    )
  }
  if (pathname === "/api/auth/logout") forgetApiSession(request)
  if (isPublic(pathname)) return NextResponse.next()

  const session = await checkApiSession(request)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  // هوية المستخدم من الجلسة فقط: x-user-id كان يُقرأ كما أرسله المتصفح (الكاشير وأرشيف السندات) فيمكن انتحال أي مستخدم
  const headers = new Headers(request.headers)
  headers.set("x-user-id", session.userId)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  runtime: "nodejs",
  matcher: ["/api/:path*"],
}
