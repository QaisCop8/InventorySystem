import sql, { isPortalTenantDb, withTenantDb } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { reportAmountSql } from "@/lib/report-currency"
import { getSystemSettings } from "@/lib/system-settings"

// بوابة العملاء: رابط خاص لكل عميل (بلا اسم مستخدم/كلمة مرور) يعرض كشف حسابه ويرفع إشعار تحويل بنكي.
// الرابط = base64url(قاعدة الشركة) + "." + سر عشوائي 32 بايت؛ يُخزَّن في القاعدة بصمة SHA-256 للسر فقط، فلا يمكن
// استرجاع الرابط لاحقاً — يُعرض مرة واحدة عند الإنشاء، وإنشاء رابط جديد يلغي السابق.

export const PORTAL_MAX_PROOF_BYTES = 4 * 1024 * 1024
export const PORTAL_PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]

export async function ensurePortalTables() { return runSchemaOnce("lib/customer-portal.ts#ensurePortalTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_portal_links_tbl (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      last_access_at TIMESTAMP,
      access_count INTEGER NOT NULL DEFAULT 0
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_portal_links_account ON customer_portal_links_tbl(account_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS customer_portal_payments_tbl (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL,
      link_id INTEGER,
      amount NUMERIC(18,2) NOT NULL,
      currency_id INTEGER NOT NULL,
      rate NUMERIC(18,8) NOT NULL DEFAULT 1,
      transfer_date DATE NOT NULL,
      reference VARCHAR(100),
      payer_name VARCHAR(150),
      bank_name VARCHAR(150),
      note TEXT,
      proof_data BYTEA,
      proof_mime VARCHAR(100),
      proof_name VARCHAR(200),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reviewed_by VARCHAR(100),
      reviewed_at TIMESTAMP,
      review_note TEXT,
      receipt_voucher_id INTEGER
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_portal_payments_status ON customer_portal_payments_tbl(status, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_customer_portal_payments_account ON customer_portal_payments_tbl(account_id, created_at DESC)`
}) }

const base64url = (text: string) => Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromBase64url = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function newPortalSecret() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const portalToken = (dbName: string, secret: string) => `${base64url(dbName)}.${secret}`

export function parsePortalToken(token: string): { dbName: string; secret: string } | null {
  const match = /^([A-Za-z0-9_-]{2,120})\.([0-9a-f]{64})$/.exec(String(token || ""))
  if (!match) return null
  const dbName = fromBase64url(match[1])
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) return null
  return { dbName, secret: match[2] }
}

export type PortalLink = { id: number; account_id: number }

export class PortalAccessError extends Error {}

/** ينفّذ fn على قاعدة شركة الرابط بعد التحقق من صلاحية الرابط (غير ملغى وغير منتهٍ). */
export async function withPortalLink<T>(token: string, fn: (link: PortalLink) => Promise<T>): Promise<T> {
  const parsed = parsePortalToken(token)
  if (!parsed || !(await isPortalTenantDb(parsed.dbName))) throw new PortalAccessError("الرابط غير صالح")
  return withTenantDb(parsed.dbName, async () => {
    await ensurePortalTables()
    const hash = await sha256Hex(parsed.secret)
    const [link] = await sql`
      UPDATE customer_portal_links_tbl SET last_access_at=NOW(), access_count=access_count+1
      WHERE token_hash=${hash} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW())
      RETURNING id, account_id`
    if (!link) throw new PortalAccessError("الرابط غير صالح أو انتهت صلاحيته — اطلب رابطاً جديداً من الشركة")
    return fn({ id: Number(link.id), account_id: Number(link.account_id) })
  })
}

export async function portalCompany() {
  const settings = await getSystemSettings()
  const text = (key: string) => String(settings[key] ?? "")
  return { name: text("company_name"), phone: text("company_phone"), email: text("company_email"), address: text("company_address"), logo: text("company_logo") }
}

const validDate = (value: string | null | undefined, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)

const VOUCHER_TYPE_NAME = `CASE vh.vch_type
  WHEN 4 THEN 'سند قبض' WHEN 5 THEN 'سند صرف' WHEN 6 THEN 'إشعار دائن' WHEN 7 THEN 'إشعار مدين'
  WHEN 12 THEN 'فاتورة مبيعات' WHEN 13 THEN 'إرسالية مبيعات' WHEN 16 THEN 'مرتجع مبيعات'
  WHEN 17 THEN 'فاتورة مشتريات' WHEN 19 THEN 'مرتجع مشتريات' ELSE 'قيد' END`

/** كشف حساب العميل بعملة حسابه (أو عملة الأساس) — الحركات المرحلة وغير الملغاة فقط. */
export async function portalStatement(accountId: number, fromInput?: string | null, toInput?: string | null) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultFrom = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const from = validDate(fromInput, defaultFrom)
  const to = validDate(toInput, today)
  const [account] = await sql`
    SELECT a.id, a.code, a.name, a.currency_id,
      (SELECT c.mobile1 FROM customers c WHERE c.account_id=a.id AND COALESCE(c.isdeleted,false)=false ORDER BY c.id DESC LIMIT 1) mobile
    FROM account_tbl a WHERE a.id=${accountId} AND COALESCE(a.status,1)<>3`
  if (!account) throw new PortalAccessError("الحساب غير متاح")
  const currencies = await sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id`
  const baseId = Number(currencies[0]?.id || 1)
  const targetId = currencies.some((row: any) => Number(row.id) === Number(account.currency_id)) ? Number(account.currency_id) : baseId
  const target = currencies.find((row: any) => Number(row.id) === targetId)
  const amount = reportAmountSql(targetId, baseId)

  const [openingRow] = await sql`
    SELECT COALESCE(SUM(CASE WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE -${sql.unsafe(amount)} END),0) opening
    FROM voucher_journal_detail_tbl vjd JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id
    WHERE vjd.account_id=${accountId} AND vh.status=2 AND vh.vch_date<${from}::date`
  const rows = await sql`
    SELECT vh.id voucher_id, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.vch_type, ${sql.unsafe(VOUCHER_TYPE_NAME)} type_name,
      NULLIF(COALESCE(NULLIF(vjd.note,''), vh.note),'') note,
      CASE WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE 0 END debit,
      CASE WHEN vjd.credit_debit=2 THEN ${sql.unsafe(amount)} ELSE 0 END credit
    FROM voucher_journal_detail_tbl vjd JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id
    WHERE vjd.account_id=${accountId} AND vh.status=2
      AND vh.vch_date>=${from}::date AND vh.vch_date<(${to}::date + INTERVAL '1 day')
    ORDER BY vh.vch_date, vh.id, vjd.order_no, vjd.id
    LIMIT 2000`
  const opening = Number(openingRow?.opening || 0)
  let balance = opening
  const lines = rows.map((row: any) => {
    const debit = Math.round(Number(row.debit || 0) * 100) / 100
    const credit = Math.round(Number(row.credit || 0) * 100) / 100
    balance += debit - credit
    return { voucher_id: Number(row.voucher_id), code: String(row.vch_code || ""), date: String(row.vch_date), type: Number(row.vch_type), type_name: String(row.type_name), note: row.note ? String(row.note) : "", debit, credit, balance: Math.round(balance * 100) / 100 }
  })
  const [current] = await sql`
    SELECT COALESCE(SUM(CASE WHEN vjd.credit_debit=1 THEN ${sql.unsafe(amount)} ELSE -${sql.unsafe(amount)} END),0) balance
    FROM voucher_journal_detail_tbl vjd JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id
    WHERE vjd.account_id=${accountId} AND vh.status=2`
  return {
    account: { id: Number(account.id), code: String(account.code || ""), name: String(account.name || ""), mobile: account.mobile ? String(account.mobile) : "" },
    currency: { id: targetId, code: String(target?.currency_code || ""), name: String(target?.currency_name || "") },
    currencies: currencies.map((row: any) => ({ id: Number(row.id), code: String(row.currency_code || ""), name: String(row.currency_name || "") })),
    from, to,
    opening: Math.round(opening * 100) / 100,
    lines,
    totals: { debit: Math.round(lines.reduce((sum: number, line: any) => sum + line.debit, 0) * 100) / 100, credit: Math.round(lines.reduce((sum: number, line: any) => sum + line.credit, 0) * 100) / 100 },
    balance: Math.round(Number(current?.balance || 0) * 100) / 100,
  }
}

export async function exchangeRateFor(currencyId: number, date: string) {
  const [row] = await sql`
    SELECT COALESCE((SELECT er.exchange_rate FROM exchange_rates er WHERE er.currency_id=c.id AND er.rate_date::date<=${date}::date
      AND COALESCE(er.is_active,true) AND er.exchange_rate>0 ORDER BY er.rate_date DESC, er.id DESC LIMIT 1),1) rate
    FROM currency c WHERE c.id=${currencyId} AND COALESCE(c.is_active,true)`
  return row ? Number(row.rate) || 1 : null
}

export const PORTAL_STATUS_LABELS: Record<string, string> = { pending: "بانتظار المراجعة", approved: "مقبولة", rejected: "مرفوضة" }
