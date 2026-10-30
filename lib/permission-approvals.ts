import crypto from "crypto"
import { headers } from "next/headers"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { sendMail } from "@/lib/email"
import { POS_CASHIER_PERMISSIONS, RESTAURANT_PERMISSIONS } from "@/lib/transaction-permission-definitions"

// موافقة لمرة على صلاحية غير ممنوحة (الكاشير والمطعم): المستخدم يطلب رمز تفعيل ⇐ يُرسل بالبريد إلى "ايميل مدير النظام"
// و"ايميل المسؤول" المعرّفين على نقطة البيع/الموقع ⇐ يُدخل الرمز ⇐ يحصل على رمز موافقة (token) صالح لدقائق لنفس
// الصلاحية، يُرسله المتصفح بترويسة x-permission-approval فيقبله فحص الصلاحية في الخادم (canUsePosCashierPermission /
// authorizeRestaurant / تجاوز نسبة الخصم) بدل الرفض.

export type ApprovalScope = "pos" | "restaurant"
export const APPROVAL_HEADER = "x-permission-approval"
// معرّف لكل طلب من المتصفح: الموافقة تُستهلك بأول طلب يستخدمها، وتبقى صالحة لفحوص نفس الطلب فقط (لمرة واحدة)
export const APPROVAL_REQUEST_HEADER = "x-approval-request"
const CODE_MINUTES = 10
const TOKEN_MINUTES = 10
const MAX_ATTEMPTS = 5

const SCOPES: Record<ApprovalScope, { table: string; label: string; names: Record<string, string> }> = {
  pos: { table: "pos_points_tbl", label: "نقطة البيع", names: POS_CASHIER_PERMISSIONS },
  restaurant: { table: "restaurant_locations_tbl", label: "موقع المطعم", names: RESTAURANT_PERMISSIONS },
}

const digest = (value: string) => crypto.createHash("sha256").update(String(value).trim()).digest("hex")
const validEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())

export function approvalPermissionName(scope: ApprovalScope, key: string) {
  return SCOPES[scope]?.names[key] || ""
}

/** جسم رد 403 موحّد: الرسالة + ما يلزم المتصفح لعرض نافذة طلب رمز التفعيل */
export function permissionRequiredBody(scope: ApprovalScope, key: string, error?: string) {
  const name = approvalPermissionName(scope, key)
  return { error: error || `لا توجد لديك صلاحية ${name}`, permission_required: { scope, key, name } }
}

const ensuredDbs = new Map<string, Promise<void>>()
async function ensureApprovalTable() {
  const db = await resolveCurrentDbName()
  let pending = ensuredDbs.get(db)
  if (!pending) {
    pending = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS permission_approvals_tbl (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(100) NOT NULL,
          scope VARCHAR(20) NOT NULL,
          scope_id INTEGER,
          permission_key VARCHAR(50) NOT NULL,
          code_hash VARCHAR(128) NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          expires_at TIMESTAMP NOT NULL,
          sent_to TEXT,
          verified_at TIMESTAMP,
          token_hash VARCHAR(128),
          token_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      await sql`CREATE INDEX IF NOT EXISTS permission_approvals_token_idx ON permission_approvals_tbl (token_hash)`
      await sql`ALTER TABLE permission_approvals_tbl ADD COLUMN IF NOT EXISTS used_request VARCHAR(64)`
      await sql`ALTER TABLE permission_approvals_tbl ADD COLUMN IF NOT EXISTS used_at TIMESTAMP`
      // من وافق (رمز المدير) وبيانات الطلب
      await sql`ALTER TABLE permission_approvals_tbl ADD COLUMN IF NOT EXISTS request_info JSONB`
    })()
    pending.catch(() => ensuredDbs.delete(db))
    ensuredDbs.set(db, pending)
  }
  await pending
}

