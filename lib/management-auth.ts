import { cookies } from "next/headers"
import { shouldUseSecureCookies } from "./cookie-security"
import crypto from "crypto"
import sql, { ensureManagementTables } from "./management-db"
import { hashPassword } from "./auth"

export interface ManagementUser {
  id: number
  full_name: string
  email: string
  email_verified: boolean
  is_platform_admin: boolean
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_COOKIE = "mgmt_session"

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function signupManagementUser(data: { fullName: string; email: string; password: string }) {
  await ensureManagementTables()

  const email = data.email.trim().toLowerCase()
  if (!data.fullName?.trim()) return { success: false, error: "الاسم الكامل مطلوب" }
  if (!email) return { success: false, error: "البريد الإلكتروني مطلوب" }
  if (!data.password || data.password.length < 6) return { success: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`
  if (existing.length > 0) return { success: false, error: "البريد الإلكتروني مستخدَم مسبقاً" }

  const passwordHash = await hashPassword(data.password)

  // البريد الإلكتروني يُعتبر مؤكَّداً فور التسجيل (بلا خطوة تحقق عبر رابط بريدي) — يستطيع
  // المستخدم تسجيل الدخول مباشرة بعد إنشاء الحساب.
  const inserted = await sql`
    INSERT INTO users (full_name, email, password_hash, email_verified)
    VALUES (${data.fullName.trim()}, ${email}, ${passwordHash}, true)
    RETURNING id, full_name, email
  `
  const user = inserted[0]

  return { success: true, user }
}

export async function verifyManagementEmail(token: string) {
  await ensureManagementTables()
  if (!token) return { success: false, error: "رمز التحقق مطلوب" }

  const result = await sql`
    UPDATE users SET email_verified = true, email_verification_token = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE email_verification_token = ${token}
    RETURNING id, email
  `
  if (result.length === 0) return { success: false, error: "رمز التحقق غير صالح" }
  return { success: true }
}

export async function loginManagementUser(data: { email: string; password: string }) {
  await ensureManagementTables()

  const email = data.email?.trim().toLowerCase()
  if (!email || !data.password) return { success: false, error: "البريد الإلكتروني وكلمة المرور مطلوبان" }

  const rows = await sql`
    SELECT id, full_name, email, password_hash, email_verified, is_platform_admin, is_active
    FROM users WHERE email = ${email}
  `
  if (rows.length === 0) return { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }

  const user = rows[0]
  const passwordHash = await hashPassword(data.password)
  if (passwordHash !== user.password_hash) {
    return { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }
  }

  if (!user.email_verified) {
    return { success: false, error: "يرجى تأكيد بريدك الإلكتروني أولاً قبل تسجيل الدخول" }
  }

  if (!user.is_active) {
    return { success: false, error: "تم إيقاف هذا الحساب — يرجى التواصل مع إدارة النظام" }
  }

  const sessionToken = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
  await sql`
    INSERT INTO management_sessions (user_id, session_token, expires_at)
    VALUES (${user.id}, ${sessionToken}, ${expiresAt})
  `

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  })

  const { password_hash, ...userWithoutPassword } = user
  return { success: true, user: userWithoutPassword as ManagementUser }
}

export async function getManagementSession(): Promise<ManagementUser | null> {
  try {
    await ensureManagementTables()
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
    if (!sessionToken) return null

    const sessionRows = await sql`SELECT user_id, expires_at FROM management_sessions WHERE session_token = ${sessionToken}`
    if (sessionRows.length === 0) return null

    const session = sessionRows[0]
    if (new Date(session.expires_at) < new Date()) {
      await sql`DELETE FROM management_sessions WHERE session_token = ${sessionToken}`
      cookieStore.delete(SESSION_COOKIE)
      return null
    }

    const userRows = await sql`
      SELECT id, full_name, email, email_verified, is_platform_admin, is_active
      FROM users WHERE id = ${session.user_id}
    `
    if (userRows.length === 0) return null
    const user = userRows[0]
    if (!user.is_active) {
      await sql`DELETE FROM management_sessions WHERE session_token = ${sessionToken}`
      cookieStore.delete(SESSION_COOKIE)
      return null
    }
    return user as ManagementUser
  } catch (error) {
    console.error("[management-auth] getManagementSession error:", error)
    return null
  }
}

export async function logoutManagementUser(): Promise<void> {
  try {
    await ensureManagementTables()
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value
    if (sessionToken) {
      await sql`DELETE FROM management_sessions WHERE session_token = ${sessionToken}`
    }
    cookieStore.delete(SESSION_COOKIE)
  } catch (error) {
    console.error("[management-auth] logout error:", error)
  }
}
