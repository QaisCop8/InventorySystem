// أسماء كوكيز جلسة الشركة — مشتركة بين middleware (lib/api-session-gate.ts) ومسارات API (lib/tenant-auth.ts)، بلا قاعدة بيانات.
//
// عدة مستخدمين على نفس المتصفح (تبويب لكل مستخدم): كوكي لكل مستخدم في كل شركة tenant_session_<db>__u<id>، وكل تبويب
// يرسل معرّف مستخدمه (x-user-id من sessionStorage الخاصة به — components/auth/auth-context.tsx) فتُختار جلسته هو.
// tenant_session_<db> (آخر دخول على الشركة) والعامة tenant_session احتياط لطلبات بلا x-user-id وللجلسات القديمة.

export const SESSION_COOKIE = "tenant_session"
export const sessionCookieFor = (dbName: string) => `${SESSION_COOKIE}_${dbName}`
export const userSessionCookieFor = (dbName: string, userId: string | number) => `${SESSION_COOKIE}_${dbName}__u${userId}`

const TOKEN_PATTERN = /^[a-f0-9]{16,255}$/i
const USER_ID_PATTERN = /^\d{1,12}$/

/** رموز الجلسة المرشّحة لهذا الطلب بالترتيب: جلسة مستخدم التبويب، ثم آخر دخول على الشركة، ثم العامة. */
export function sessionTokenCandidates(readCookie: (name: string) => string | undefined, dbName: string, userIdHint?: string | null): string[] {
  const userId = String(userIdHint || "").trim()
  const names = [
    ...(USER_ID_PATTERN.test(userId) ? [userSessionCookieFor(dbName, userId)] : []),
    sessionCookieFor(dbName),
    SESSION_COOKIE,
  ]
  const tokens: string[] = []
  for (const name of names) {
    const token = readCookie(name)
    if (token && TOKEN_PATTERN.test(token) && !tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

/** كل كوكيز جلسات هذه الشركة في المتصفح (لكل المستخدمين) — لتمييز «هذا الجهاز» عن جهاز آخر. */
export function isCompanySessionCookie(name: string, dbName: string) {
  return name === SESSION_COOKIE || name === sessionCookieFor(dbName) || name.startsWith(`${sessionCookieFor(dbName)}__u`)
}
