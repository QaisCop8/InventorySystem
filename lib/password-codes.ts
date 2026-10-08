import crypto from "crypto"
import { hashPassword } from "@/lib/auth"
import sql, { withTenantDb } from "@/lib/database"
import managementSql, { ensureManagementTables } from "@/lib/management-db"
import { sendMail } from "@/lib/email"

// رموز تعيين/استعادة كلمة المرور — مخزّنة بقاعدة الإدارة (هوية المستخدم موحّدة عبر الشركات). كلمة المرور
// الجديدة تُكتب بنفس تجزئة تسجيل الدخول (hashPassword) في حساب الإدارة وفي كل شركة مرتبط بها البريد.

export type PasswordCodePurpose = "reset" | "invite"
const MAX_ATTEMPTS = 5

let ensured: Promise<void> | null = null
function ensureTable() {
  if (!ensured) {
    ensured = (async () => {
      await ensureManagementTables()
      await managementSql`
        CREATE TABLE IF NOT EXISTS password_codes (
          id SERIAL PRIMARY KEY,
          email VARCHAR(150) NOT NULL,
          code_hash VARCHAR(128) NOT NULL,
          purpose VARCHAR(20) NOT NULL DEFAULT 'reset',
          tenant_db VARCHAR(100),
          attempts INTEGER NOT NULL DEFAULT 0,
          used BOOLEAN NOT NULL DEFAULT false,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      await managementSql`CREATE INDEX IF NOT EXISTS idx_password_codes_email ON password_codes (LOWER(email), used)`
    })().catch((error) => { ensured = null; throw error })
  }
  return ensured
}

const normalize = (email: string) => String(email || "").trim().toLowerCase()
const digest = (code: string) => crypto.createHash("sha256").update(String(code).trim()).digest("hex")
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")

/** هل البريد مسجّل (حساب إدارة، أو مستخدم نشط في قاعدة الشركة الحالية)؟ */
export async function emailIsRegistered(email: string, tenantDb?: string | null) {
  await ensureTable()
  const normalized = normalize(email)
  if ((await managementSql`SELECT 1 FROM users WHERE LOWER(email) = ${normalized} AND COALESCE(is_active, true) LIMIT 1`).length) return true
  if (!tenantDb) return false
  return withTenantDb(tenantDb, async () => (await sql`SELECT 1 FROM user_settings WHERE LOWER(TRIM(email)) = ${normalized} AND is_active = true LIMIT 1`).length > 0).catch(() => false)
}

/** ينشئ رمزاً من 6 أرقام (يلغي الرموز السابقة لنفس الغرض) ويُرسله بالبريد. يعيد sent=false إن تعذّر الإرسال. */
export async function issuePasswordCode(options: { email: string; purpose: PasswordCodePurpose; tenantDb?: string | null; fullName?: string; companyName?: string }) {
  await ensureTable()
  const email = normalize(options.email)
  const code = String(crypto.randomInt(100000, 1000000))
  const minutes = options.purpose === "invite" ? 72 * 60 : 15
  await managementSql`UPDATE password_codes SET used = true WHERE LOWER(email) = ${email} AND purpose = ${options.purpose} AND used = false`
  await managementSql`
    INSERT INTO password_codes (email, code_hash, purpose, tenant_db, expires_at)
    VALUES (${email}, ${digest(code)}, ${options.purpose}, ${options.tenantDb || null}, CURRENT_TIMESTAMP + (${minutes} * INTERVAL '1 minute'))`
  const link = appUrl() ? `${appUrl()}/management/login?set_password=1&email=${encodeURIComponent(email)}&code=${code}` : ""
  const greeting = options.fullName ? `مرحباً ${options.fullName}،` : "مرحباً،"
  const html = options.purpose === "invite"
    ? `<div dir="rtl" style="font-family:Arial,sans-serif"><p>${greeting}</p><p>تم إنشاء حساب لك في نظام ARAAK ERP${options.companyName ? ` لدى شركة <b>${options.companyName}</b>` : ""}.</p><p>لتعيين كلمة المرور الخاصة بك استخدم رمز التحقق التالي (صالح لمدة 72 ساعة):</p><p style="font-size:26px;font-weight:bold;letter-spacing:6px">${code}</p>${link ? `<p><a href="${link}">اضغط هنا لتعيين كلمة المرور</a></p>` : `<p>من صفحة تسجيل الدخول اختر "نسيت كلمة المرور؟" ثم أدخل بريدك وهذا الرمز.</p>`}</div>`
    : `<div dir="rtl" style="font-family:Arial,sans-serif"><p>${greeting}</p><p>رمز التحقق لاستعادة كلمة المرور (صالح لمدة 15 دقيقة):</p><p style="font-size:26px;font-weight:bold;letter-spacing:6px">${code}</p><p>إن لم تطلب استعادة كلمة المرور فتجاهل هذه الرسالة.</p></div>`
  const sent = await sendMail({ to: email, subject: options.purpose === "invite" ? "تعيين كلمة المرور لحسابك الجديد — ARAAK ERP" : "رمز استعادة كلمة المرور — ARAAK ERP", html })
  if (!sent) console.log(`[password-codes] email not sent; ${options.purpose} code for ${email} was generated (check SMTP settings)`)
  return { sent }
}

async function activeCode(email: string) {
  return (await managementSql`
    SELECT id, code_hash, attempts, purpose, tenant_db FROM password_codes
    WHERE LOWER(email) = ${normalize(email)} AND used = false AND expires_at > CURRENT_TIMESTAMP
    ORDER BY id DESC LIMIT 1`)[0]
}

type CodeCheck = { ok: true; row: any; error?: undefined } | { ok: false; error: string; row?: undefined }

/** يتحقق من الرمز (بحد أقصى 5 محاولات خاطئة). */
export async function verifyPasswordCode(email: string, code: string): Promise<CodeCheck> {
  await ensureTable()
  const row = await activeCode(email)
  if (!row) return { ok: false, error: "رمز التحقق غير صحيح أو منتهي الصلاحية" }
  if (Number(row.attempts) >= MAX_ATTEMPTS) return { ok: false, error: "تم تجاوز عدد المحاولات — اطلب رمزاً جديداً" }
  if (row.code_hash !== digest(code)) {
    await managementSql`UPDATE password_codes SET attempts = attempts + 1 WHERE id = ${row.id}`
    return { ok: false, error: "رمز التحقق غير صحيح" }
  }
  return { ok: true, row }
}

/** يغيّر كلمة المرور في حساب الإدارة وفي كل شركة مرتبطة (وقاعدة الشركة التي طُلب منها الرمز). */
export async function setPasswordWithCode(email: string, code: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const check = await verifyPasswordCode(email, code)
  if (!check.ok) return check
  if (String(newPassword || "").length < 6) return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }
  const normalized = normalize(email)
  const hash = await hashPassword(newPassword)
  await managementSql`UPDATE users SET password_hash = ${hash}, email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ${normalized}`
  const companies = await managementSql`
    SELECT DISTINCT c.db_name FROM users u JOIN user_company uc ON uc.user_id = u.id JOIN companies c ON c.id = uc.company_id
    WHERE LOWER(u.email) = ${normalized} AND c.db_name IS NOT NULL`
  const databases = new Set<string>(companies.map((row: any) => String(row.db_name)))
  if (check.row?.tenant_db) databases.add(String(check.row.tenant_db))
  for (const dbName of databases) {
    await withTenantDb(dbName, () => sql`UPDATE user_settings SET password_hash = ${hash}, updated_at = CURRENT_TIMESTAMP WHERE LOWER(TRIM(email)) = ${normalized}`)
      .catch((error) => console.error(`[password-codes] could not update ${dbName}`, error))
  }
  await managementSql`UPDATE password_codes SET used = true WHERE id = ${check.row!.id}`
  return { ok: true }
}

/** رسالة "تمت إضافتك لشركة" لمستخدم لديه حساب مسبقاً (يدخل بكلمة مروره الحالية). */
export async function sendAddedToCompanyEmail(email: string, fullName?: string, companyName?: string) {
  return sendMail({
    to: normalize(email),
    subject: "تمت إضافتك إلى شركة — ARAAK ERP",
    html: `<div dir="rtl" style="font-family:Arial,sans-serif"><p>${fullName ? `مرحباً ${fullName}،` : "مرحباً،"}</p><p>تمت إضافتك كمستخدم${companyName ? ` لدى شركة <b>${companyName}</b>` : ""} في نظام ARAAK ERP.</p><p>يمكنك الدخول بنفس بريدك وكلمة المرور الحالية لحسابك.</p></div>`,
  })
}
