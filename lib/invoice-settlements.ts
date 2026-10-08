import sql, { getTenantPool, resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables, hasEffectivePermission } from "@/lib/permissions"

// تسديد الفواتير: ربط فاتورة مبيعات (12) بسندات تسديدها — سند قبض (4)، إشعار دائن (6)، مرتجع مبيعات (16)
// لنفس العميل. المبلغ يُحفظ بعملة الفاتورة (amount) وبعملة سند التسديد (payment_amount) محوَّلاً بسعر
// صرف كل سند، فيُحسب المتبقي على الفاتورة والرصيد غير المخصَّص من السند كلٌّ بعملته.

export const SALES_INVOICE = 12
export const PAYMENT_TYPES = [4, 6, 16] as const
export const PAYMENT_TYPE_LABELS: Record<number, string> = { 4: "سند قبض", 6: "إشعار دائن", 16: "مرتجع مبيعات", 12: "فاتورة مبيعات" }
export const SETTLEMENT_PERMISSION = "تسديد الفواتير"
const EPSILON = 0.005
const round = (value: number) => Math.round(value * 10000) / 10000

let ensured: Promise<void> | null = null
let ensuredDb = ""
export async function ensureSettlementTables() {
  const dbName = await resolveCurrentDbName()
  if (!ensured || ensuredDb !== dbName) {
    ensuredDb = dbName
    ensured = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS invoice_settlements (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
          payment_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE,
          amount NUMERIC(18,4) NOT NULL,
          payment_amount NUMERIC(18,4) NOT NULL,
          note TEXT,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      await sql`CREATE INDEX IF NOT EXISTS idx_invoice_settlements_invoice ON invoice_settlements(invoice_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_invoice_settlements_payment ON invoice_settlements(payment_id)`
      // صلاحية "تسديد الفواتير" (تُمنح افتراضياً لدور مدير) — تُفحص على فرع الفاتورة.
      await ensurePermissionTables(dbName)
      const category = (await sql`INSERT INTO access_category (name) SELECT 'الحركات' WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = 'الحركات') RETURNING id`)[0]
        || (await sql`SELECT id FROM access_category WHERE name = 'الحركات' ORDER BY id LIMIT 1`)[0]
      const access = (await sql`INSERT INTO access_list (name, category_id) SELECT ${SETTLEMENT_PERMISSION}, ${category.id} WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${SETTLEMENT_PERMISSION}) RETURNING id`)[0]
        || (await sql`SELECT id FROM access_list WHERE name = ${SETTLEMENT_PERMISSION} LIMIT 1`)[0]
      if (access?.id) await sql`INSERT INTO role_permissions (role_id, access_id, is_granted) SELECT id, ${access.id}, TRUE FROM job_roles WHERE LOWER(name) = LOWER('مدير') ON CONFLICT (role_id, access_id) DO NOTHING`
    })().catch((error) => { ensured = null; throw error })
  }
  return ensured
}

export async function canSettle(userId: string, branchId: number | null) {
  const access = (await sql`SELECT id FROM access_list WHERE name = ${SETTLEMENT_PERMISSION} LIMIT 1`)[0]
  return access ? hasEffectivePermission(userId, Number(access.id), branchId) : false
}

// العميل في سند القبض هو "على حساب" (to_account_id)، وفي باقي السندات account_id.
const PARTY_SQL = `CASE WHEN vh.vch_type = 4 THEN COALESCE(vh.to_account_id, vh.account_id) ELSE vh.account_id END`

const VOUCHER_SELECT = `
  SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.due_date::date::text AS due_date,
    COALESCE(vh.amount, 0)::float AS amount, COALESCE(NULLIF(vh.rate, 0), 1)::float AS rate, vh.currency_id,
    cur.currency_name, ${PARTY_SQL} AS party_id, acc.name AS party_name, acc.code AS party_code,
    COALESCE(vh.status, 1) AS status, vh.branch_id,
    COALESCE((SELECT SUM(s.amount) FROM invoice_settlements s JOIN voucher_header_tbl p ON p.id = s.payment_id WHERE s.invoice_id = vh.id AND COALESCE(p.status, 1) <> 3), 0)::float AS settled_as_invoice,
    COALESCE((SELECT SUM(s.payment_amount) FROM invoice_settlements s JOIN voucher_header_tbl i ON i.id = s.invoice_id WHERE s.payment_id = vh.id AND COALESCE(i.status, 1) <> 3), 0)::float AS settled_as_payment
  FROM voucher_header_tbl vh
  LEFT JOIN currency cur ON cur.id = vh.currency_id
  LEFT JOIN account_tbl acc ON acc.id = ${PARTY_SQL}`

