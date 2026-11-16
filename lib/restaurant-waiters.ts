import crypto from "node:crypto"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensureNamedPermission } from "@/lib/permissions"
import { RESTAURANT_PERMISSION_CATEGORY, RESTAURANT_PERMISSIONS } from "@/lib/transaction-permission-definitions"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// النادل في المطاعم (2026-11-16) — على نمط أنظمة المطاعم (Foodics/Toast/Odoo):
//  • ملكية الطاولة: restaurant_orders_tbl.waiter_id = من فتحها. بلا صلاحية «العمل على طاولات النوادل الآخرين»
//    يعمل المستخدم على طاولاته فقط (يرى الكل). «تحويل الطاولة لنادل آخر» يغيّر المالك.
//  • تبديل المستخدم برمز PIN على جهاز مشترك: الجهاز مسجَّل بمستخدم، والنادل يدخل رمزه فيُصدر رمز عمل
//    (x-restaurant-waiter) تُنفَّذ به عمليات المطعم باسم النادل وصلاحياته — بلا جلسة دخول جديدة (جلسة جهاز واحد).
//  • طابور المطبخ: جهاز لا يملك خدمة الطباعة المحلية (جوال النادل) يرسل قسائم المطبخ/الحساب للخادم، وجهاز
//    الكاشير (شاشة المطعم المفتوحة مع خدمة الطباعة) يسحبها ويطبعها على طابعاتها.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const WAITER_HEADER = "x-restaurant-waiter"
const TOKEN_HOURS = 14
const PIN_MAX_FAILURES = 5
const PIN_LOCK_MINUTES = 15
const OWNERSHIP_MIGRATION = "restaurant-table-ownership-v1"