/** ينشئ رمزاً من 6 أرقام ويرسله بالبريد لمدير النظام والمسؤول على نقطة البيع/الموقع. */
export async function requestPermissionApproval(input: { userId: string; userName: string; scope: ApprovalScope; scopeId: number; permission: string }) {
  const config = SCOPES[input.scope]
  if (!config) throw Object.assign(new Error("نوع الطلب غير صالح"), { status: 400 })
  const name = approvalPermissionName(input.scope, input.permission)
  if (!name) throw Object.assign(new Error("الصلاحية غير معروفة"), { status: 400 })
  await ensureApprovalTable()
  const place = (await sql.unsafe(`SELECT name, admin_email, manager_email FROM ${config.table} WHERE id = $1 LIMIT 1`, [Number(input.scopeId) || 0]))[0] as any
  if (!place) throw Object.assign(new Error(`${config.label} غير موجود`), { status: 404 })
  const recipients = [...new Set([place.admin_email, place.manager_email].map((value: unknown) => String(value || "").trim().toLowerCase()).filter(validEmail))]
  if (!recipients.length) throw Object.assign(new Error(`لم يُعرَّف ايميل مدير النظام أو ايميل المسؤول في تعريف ${config.label} "${place.name}"`), { status: 400 })

  const code = String(crypto.randomInt(100000, 1000000))
  // طلب جديد يُلغي الرموز السابقة غير المستخدمة لنفس المستخدم والصلاحية
  await sql`UPDATE permission_approvals_tbl SET expires_at = CURRENT_TIMESTAMP WHERE user_id = ${input.userId} AND scope = ${input.scope} AND permission_key = ${input.permission} AND verified_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  const row = (await sql`
    INSERT INTO permission_approvals_tbl (user_id, scope, scope_id, permission_key, code_hash, expires_at, sent_to)
    VALUES (${input.userId}, ${input.scope}, ${Number(input.scopeId)}, ${input.permission}, ${digest(code)}, CURRENT_TIMESTAMP + (${CODE_MINUTES} * INTERVAL '1 minute'), ${recipients.join(", ")})
    RETURNING id`)[0] as any

  const when = new Date().toLocaleString("en-GB", { hour12: false })
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif"><p>مرحباً،</p><p>طلب المستخدم <b>${escapeHtml(input.userName)}</b> تفعيل صلاحية <b>${escapeHtml(name)}</b> على ${config.label} <b>${escapeHtml(String(place.name || ""))}</b> (${when}).</p><p>إن كنت توافق، أعطه رمز التفعيل التالي (صالح لمدة ${CODE_MINUTES} دقائق ولمرة واحدة):</p><p style="font-size:26px;font-weight:bold;letter-spacing:6px">${code}</p><p>إن لم توافق فتجاهل هذه الرسالة.</p></div>`
  const results = await Promise.all(recipients.map((to) => sendMail({ to, subject: `رمز تفعيل صلاحية "${name}" — Noon ERP`, html })))
  if (!results.some(Boolean)) {
    console.log(`[permission-approvals] email not sent; code for approval ${row.id} was generated (check email settings)`)
    throw Object.assign(new Error("تعذر إرسال البريد — تحقق من إعدادات البريد في الخادم"), { status: 502 })
  }
  return { id: Number(row.id), sentTo: recipients.filter((_, index) => results[index]).map(maskEmail), minutes: CODE_MINUTES }
}

// ---------------- رمز المدير (PIN) على شاشة الكاشير ----------------
// مدير النظام/المسؤول يكتب رمزه الشخصي (4-8 أرقام) على جهاز المستخدم — لا رسائل ولا روابط فلا يرى المستخدم شيئاً.
// الرموز محفوظة مجزّأة (scrypt + ملح) في تعريف نقطة البيع/الموقع: admin_pin_hash / manager_pin_hash.
const PIN_MAX_FAILURES = 5
const PIN_LOCK_MINUTES = 15

export function hashManagerPin(pin: string) {
  const salt = crypto.randomBytes(16).toString("hex")
  return `scrypt:${salt}:${crypto.scryptSync(pin, salt, 32).toString("hex")}`
}

function pinMatches(pin: string, stored: unknown) {
  const [kind, salt, hash] = String(stored || "").split(":")
  if (kind !== "scrypt" || !salt || !hash) return false
  const actual = crypto.scryptSync(pin, salt, 32)
  const expected = Buffer.from(hash, "hex")
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected)
}

export const validManagerPin = (pin: string) => /^\d{4,8}$/.test(pin)

/** لا تُرسل تجزئة رموز PIN للمتصفح أبداً — فقط هل الرمز معرّف */
export function stripPinHashes<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== "object") return row
  const { admin_pin_hash, manager_pin_hash, ...rest } = row as any
  return { ...rest, has_admin_pin: Boolean(admin_pin_hash), has_manager_pin: Boolean(manager_pin_hash) } as T
}

/**
 * تغييرات رموز PIN من نموذج التعريف: admin_pin/manager_pin (جديد ⇐ يُجزّأ)، clear_admin_pin/clear_manager_pin (حذف).
 * فارغ = إبقاء الرمز الحالي. يعيد error عند رمز غير صالح.
 */