async function loadVoucher(id: number) {
  const pool = await getTenantPool()
  return (await pool.query(`${VOUCHER_SELECT} WHERE vh.id = $1 AND COALESCE(vh.status, 1) <> 3`, [id])).rows[0] || null
}

const withBalances = (row: any) => {
  const isInvoice = Number(row.vch_type) === SALES_INVOICE
  const settled = isInvoice ? Number(row.settled_as_invoice) : Number(row.settled_as_payment)
  return { ...row, settled: round(settled), remaining: round(Math.max(0, Number(row.amount) - settled)) }
}

/** شاشة التسديد: الرأس (المبلغ/المسدّد/المتبقي) + المرتبط حالياً + المرشّحون للربط من الطرف الآخر. */
export async function getSettlementView(voucherId: number) {
  await ensureSettlementTables()
  const voucher = await loadVoucher(voucherId)
  if (!voucher) throw new Error("السند غير موجود")
  const type = Number(voucher.vch_type)
  if (type !== SALES_INVOICE && !PAYMENT_TYPES.includes(type as any)) throw new Error("هذا النوع من السندات لا يدعم تسديد الفواتير")
  const header = withBalances(voucher)
  const isInvoice = type === SALES_INVOICE
  const pool = await getTenantPool()
  const linked = (await pool.query(`
    SELECT s.id, s.amount::float AS amount, s.payment_amount::float AS payment_amount, s.created_at,
      other.id AS voucher_id, other.vch_type, other.vch_code, other.vch_date::date::text AS vch_date, COALESCE(other.amount, 0)::float AS voucher_amount, cur.currency_name
    FROM invoice_settlements s
    JOIN voucher_header_tbl other ON other.id = ${isInvoice ? "s.payment_id" : "s.invoice_id"}
    LEFT JOIN currency cur ON cur.id = other.currency_id
    WHERE ${isInvoice ? "s.invoice_id" : "s.payment_id"} = $1 AND COALESCE(other.status, 1) <> 3
    ORDER BY other.vch_date, other.id`, [voucherId])).rows
  let candidates: any[] = []
  if (header.party_id) {
    const rows = (await pool.query(`${VOUCHER_SELECT}
      WHERE ${PARTY_SQL} = $1 AND COALESCE(vh.status, 1) = 2 AND vh.id <> $2
        AND vh.vch_type = ANY($3::int[])
      ORDER BY vh.vch_date, vh.id`, [header.party_id, voucherId, isInvoice ? [...PAYMENT_TYPES] : [SALES_INVOICE]])).rows
    candidates = rows.map(withBalances).filter((row: any) => row.remaining > EPSILON).map((row: any) => {
      // المتبقي على المرشّح بعملة السند الحالي (للتوزيع والإدخال).
      const remainingInCurrent = round(row.remaining * Number(row.rate) / Number(header.rate))
      const overdueDays = row.due_date ? Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86_400_000) : null
      return { ...row, type_label: PAYMENT_TYPE_LABELS[Number(row.vch_type)] || "", remaining_in_current: remainingInCurrent, overdue_days: overdueDays && overdueDays > 0 ? overdueDays : 0 }
    })
  }
  return {
    voucher: { ...header, type_label: PAYMENT_TYPE_LABELS[type] || "", mode: isInvoice ? "invoice" : "payment", posted: Number(header.status) === 2 },
    linked: linked.map((row: any) => ({ ...row, type_label: PAYMENT_TYPE_LABELS[Number(row.vch_type)] || "" })),
    candidates,
  }
}

/**
 * يربط مبلغاً (بعملة السند الحالي `voucherId`) مع سند من الطرف الآخر. يتحقق ضمن معاملة مقفلة من:
 * نفس العميل، ترحيل السندين، وألا يتجاوز المبلغ المتبقي على الفاتورة ولا الرصيد غير المخصص من سند التسديد.
 */