/** يُستدعى من ensureRestaurantTables (مرة لكل قاعدة لكل عملية) */
export async function ensureWaiterTables() {
  await sql`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS waiter_id VARCHAR(50)`
  await sql`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ`
  await sql`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS bill_requested_by VARCHAR(50)`
  await sql`UPDATE restaurant_orders_tbl SET waiter_id = opened_by WHERE waiter_id IS NULL AND status = 'open'`
  // مفتاح بحث الرمز (HMAC مربوط بالقاعدة) — فريد للشركة: الرمز وحده يحدد النادل على الجهاز المشترك
  await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS restaurant_pin_lookup VARCHAR(64)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_settings_restaurant_pin_uq ON user_settings (restaurant_pin_lookup) WHERE restaurant_pin_lookup IS NOT NULL`
  await sql`
    CREATE TABLE IF NOT EXISTS restaurant_waiter_tokens_tbl (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      device_user_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS restaurant_pin_attempts_tbl (
      id SERIAL PRIMARY KEY,
      device_user_id VARCHAR(50) NOT NULL,
      success BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS restaurant_kitchen_queue_tbl (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      location_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'kitchen',
      printer VARCHAR(200),
      title VARCHAR(200),
      document JSONB NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      claimed_by VARCHAR(100),
      claimed_at TIMESTAMPTZ,
      printed_at TIMESTAMPTZ,
      error TEXT,
      created_by VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS restaurant_kitchen_queue_pending_idx ON restaurant_kitchen_queue_tbl (branch_id, status, id)`
  await migrateOwnershipPermissions()
}

/**
 * ترحيل لمرة: كل من يملك «الدخول لشاشة المطعم» (مستخدم/دور، عام أو على فرع) يُمنح «العمل على طاولات النوادل الآخرين»
 * و«تحويل الطاولة لنادل آخر» — فلا يتقيّد الكاشير والمدير الحاليون بطاولاتهم. دور «نادل» مستثنى.
 */
async function migrateOwnershipPermissions() {
  await sql`CREATE TABLE IF NOT EXISTS permission_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  if ((await sql`SELECT 1 FROM permission_migrations WHERE name = ${OWNERSHIP_MIGRATION}`).length) return
  const accessId = await ensureNamedPermission(RESTAURANT_PERMISSIONS.access, RESTAURANT_PERMISSION_CATEGORY)
  for (const key of ["manageAllTables", "assignWaiter"] as const) {
    const targetId = await ensureNamedPermission(RESTAURANT_PERMISSIONS[key], RESTAURANT_PERMISSION_CATEGORY)
    await sql`INSERT INTO role_permissions (role_id, access_id, is_granted)
      SELECT rp.role_id, ${targetId}, true FROM role_permissions rp JOIN job_roles r ON r.id = rp.role_id
      WHERE rp.access_id = ${accessId} AND rp.is_granted AND LOWER(BTRIM(r.name)) <> 'نادل'
      ON CONFLICT DO NOTHING`
    await sql`INSERT INTO user_access (user_id, access_id, is_granted)
      SELECT ua.user_id, ${targetId}, true FROM user_access ua WHERE ua.access_id = ${accessId} AND ua.is_granted
      ON CONFLICT DO NOTHING`.catch(() => undefined)
    await sql`INSERT INTO role_branch_permissions (role_id, branch_id, access_id, is_granted)
      SELECT rb.role_id, rb.branch_id, ${targetId}, true FROM role_branch_permissions rb JOIN job_roles r ON r.id = rb.role_id
      WHERE rb.access_id = ${accessId} AND rb.is_granted AND LOWER(BTRIM(r.name)) <> 'نادل'
      ON CONFLICT DO NOTHING`.catch(() => undefined)
    await sql`INSERT INTO user_branch_permissions (user_id, branch_id, access_id, is_granted)
      SELECT ub.user_id, ub.branch_id, ${targetId}, true FROM user_branch_permissions ub WHERE ub.access_id = ${accessId} AND ub.is_granted
      ON CONFLICT DO NOTHING`.catch(() => undefined)
  }
  await sql`INSERT INTO permission_migrations (name) VALUES (${OWNERSHIP_MIGRATION}) ON CONFLICT DO NOTHING`
}

// ---------------- ملكية الطاولة ----------------

/** هل يعمل المستخدم على هذا الطلب: صاحبه، أو طلب بلا مالك، أو لديه «العمل على طاولات النوادل الآخرين» */
export function ownsOrder(order: { waiter_id?: unknown }, userId: string, manageAll: boolean) {
  return manageAll || !order?.waiter_id || String(order.waiter_id) === String(userId)
}

export async function waiterName(userId: unknown) {
  if (!userId) return ""
  const row = (await sql`SELECT COALESCE(NULLIF(full_name, ''), username) AS name FROM user_settings WHERE user_id::text = ${String(userId)} LIMIT 1`)[0] as any
  return String(row?.name || userId)
}

// ---------------- رمز PIN وتبديل النادل ----------------

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex")
export const validWaiterPin = (pin: string) => /^\d{4,6}$/.test(pin)

async function pinLookup(pin: string) {
  const db = await resolveCurrentDbName().catch(() => "")
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "noon-restaurant-pin"
  return crypto.createHmac("sha256", secret).update(`${db}:restaurant-pin:${pin}`).digest("hex")
}

/** يعيّن (أو يمسح بـ null) رمز PIN للمستخدم — الرمز فريد على مستوى الشركة */
export async function setWaiterPin(userId: string, pin: string | null) {
  if (pin === null) {
    await sql`UPDATE user_settings SET restaurant_pin_lookup = NULL WHERE user_id::text = ${userId}`
    return
  }
  if (!validWaiterPin(pin)) throw Object.assign(new Error("رمز PIN يجب أن يكون من 4 إلى 6 أرقام"), { status: 400 })
  const lookup = await pinLookup(pin)
  const taken = (await sql`SELECT 1 FROM user_settings WHERE restaurant_pin_lookup = ${lookup} AND user_id::text <> ${userId} LIMIT 1`)[0]
  if (taken) throw Object.assign(new Error("هذا الرمز مستخدم لموظف آخر — اختر رمزاً مختلفاً"), { status: 409 })
  await sql`UPDATE user_settings SET restaurant_pin_lookup = ${lookup} WHERE user_id::text = ${userId}`
}

export async function hasWaiterPin(userId: string) {
  return Boolean((await sql`SELECT 1 FROM user_settings WHERE user_id::text = ${userId} AND restaurant_pin_lookup IS NOT NULL LIMIT 1`)[0])
}

/** تبديل النادل على الجهاز: يتحقق من الرمز (مع قفل بعد 5 محاولات فاشلة خلال 15 دقيقة) ويُصدر رمز عمل */
export async function startWaiterSession(deviceUserId: string, pin: string) {
  const [{ failures }] = (await sql`
    SELECT COUNT(*)::int AS failures FROM restaurant_pin_attempts_tbl
    WHERE device_user_id = ${deviceUserId} AND NOT success AND created_at > NOW() - make_interval(mins => ${PIN_LOCK_MINUTES})
      AND created_at > COALESCE((SELECT MAX(created_at) FROM restaurant_pin_attempts_tbl WHERE device_user_id = ${deviceUserId} AND success), 'epoch')
  `) as any[]
  if (Number(failures) >= PIN_MAX_FAILURES) throw Object.assign(new Error(`محاولات خاطئة كثيرة — حاول بعد ${PIN_LOCK_MINUTES} دقيقة`), { status: 429 })
  const user = validWaiterPin(pin) ? (await sql`
    SELECT user_id::text AS user_id, COALESCE(NULLIF(full_name, ''), username) AS name, COALESCE(is_active, true) AS is_active
    FROM user_settings WHERE restaurant_pin_lookup = ${await pinLookup(pin)} LIMIT 1
  `)[0] as any : null
  await sql`INSERT INTO restaurant_pin_attempts_tbl (device_user_id, success) VALUES (${deviceUserId}, ${Boolean(user && user.is_active)})`
  if (!user) throw Object.assign(new Error("رمز PIN غير صحيح"), { status: 401 })
  if (!user.is_active) throw Object.assign(new Error("حساب الموظف موقوف"), { status: 403 })
  const token = crypto.randomBytes(24).toString("hex")
  await sql`INSERT INTO restaurant_waiter_tokens_tbl (token_hash, user_id, device_user_id, expires_at)
    VALUES (${sha256(token)}, ${String(user.user_id)}, ${deviceUserId}, NOW() + make_interval(hours => ${TOKEN_HOURS}))`
  await sql`DELETE FROM restaurant_waiter_tokens_tbl WHERE expires_at < NOW() - INTERVAL '1 day'`
  return { token, user: { id: String(user.user_id), name: String(user.name || user.user_id) } }
}

export async function endWaiterSession(token: string) {
  if (token) await sql`UPDATE restaurant_waiter_tokens_tbl SET revoked_at = NOW() WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL`
}

/** المستخدم الفعلي لعمليات المطعم: النادل صاحب رمز العمل (إن صدر من هذا الجهاز) وإلا مستخدم الجهاز */
export async function actingWaiter(token: string | null, deviceUserId: string): Promise<string | null> {
  if (!token || !/^[0-9a-f]{48}$/.test(token)) return null
  const row = (await sql`
    SELECT t.user_id FROM restaurant_waiter_tokens_tbl t
    JOIN user_settings us ON us.user_id::text = t.user_id AND COALESCE(us.is_active, true)
    WHERE t.token_hash = ${sha256(token)} AND t.device_user_id = ${deviceUserId} AND t.revoked_at IS NULL AND t.expires_at > NOW()
    LIMIT 1
  `)[0] as any
  return row ? String(row.user_id) : null
}

// ---------------- طابور المطبخ ----------------

export type QueuedTicket = { printer?: string | null; title?: string | null; document: unknown }

export async function enqueueTickets(input: { orderId: number; locationId: number; branchId: number; kind: "kitchen" | "bill"; tickets: QueuedTicket[]; userId: string }) {
  const tickets = input.tickets.filter((ticket) => ticket && typeof ticket.document === "object").slice(0, 30)
  for (const ticket of tickets) {
    const document = JSON.stringify(ticket.document)
    if (document.length > 200_000) throw Object.assign(new Error("القسيمة كبيرة جداً"), { status: 400 })
    await sql`INSERT INTO restaurant_kitchen_queue_tbl (order_id, location_id, branch_id, kind, printer, title, document, created_by)
      VALUES (${input.orderId}, ${input.locationId}, ${input.branchId}, ${input.kind}, ${String(ticket.printer || "").slice(0, 200) || null},
              ${String(ticket.title || "").slice(0, 200) || null}, ${document}::jsonb, ${input.userId})`
  }
  return tickets.length
}

/** جهاز طباعة يحجز قسائم فرعه المعلّقة (أو المحجوزة منذ أكثر من دقيقة ولم تُؤكَّد) — لا يطبعها جهازان */
export async function claimTickets(branchId: number, deviceKey: string, limit = 10) {
  return (await sql`
    WITH picked AS (
      SELECT id FROM restaurant_kitchen_queue_tbl
      WHERE branch_id = ${branchId} AND attempts < 5
        AND (status = 'pending' OR (status = 'claimed' AND claimed_at < NOW() - INTERVAL '60 seconds'))
        AND created_at > NOW() - INTERVAL '6 hours'
      ORDER BY id LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE restaurant_kitchen_queue_tbl q SET status = 'claimed', claimed_by = ${deviceKey.slice(0, 100)}, claimed_at = NOW(), attempts = q.attempts + 1
    FROM picked WHERE q.id = picked.id
    RETURNING q.id, q.order_id, q.location_id, q.kind, q.printer, q.title, q.document, q.created_at
  `) as any[]
}

export async function ackTickets(branchId: number, deviceKey: string, printed: number[], failed: { id: number; error: string }[]) {
  if (printed.length) {
    await sql`UPDATE restaurant_kitchen_queue_tbl SET status = 'printed', printed_at = NOW(), error = NULL
      WHERE id = ANY(${printed}::int[]) AND branch_id = ${branchId} AND claimed_by = ${deviceKey.slice(0, 100)}`
  }
  for (const row of failed) {
    // تُعاد للطابور (حتى 5 محاولات) — بعدها تبقى «فشلت» ظاهرة في لوحة الطاولات
    await sql`UPDATE restaurant_kitchen_queue_tbl SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END, error = ${String(row.error || "").slice(0, 500)}
      WHERE id = ${Number(row.id)} AND branch_id = ${branchId} AND claimed_by = ${deviceKey.slice(0, 100)}`
  }
}

/** قسائم معلّقة منذ أكثر من 45 ثانية (لا جهاز طباعة يعمل) أو فشلت — لتنبيه لوحة الطاولات */
export async function stuckTicketCount(branchId: number) {
  const row = (await sql`
    SELECT COUNT(*)::int AS count FROM restaurant_kitchen_queue_tbl
    WHERE branch_id = ${branchId} AND created_at > NOW() - INTERVAL '6 hours'
      AND ((status IN ('pending', 'claimed') AND created_at < NOW() - INTERVAL '45 seconds') OR status = 'failed')
  `)[0] as any
  return Number(row?.count || 0)
}
