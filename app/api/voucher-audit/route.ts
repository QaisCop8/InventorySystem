import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureVoucherAuditTables, logVoucherEvent, VOUCHER_AUDIT_ACTION_LABELS, type AuditSource, type VoucherAuditAction } from "@/lib/voucher-audit"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"

const REPORT_SECTION = "voucher-audit-report"
const CLIENT_ACTIONS = new Set<VoucherAuditAction>(["print", "print_original", "print_copy", "print_review", "clone", "whatsapp", "pdf"])
const SOURCES = new Set<AuditSource>(["voucher", "order", "purchase_order"])

// معرّفات رأس السند ⇐ جدول الاسم (للعرض فقط؛ أي فشل استعلام يُتجاهل فيبقى الرقم)
const NAME_SOURCES: Array<{ keys: string[]; query: (ids: number[]) => Promise<any[]> }> = [
  { keys: ["branch_id"], query: (ids) => sql`SELECT id, branch_name AS name FROM branches WHERE id = ANY(${ids}::int[])` },
  { keys: ["currency_id"], query: (ids) => sql`SELECT id, COALESCE(NULLIF(currency_name, ''), currency_code) AS name FROM currency WHERE id = ANY(${ids}::int[])` },
  { keys: ["store_id", "to_store_id", "warehouse_id", "to_warehouse_id"], query: (ids) => sql`SELECT id, warehouse_name AS name FROM warehouses WHERE id = ANY(${ids}::int[])` },
  { keys: ["vch_book_id"], query: (ids) => sql`SELECT id, name FROM voucher_books_tbl WHERE id = ANY(${ids}::int[])` },
  { keys: ["account_id", "customer_id", "supplier_id", "to_account_id"], query: (ids) => sql`SELECT id, CONCAT_WS(' - ', code, name) AS name FROM account_tbl WHERE id = ANY(${ids}::int[])` },
  { keys: ["salesman_id"], query: (ids) => sql`SELECT id, name FROM salesmen WHERE id = ANY(${ids}::int[])` },
]
async function headerNames(headers: Array<Record<string, any> | null | undefined>) {
  const names: Record<string, string> = {}
  await Promise.all(NAME_SOURCES.map(async (source) => {
    const ids = [...new Set(headers.flatMap((header) => source.keys.map((key) => Number(header?.[key]))).filter((id) => Number.isInteger(id) && id > 0))]
    if (!ids.length) return
    try {
      const rows = await source.query(ids)
      for (const row of rows) for (const key of source.keys) names[`${key}:${row.id}`] = String(row.name || "")
    } catch { /* جدول/عمود غير موجود: يبقى الرقم */ }
  }))
  return names
}