export function managerPinChanges(data: any): { error?: string; admin?: string | null; manager?: string | null } {
  const result: { error?: string; admin?: string | null; manager?: string | null } = {}
  for (const [key, label] of [["admin", "PIN مدير النظام"], ["manager", "PIN المسؤول"]] as const) {
    const pin = String(data?.[`${key}_pin`] ?? "").trim()
    if (pin) {
      if (!validManagerPin(pin)) return { error: `${label} يجب أن يكون من 4 إلى 8 أرقام` }
      result[key] = hashManagerPin(pin)
    } else if (data?.[`clear_${key}_pin`] === true) {
      result[key] = null
    }
  }
  return result
}

/** يتحقق من رمز مدير النظام أو المسؤول ويعيد رمز موافقة لمرة واحدة (نفس ما يعيده التحقق من رمز البريد). */
export async function verifyManagerPin(input: { userId: string; userName: string; scope: ApprovalScope; scopeId: number; permission: string; pin: string }) {
  const config = SCOPES[input.scope]
  if (!config) throw Object.assign(new Error("نوع الطلب غير صالح"), { status: 400 })
  const name = approvalPermissionName(input.scope, input.permission)
  if (!name) throw Object.assign(new Error("الصلاحية غير معروفة"), { status: 400 })
  await ensureApprovalTable()
  const place = (await sql.unsafe(`SELECT name, admin_pin_hash, manager_pin_hash FROM ${config.table} WHERE id = $1 LIMIT 1`, [Number(input.scopeId) || 0]))[0] as any
  if (!place) throw Object.assign(new Error(`${config.label} غير موجود`), { status: 404 })
  if (!place.admin_pin_hash && !place.manager_pin_hash) throw Object.assign(new Error(`لم يُعرَّف رمز PIN لمدير النظام أو المسؤول في تعريف ${config.label} "${place.name}"`), { status: 400 })
  // قفل بعد 5 محاولات خاطئة خلال 15 دقيقة لنفس المستخدم (منع التخمين)
  const failures = Number(((await sql`
    SELECT COUNT(*)::int AS n FROM permission_approvals_tbl
    WHERE user_id = ${input.userId} AND sent_to = 'pin-failed' AND created_at > CURRENT_TIMESTAMP - (${PIN_LOCK_MINUTES} * INTERVAL '1 minute')`)[0] as any)?.n || 0)
  if (failures >= PIN_MAX_FAILURES) throw Object.assign(new Error(`تم تجاوز عدد المحاولات — حاول بعد ${PIN_LOCK_MINUTES} دقيقة`), { status: 429 })
  const pin = String(input.pin || "").trim()
  const approver = validManagerPin(pin) ? (pinMatches(pin, place.admin_pin_hash) ? "مدير النظام" : pinMatches(pin, place.manager_pin_hash) ? "المسؤول" : "") : ""
  if (!approver) {
    await sql`
      INSERT INTO permission_approvals_tbl (user_id, scope, scope_id, permission_key, code_hash, expires_at, sent_to)
      VALUES (${input.userId}, ${input.scope}, ${Number(input.scopeId)}, ${input.permission}, '', CURRENT_TIMESTAMP, 'pin-failed')`
    const left = PIN_MAX_FAILURES - failures - 1
    throw Object.assign(new Error(left > 0 ? `رمز المدير غير صحيح — متبقٍ ${left} محاولة` : `رمز المدير غير صحيح — تم قفل الإدخال ${PIN_LOCK_MINUTES} دقيقة`), { status: 400 })
  }
  // موافقة مسجّلة (من وافق ومتى) — رمز الموافقة لمرة واحدة كما في رمز البريد
  const token = crypto.randomBytes(24).toString("hex")
  await sql`
    INSERT INTO permission_approvals_tbl (user_id, scope, scope_id, permission_key, code_hash, expires_at, sent_to, verified_at, token_hash, token_expires_at, request_info)
    VALUES (${input.userId}, ${input.scope}, ${Number(input.scopeId)}, ${input.permission}, '', CURRENT_TIMESTAMP, ${`pin: ${approver}`}, CURRENT_TIMESTAMP,
            ${digest(token)}, CURRENT_TIMESTAMP + (${TOKEN_MINUTES} * INTERVAL '1 minute'), ${JSON.stringify({ user_name: input.userName, permission_name: name, approver })}::jsonb)`
  return { token, scope: input.scope, permission: input.permission, minutes: TOKEN_MINUTES, approver }
}

