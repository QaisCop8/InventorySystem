import type { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getSessionUser } from "@/lib/tenant-auth"

// أرشفة السندات: كل إدخال/تعديل/ترحيل/إلغاء/حذف/طباعة/نسخ لأي سند أو طلبية يُسجَّل هنا مع المستخدم والوقت،
// ومع نسخة كاملة من السند (رأس + أصناف + قيد) قبل التعديل أو الحذف (before_data) وبعده (after_data).
// التسجيل لا يُفشل أي عملية أبداً — أي خطأ فيه يُطبع فقط.

export type AuditSource = "voucher" | "order" | "purchase_order"
export type VoucherAuditAction =
  | "create" | "update" | "post" | "cancel" | "delete"
  | "print" | "print_original" | "print_copy" | "print_review"
  | "clone" | "whatsapp" | "pdf"

export const VOUCHER_AUDIT_ACTION_LABELS: Record<VoucherAuditAction, string> = {
  create: "إدخال السند",
  update: "تعديل السند",
  post: "ترحيل السند",
  cancel: "إلغاء السند",
  delete: "حذف السند",
  print: "طباعة",
  print_original: "طباعة نسخة أصلية",
  print_copy: "طباعة نسخة",
  print_review: "طباعة نسخة للتدقيق",
  clone: "نسخ السند",
  whatsapp: "إرسال واتساب",
  pdf: "حفظ PDF",
}