// GET: قائمة تقرير ارشفة السندات (بدون النسخ الكاملة) — أو ?id= لسطر واحد مع النسخة قبل/بعد
export async function GET(request: NextRequest) {
  try {
    const denied = await reportAccessDenied(request, [REPORT_SECTION])
    if (denied) return denied
    await ensureVoucherAuditTables()
    const params = request.nextUrl.searchParams

    const id = Number(params.get("id") || 0)
    if (id > 0) {
      const row = (await sql`
        SELECT l.*, vt.name AS vch_type_name, b.branch_name
        FROM voucher_audit_log_tbl l
        LEFT JOIN voucher_types_tbl vt ON vt.id = l.vch_type
        LEFT JOIN branches b ON b.id = l.branch_id
        WHERE l.id = ${id}
      `)[0]
      if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
      // أسماء المعرّفات في رأس السند (الفرع/العملة/المستودع/الدفتر/الحسابات/المندوب) بدل الأرقام: names["branch_id:1"] = "الفرع الرئيسي"
      return NextResponse.json({ ...row, names: await headerNames([row.before_data?.header, row.after_data?.header]) })
    }

    const from = params.get("from") || null
    const to = params.get("to") || null
    const action = params.get("action") || ""
    const vchType = Number(params.get("vch_type") || 0) || null
    const userId = params.get("user_id") || ""
    const branchId = Number(params.get("branch_id") || 0) || null
    const voucherId = Number(params.get("voucher_id") || 0) || null
    const source = params.get("source") || ""
    const search = (params.get("q") || "").trim()
    const limit = Math.min(Math.max(Number(params.get("limit") || 500), 1), 3000)

    const rows = await sql`
      SELECT l.id, l.source, l.voucher_id, l.vch_type, l.vch_code, l.vch_date, l.branch_id, l.amount, l.action,
             l.user_id, l.user_name, l.details, l.created_at,
             (l.before_data IS NOT NULL) AS has_before, (l.after_data IS NOT NULL) AS has_after,
             vt.name AS vch_type_name, b.branch_name
      FROM voucher_audit_log_tbl l
      LEFT JOIN voucher_types_tbl vt ON vt.id = l.vch_type
      LEFT JOIN branches b ON b.id = l.branch_id
      WHERE (${from}::date IS NULL OR l.created_at >= ${from}::date)
        AND (${to}::date IS NULL OR l.created_at < ${to}::date + 1)
        AND (${action} = '' OR l.action = ${action} OR (${action} = 'print_any' AND l.action LIKE 'print%'))
        AND (${vchType}::int IS NULL OR l.vch_type = ${vchType})
        AND (${userId} = '' OR l.user_id = ${userId})
        AND (${branchId}::int IS NULL OR l.branch_id = ${branchId})
        AND (${voucherId}::int IS NULL OR l.voucher_id = ${voucherId})
        AND (${source} = '' OR l.source = ${source})
        AND (${search} = '' OR l.vch_code ILIKE ${"%" + search + "%"} OR l.user_name ILIKE ${"%" + search + "%"})
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${limit}
    `
    const users = await sql`
      SELECT DISTINCT user_id, user_name FROM voucher_audit_log_tbl
      WHERE user_id IS NOT NULL ORDER BY user_name NULLS LAST LIMIT 500
    `
    return NextResponse.json({ rows, users, actions: VOUCHER_AUDIT_ACTION_LABELS })
  } catch (error) {
    console.error("[voucher-audit] GET failed", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل أرشيف السندات" }, { status: 500 })
  }
}

// POST: أحداث الواجهة (طباعة نسخة أصلية/نسخة/للتدقيق، نسخ السند، واتساب/PDF)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || "") as VoucherAuditAction
    if (!CLIENT_ACTIONS.has(action)) return NextResponse.json({ error: "نوع الحدث غير صالح" }, { status: 400 })
    const vchType = Number(body.vch_type || 0) || null
    const vchCode = String(body.vch_code || "").trim().slice(0, 80) || null
    const source: AuditSource = SOURCES.has(body.source) ? body.source : vchType === 1 ? "order" : vchType === 2 ? "purchase_order" : "voucher"
    let voucherId = Number(body.voucher_id || 0) || null

    let header: Record<string, any> | null = null
    if (source === "voucher") {
      header = voucherId
        ? (await sql`SELECT id, vch_type, vch_code, vch_date, branch_id, amount FROM voucher_header_tbl WHERE id = ${voucherId}`)[0] || null
        : vchType && vchCode
          ? (await sql`SELECT id, vch_type, vch_code, vch_date, branch_id, amount FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${vchCode} ORDER BY id DESC LIMIT 1`)[0] || null
          : null
    } else if (source === "order") {
      header = voucherId
        ? (await sql`SELECT id, order_number, order_date, branch_id, total_amount FROM orders WHERE id = ${voucherId}`)[0] || null
        : vchCode ? (await sql`SELECT id, order_number, order_date, branch_id, total_amount FROM orders WHERE order_number = ${vchCode} ORDER BY id DESC LIMIT 1`)[0] || null : null
    } else {
      header = voucherId
        ? (await sql`SELECT id, order_number, order_date, total_amount FROM purchase_orders WHERE id = ${voucherId}`)[0] || null
        : vchCode ? (await sql`SELECT id, order_number, order_date, total_amount FROM purchase_orders WHERE order_number = ${vchCode} ORDER BY id DESC LIMIT 1`)[0] || null : null
    }
    voucherId = header ? Number(header.id) : voucherId

    const details: Record<string, unknown> = {}
    if (body.copy_label) details.copy_label = String(body.copy_label).slice(0, 60)
    if (body.phone) details.phone = String(body.phone).slice(0, 30)
    if (body.channel) details.channel = String(body.channel).slice(0, 30)
    if (body.note) details.note = String(body.note).slice(0, 300)

    await logVoucherEvent(request, { source, action, voucherId, header, vchType, vchCode, details })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[voucher-audit] POST failed", error)
    return NextResponse.json({ error: "تعذر تسجيل الحدث" }, { status: 500 })
  }
}