/** يتحقق من الرمز (5 محاولات) ويعيد رمز موافقة صالحاً لـ TOKEN_MINUTES دقائق. */
export async function verifyPermissionApproval(input: { userId: string; id: number; code: string }) {
  await ensureApprovalTable()
  const row = (await sql`
    SELECT id, code_hash, attempts, scope, permission_key FROM permission_approvals_tbl
    WHERE id = ${Number(input.id) || 0} AND user_id = ${input.userId} AND verified_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1`)[0] as any
  if (!row) throw Object.assign(new Error("رمز التفعيل منتهي الصلاحية — اطلب رمزاً جديداً"), { status: 400 })
  if (Number(row.attempts) >= MAX_ATTEMPTS) throw Object.assign(new Error("تم تجاوز عدد المحاولات — اطلب رمزاً جديداً"), { status: 400 })
  if (row.code_hash !== digest(String(input.code || "").replace(/\D/g, ""))) {
    await sql`UPDATE permission_approvals_tbl SET attempts = attempts + 1 WHERE id = ${row.id}`
    throw Object.assign(new Error("رمز التفعيل غير صحيح"), { status: 400 })
  }
  const token = crypto.randomBytes(24).toString("hex")
  await sql`
    UPDATE permission_approvals_tbl SET verified_at = CURRENT_TIMESTAMP, token_hash = ${digest(token)},
      token_expires_at = CURRENT_TIMESTAMP + (${TOKEN_MINUTES} * INTERVAL '1 minute')
    WHERE id = ${row.id}`
  return { token, scope: row.scope as ApprovalScope, permission: String(row.permission_key), minutes: TOKEN_MINUTES }
}

/** الرموز (من المتصفح) التي ما زالت صالحة ولم تُستهلك — قبل فتح نافذة الإجراء دون طلب رمز جديد */
export async function unusedApprovalTokens(userId: string, list: unknown): Promise<string[]> {
  const tokens = (Array.isArray(list) ? list : []).map((token) => String(token || "").trim()).filter((token) => /^[a-f0-9]{48}$/.test(token)).slice(0, 20)
  if (!tokens.length) return []
  await ensureApprovalTable()
  const rows = (await sql`
    SELECT token_hash FROM permission_approvals_tbl
    WHERE token_hash = ANY(${tokens.map(digest)}::text[]) AND user_id = ${String(userId)} AND used_request IS NULL AND token_expires_at > CURRENT_TIMESTAMP`) as Array<{ token_hash: string }>
  const valid = new Set(rows.map((row) => row.token_hash))
  return tokens.filter((token) => valid.has(digest(token)))
}

/**
 * هل يحمل الطلب الحالي موافقة سارية لهذه الصلاحية؟ (ترويسة x-permission-approval: رموز مفصولة بفواصل)
 * لمرة واحدة: أول طلب يستخدم الموافقة يستهلكها (used_request)؛ فحوص أخرى داخل نفس الطلب تنجح، وأي طلب لاحق يُرفض
 * فتظهر نافذة رمز التفعيل من جديد في كل مرة.
 */
export async function hasPermissionApproval(userId: string, scope: ApprovalScope, permission: string, headerValue?: string | null, requestIdValue?: string | null): Promise<boolean> {
  let raw = headerValue ?? null
  let requestId = requestIdValue ?? null
  if (raw == null || requestId == null) {
    try {
      const store = await headers()
      raw = raw ?? store.get(APPROVAL_HEADER)
      requestId = requestId ?? store.get(APPROVAL_REQUEST_HEADER)
    } catch { /* خارج سياق طلب */ }
  }
  // بلا معرّف طلب صالح ⇐ معرّف عشوائي فيُستهلك بهذا الفحص وحده
  const usedBy = /^[A-Za-z0-9-]{8,64}$/.test(String(requestId || "")) ? String(requestId) : crypto.randomUUID()
  const tokens = String(raw || "").split(",").map((token) => token.trim()).filter((token) => /^[a-f0-9]{48}$/.test(token)).slice(0, 20)
  if (!tokens.length || !userId) return false
  try {
    await ensureApprovalTable()
    // استهلاك ذرّي: يُعلَّم الصف بمعرّف هذا الطلب إن لم يُستخدم بعد، أو يُقبل إن كان هذا الطلب نفسه من استخدمه
    const rows = await sql`
      UPDATE permission_approvals_tbl SET used_request = COALESCE(used_request, ${usedBy}), used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
      WHERE id = (
        SELECT id FROM permission_approvals_tbl
        WHERE token_hash = ANY(${tokens.map(digest)}::text[]) AND user_id = ${String(userId)} AND scope = ${scope}
          AND permission_key = ${permission} AND token_expires_at > CURRENT_TIMESTAMP
          AND (used_request IS NULL OR used_request = ${usedBy})
        ORDER BY id DESC LIMIT 1
      ) AND (used_request IS NULL OR used_request = ${usedBy})
      RETURNING id`
    return rows.length > 0
  } catch {
    return false
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string)
}
