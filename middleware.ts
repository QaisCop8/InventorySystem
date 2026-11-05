import { NextResponse, type NextRequest } from "next/server"
import { checkApiSession, forgetApiSession } from "@/lib/api-session-gate"
import { clientIp, rateLimitRetryAfter } from "@/lib/rate-limit"
import { markLoggedOut, touchPresence } from "@/lib/user-presence"

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
  if (pathname === "/api/auth/logout") {
    // خروج المستخدم يظهر فوراً في «سجل الدخول للموقع» بلوحة الإدارة بدل انتظار انتهاء نافذة الاتصال
    const session = await checkApiSession(request).catch(() => null)
    if (session?.ok) markLoggedOut(session.dbName, session.userId)
    forgetApiSession(request)
  }
  // رفع بطيء (جوال): Next ينسخ جسم الطلب للـmiddleware، وإن أكملنا قبل وصوله كاملاً يصل للمسار مقطوعاً
  // («Failed to parse body as FormData» / «Unexpected end of JSON input»). قراءة نسختنا للنهاية تضمن اكتمال الجسم أولاً.
  if (request.body) await request.arrayBuffer().catch(() => undefined)
  if (isPublic(pathname)) return NextResponse.next()

  const session = await checkApiSession(request)
  if (!session.ok) {
    // x-session-ended (other_device / account_disabled): الواجهة (auth-context) تُخرج هذا الجهاز وتعرض السبب
    return NextResponse.json(
      { error: session.error, ...(session.code ? { code: session.code } : {}) },
      { status: session.status, headers: session.code ? { "x-session-ended": session.code } : undefined },
    )
  }
  touchPresence(session.dbName, session.userId, clientIp(request))

  // هوية المستخدم من الجلسة فقط: x-user-id كان يُقرأ كما أرسله المتصفح (الكاشير وأرشيف السندات) فيمكن انتحال أي مستخدم.
  // نرفض الطلب إن خالف الجلسة بدل استبدال الهيدر (NextResponse.next({ request: { headers } })) — أبسط ولا يمسّ الطلب.
  const claimedUserId = request.headers.get("x-user-id")?.trim()
  if (claimedUserId && claimedUserId !== session.userId) {
    return NextResponse.json({ error: "انتهت الجلسة أو تغيّر المستخدم — سجّل الدخول من جديد" }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  runtime: "nodejs",
  matcher: ["/api/:path*"],
}