export const ensureVoucherAuditTables = () => runSchemaOnce("lib/voucher-audit.ts#ensureVoucherAuditTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS voucher_audit_log_tbl (
      id BIGSERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL DEFAULT 'voucher',
      voucher_id INTEGER,
      vch_type INTEGER,
      vch_code VARCHAR(80),
      vch_date DATE,
      branch_id INTEGER,
      amount NUMERIC(18, 3),
      action VARCHAR(30) NOT NULL,
      user_id VARCHAR(80),
      user_name VARCHAR(200),
      before_data JSONB,
      after_data JSONB,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_audit_created ON voucher_audit_log_tbl (created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_audit_voucher ON voucher_audit_log_tbl (source, voucher_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_audit_code ON voucher_audit_log_tbl (vch_type, vch_code)`
})

export type VoucherSnapshot = { header: Record<string, any>; items: any[]; journal?: any[] }

/** نسخة كاملة من السند كما هو الآن في قاعدة البيانات (null إن لم يوجد). */
export async function snapshotVoucher(source: AuditSource, id: number): Promise<VoucherSnapshot | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  if (source === "order") {
    const header = (await sql`SELECT * FROM orders WHERE id = ${id}`)[0]
    if (!header) return null
    const items = await sql`SELECT * FROM order_items WHERE order_id = ${id} ORDER BY id`
    return { header, items }
  }
  if (source === "purchase_order") {
    const header = (await sql`SELECT * FROM purchase_orders WHERE id = ${id}`)[0]
    if (!header) return null
    const items = await sql`SELECT * FROM purchase_order_items WHERE purchase_order_id = ${id} ORDER BY id`
    return { header, items }
  }
  const header = (await sql`SELECT * FROM voucher_header_tbl WHERE id = ${id}`)[0]
  if (!header) return null
  const items = await sql`SELECT * FROM voucher_items_tbl WHERE voucher_id = ${id} ORDER BY id`
  const journal = await sql`
    SELECT vjd.*, a.code AS account_code, a.name AS account_name
    FROM voucher_journal_detail_tbl vjd
    LEFT JOIN account_tbl a ON a.id = vjd.account_id
    WHERE vjd.voucher_id = ${id}
    ORDER BY vjd.order_no, vjd.id
  `
  return { header, items, journal }
}

const headerFacts = (source: AuditSource, snapshot: VoucherSnapshot | null) => {
  const header = snapshot?.header
  if (!header) return { vch_type: null, vch_code: null, vch_date: null, branch_id: null, amount: null }
  if (source === "order") {
    return { vch_type: 1, vch_code: header.order_number ?? null, vch_date: header.order_date ?? null, branch_id: header.branch_id ?? null, amount: header.total_amount ?? null }
  }
  if (source === "purchase_order") {
    return { vch_type: 2, vch_code: header.order_number ?? null, vch_date: header.order_date ?? null, branch_id: header.branch_id ?? null, amount: header.total_amount ?? null }
  }
  return { vch_type: header.vch_type ?? null, vch_code: header.vch_code ?? null, vch_date: header.vch_date ?? null, branch_id: header.branch_id ?? null, amount: header.amount ?? null }
}

async function auditUser(request: NextRequest | null) {
  if (!request) return { user_id: null as string | null, user_name: null as string | null }
  const session = await getSessionUser(request).catch(() => null)
  if (session) return { user_id: String(session.user_id), user_name: session.full_name || session.username || null }
  const headerUser = String(request.headers.get("x-user-id") || "").trim()
  if (!headerUser) return { user_id: null, user_name: null }
  const row = (await sql`SELECT full_name, username FROM user_settings WHERE user_id::text = ${headerUser} LIMIT 1`.catch(() => []))[0]
  return { user_id: headerUser, user_name: row?.full_name || row?.username || null }
}

export async function logVoucherEvent(request: NextRequest | null, event: {
  source?: AuditSource
  action: VoucherAuditAction
  voucherId?: number | null
  before?: VoucherSnapshot | null
  after?: VoucherSnapshot | null
  details?: Record<string, unknown> | null
  // للأحداث القادمة من الواجهة (طباعة/نسخ): رأس السند لاستخراج الرقم/التاريخ/الفرع فقط دون حفظ نسخة منه
  header?: Record<string, any> | null
  vchType?: number | null
  vchCode?: string | null
}) {
  try {
    await ensureVoucherAuditTables()
    const source = event.source || "voucher"
    const facts = headerFacts(source, event.after || event.before || (event.header ? { header: event.header, items: [] } : null))
    const user = await auditUser(request)
    await sql`
      INSERT INTO voucher_audit_log_tbl (
        source, voucher_id, vch_type, vch_code, vch_date, branch_id, amount, action,
        user_id, user_name, before_data, after_data, details
      ) VALUES (
        ${source}, ${event.voucherId ?? null}, ${facts.vch_type ?? event.vchType ?? null}, ${facts.vch_code ?? event.vchCode ?? null},
        ${facts.vch_date}, ${facts.branch_id}, ${facts.amount}, ${event.action},
        ${user.user_id}, ${user.user_name},
        ${event.before ? JSON.stringify(event.before) : null}::jsonb,
        ${event.after ? JSON.stringify(event.after) : null}::jsonb,
        ${event.details ? JSON.stringify(event.details) : null}::jsonb
      )
    `
  } catch (error) {
    console.error("[voucher-audit] failed to log event", event.action, error)
  }
}

// حقول تتغير مع كل حفظ أو مع الترحيل/الطباعة نفسها — لا تُعدّ "تعديلاً" على محتوى السند
const VOLATILE_KEYS = new Set([
  "status", "vch_status", "is_printed", "printed", "printed_count", "last_update_date", "updated_at",
  "update_user", "approved", "warehouses_printed_at", "id", "journal_id", "created_at",
])
const stripVolatile = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !VOLATILE_KEYS.has(key)).map(([key, inner]) => [key, stripVolatile(inner)]))
  }
  return value instanceof Date ? value.toISOString() : value
}
const contentChanged = (before: VoucherSnapshot | null, after: VoucherSnapshot | null) =>
  JSON.stringify(stripVolatile(before)) !== JSON.stringify(stripVolatile(after))

const statusOf = (source: AuditSource, snapshot: VoucherSnapshot | null) => {
  if (!snapshot) return null
  if (source === "voucher") return Number(snapshot.header.status)
  if (source === "order") return snapshot.header.deleted ? 3 : null
  return null
}

async function readJson(request: NextRequest) {
  try {
    const text = await request.clone().text()
    return text ? JSON.parse(text) : {}
  } catch {
    return {}
  }
}

async function routeId(args: unknown[]) {
  const context = args[0] as { params?: unknown } | undefined
  if (!context?.params) return null
  const params = (await context.params) as Record<string, string> | undefined
  const id = Number(params?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * يلفّ معالج مسار حفظ/حذف سند ليؤرشف العملية: نسخة قبل (للتعديل/الحذف) ونسخة بعد، ونوع العملية
 * (إدخال/تعديل/ترحيل/إلغاء/حذف) مستنتجاً من الحالة قبل وبعد. فشل المعالج = لا تسجيل.
 */
export function withVoucherAudit<A extends unknown[], R extends Response>(
  handler: (request: NextRequest, ...args: A) => Promise<R>,
  options: { source?: AuditSource; kind: "create" | "update" | "delete" | "save"; idFrom?: (body: any, url: URL) => number | null },
): (request: NextRequest, ...args: A) => Promise<R> {
  const source = options.source || "voucher"
  return async (request: NextRequest, ...args: A) => {
    let body: any = {}
    let before: VoucherSnapshot | null = null
    let targetId: number | null = null
    try {
      if (request.method !== "DELETE" && request.method !== "GET") body = await readJson(request)
      const url = new URL(request.url)
      targetId = options.idFrom?.(body, url)
        ?? (await routeId(args))
        ?? (Number(body?.id || body?.orderData?.id || url.searchParams.get("id")) || null)
      if (targetId && options.kind !== "create") {
        await ensureVoucherAuditTables()
        before = await snapshotVoucher(source, targetId)
      }
    } catch (error) {
      console.error("[voucher-audit] before snapshot failed", error)
    }

    const response = await handler(request, ...args)
    if (!response.ok) return response

    try {
      const result: any = await response.clone().json().catch(() => null)
      if (result?.duplicate) return response
      const details: Record<string, unknown> = {}
      if (Number(body?.pos_point_id) > 0) details.channel = "pos"
      if (body?.action) details.request_action = body.action

      if (options.kind === "delete") {
        if (before) await logVoucherEvent(request, { source, action: "delete", voucherId: targetId, before, details })
        return response
      }

      const savedId = Number(result?.id || result?.data?.id || result?.order?.id || targetId) || null
      const after = savedId ? await snapshotVoucher(source, savedId) : null
      if (!before) {
        await logVoucherEvent(request, { source, action: "create", voucherId: savedId, after, details })
        if (statusOf(source, after) === 2) await logVoucherEvent(request, { source, action: "post", voucherId: savedId, after, details })
        return response
      }

      const previousStatus = statusOf(source, before)
      const nextStatus = statusOf(source, after)
      if (nextStatus === 3 && previousStatus !== 3) {
        await logVoucherEvent(request, { source, action: "cancel", voucherId: savedId, before, after, details })
        return response
      }
      const changed = contentChanged(before, after)
      const posted = nextStatus === 2 && previousStatus !== 2
      if (changed || !posted) await logVoucherEvent(request, { source, action: "update", voucherId: savedId, before, after, details })
      if (posted) await logVoucherEvent(request, { source, action: "post", voucherId: savedId, before: changed ? null : before, after, details })
    } catch (error) {
      console.error("[voucher-audit] logging failed", error)
    }
    return response
  }
}