export async function allocateSettlement(input: { voucherId: number; otherId: number; amount: number; userId: number }) {
  await ensureSettlementTables()
  const pool = await getTenantPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const locked = await client.query(`SELECT id FROM voucher_header_tbl WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [[input.voucherId, input.otherId]])
    if (locked.rowCount !== 2) throw new Error("أحد السندين غير موجود")
    const current = (await client.query(`${VOUCHER_SELECT} WHERE vh.id = $1`, [input.voucherId])).rows[0]
    const other = (await client.query(`${VOUCHER_SELECT} WHERE vh.id = $1`, [input.otherId])).rows[0]
    const invoice = Number(current.vch_type) === SALES_INVOICE ? current : other
    const payment = invoice === current ? other : current
    if (Number(invoice.vch_type) !== SALES_INVOICE || !PAYMENT_TYPES.includes(Number(payment.vch_type) as any)) throw new Error("يجب ربط فاتورة مبيعات بسند قبض أو إشعار دائن أو مرتجع مبيعات")
    if (Number(invoice.status) !== 2 || Number(payment.status) !== 2) throw new Error("يجب أن يكون السندان مرحّلين")
    if (!invoice.party_id || Number(invoice.party_id) !== Number(payment.party_id)) throw new Error("يجب أن يكون السندان لنفس العميل")
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("مبلغ التسديد يجب أن يكون أكبر من صفر")
    // المبلغ مُدخل بعملة السند الحالي — يُحوَّل لعملة الفاتورة ولعملة سند التسديد.
    const base = amount * Number(current.rate)
    const invoiceAmount = round(base / Number(invoice.rate))
    const paymentAmount = round(base / Number(payment.rate))
    const invoiceRemaining = Number(invoice.amount) - Number(invoice.settled_as_invoice)
    const paymentRemaining = Number(payment.amount) - Number(payment.settled_as_payment)
    if (invoiceAmount > invoiceRemaining + EPSILON) throw new Error(`المبلغ أكبر من المتبقي على الفاتورة ${invoice.vch_code} (${round(invoiceRemaining)})`)
    if (paymentAmount > paymentRemaining + EPSILON) throw new Error(`المبلغ أكبر من الرصيد غير المخصص في ${PAYMENT_TYPE_LABELS[Number(payment.vch_type)]} ${payment.vch_code} (${round(paymentRemaining)})`)
    const row = (await client.query(
      `INSERT INTO invoice_settlements (invoice_id, payment_id, amount, payment_amount, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [invoice.id, payment.id, Math.min(invoiceAmount, round(invoiceRemaining)), Math.min(paymentAmount, round(paymentRemaining)), input.userId || null],
    )).rows[0]
    await client.query("COMMIT")
    return row
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally { client.release() }
}

/** توزيع تلقائي للمتبقي على المرشّحين: fifo = الأقدم أولاً، lifo = الأحدث أولاً. */
export async function autoDistribute(input: { voucherId: number; order: "fifo" | "lifo"; userId: number }) {
  const view = await getSettlementView(input.voucherId)
  let remaining = view.voucher.remaining
  const candidates = input.order === "lifo" ? [...view.candidates].reverse() : view.candidates
  let created = 0
  for (const candidate of candidates) {
    if (remaining <= EPSILON) break
    const amount = round(Math.min(remaining, candidate.remaining_in_current))
    if (amount <= EPSILON) continue
    await allocateSettlement({ voucherId: input.voucherId, otherId: Number(candidate.id), amount, userId: input.userId })
    remaining = round(remaining - amount)
    created += 1
  }
  return { created }
}

export async function removeSettlement(settlementId: number) {
  await ensureSettlementTables()
  const rows = await sql`DELETE FROM invoice_settlements WHERE id = ${settlementId} RETURNING id`
  if (!rows.length) throw new Error("الربط غير موجود")
}

export async function settlementBranch(voucherId: number) {
  return Number((await sql`SELECT branch_id FROM voucher_header_tbl WHERE id = ${voucherId}`)[0]?.branch_id || 0) || null
}
