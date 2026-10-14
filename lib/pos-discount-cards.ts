import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// بطاقات الخصم لنقطة البيع: بطاقة مرتبطة بعميل (حساب)، صالحة بين تاريخين، بنسبة خصم على الفاتورة وشروط:
// حد أدنى لمبلغ الفاتورة، حد أقصى لمبلغ الخصم، حد أقصى لعدد مرات الاستخدام، وفرع محدد (اختياري).
// الاستخدام يُحسب من فواتير الكاشير الفعّالة نفسها (voucher_header_tbl.discount_card_id) — حذف/تعديل الفاتورة يُعيد
// الاستخدام تلقائياً بلا جدول استخدام منفصل قد يفقد تزامنه.
export type DiscountCard = {
  id: number
  card_number: string
  account_id: number
  customer_name: string
  start_date: string
  end_date: string
  discount_percent: number
  min_invoice_amount: number
  max_discount_amount: number
  max_uses: number
  branch_id: number | null
  branch_name?: string | null
  status: number
  notes: string
  used_count: number
}

export async function ensureDiscountCardTables() { return runSchemaOnce("lib/pos-discount-cards.ts#ensureDiscountCardTables", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS pos_discount_cards_tbl (
      id SERIAL PRIMARY KEY,
      card_number VARCHAR(40) NOT NULL,
      account_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      discount_percent NUMERIC(7,3) NOT NULL DEFAULT 0,
      min_invoice_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      max_discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 0,
      branch_id INTEGER,
      status INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (discount_percent > 0 AND discount_percent <= 100),
      CHECK (end_date >= start_date)
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_discount_cards_number ON pos_discount_cards_tbl (LOWER(BTRIM(card_number)))`
  await sql`CREATE INDEX IF NOT EXISTS idx_pos_discount_cards_account ON pos_discount_cards_tbl (account_id)`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_card_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS discount_card_amount NUMERIC(18,2)`
  await sql`CREATE INDEX IF NOT EXISTS idx_voucher_header_discount_card ON voucher_header_tbl (discount_card_id) WHERE discount_card_id IS NOT NULL`
}) }

const CARD_SELECT = sql`
  SELECT c.id, c.card_number, c.account_id, a.name AS customer_name, a.code AS customer_code,
         to_char(c.start_date, 'YYYY-MM-DD') AS start_date, to_char(c.end_date, 'YYYY-MM-DD') AS end_date,
         c.discount_percent::float8 AS discount_percent, c.min_invoice_amount::float8 AS min_invoice_amount,
         c.max_discount_amount::float8 AS max_discount_amount, c.max_uses, c.branch_id, b.branch_name, c.status, COALESCE(c.notes, '') AS notes,
         (SELECT COUNT(*)::int FROM voucher_header_tbl v WHERE v.discount_card_id = c.id AND COALESCE(v.status, 1) <> 3) AS used_count
  FROM pos_discount_cards_tbl c
  LEFT JOIN account_tbl a ON a.id = c.account_id
  LEFT JOIN branches b ON b.id = c.branch_id
`

export async function listDiscountCards(): Promise<DiscountCard[]> {
  await ensureDiscountCardTables()
  return await sql`${CARD_SELECT} ORDER BY c.id DESC` as DiscountCard[]
}

export async function findDiscountCard(by: { id?: number; cardNumber?: string; accountId?: number }): Promise<DiscountCard[]> {
  await ensureDiscountCardTables()
  if (by.id) return await sql`${CARD_SELECT} WHERE c.id = ${by.id}` as DiscountCard[]
  if (by.cardNumber) return await sql`${CARD_SELECT} WHERE LOWER(BTRIM(c.card_number)) = LOWER(BTRIM(${by.cardNumber}))` as DiscountCard[]
  if (by.accountId) return await sql`${CARD_SELECT} WHERE c.account_id = ${by.accountId} ORDER BY c.end_date DESC, c.id DESC` as DiscountCard[]
  return []
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** أسباب عدم صلاحية البطاقة لهذه الفاتورة (فارغة = صالحة) — نفس الفحص في الكاشير وعند الحفظ في الخادم */
export function discountCardProblem(card: DiscountCard, context: { accountId?: number | null; branchId?: number | null; date: string; invoiceAmount?: number }): string | null {
  if (Number(card.status) !== 1) return `بطاقة الخصم ${card.card_number} موقوفة`
  if (context.date < card.start_date) return `بطاقة الخصم ${card.card_number} تبدأ بتاريخ ${card.start_date}`
  if (context.date > card.end_date) return `بطاقة الخصم ${card.card_number} انتهت بتاريخ ${card.end_date}`
  if (context.accountId !== undefined && Number(context.accountId || 0) !== Number(card.account_id)) return `بطاقة الخصم ${card.card_number} خاصة بالعميل ${card.customer_name}`
  if (card.branch_id && context.branchId && Number(card.branch_id) !== Number(context.branchId)) return `بطاقة الخصم ${card.card_number} غير صالحة في هذا الفرع (${card.branch_name || card.branch_id})`
  if (Number(card.max_uses) > 0 && Number(card.used_count) >= Number(card.max_uses)) return `تم استنفاد عدد مرات استخدام بطاقة الخصم ${card.card_number} (${card.max_uses})`
  if (context.invoiceAmount !== undefined && Number(card.min_invoice_amount) > 0 && round2(context.invoiceAmount) < Number(card.min_invoice_amount))
    return `مبلغ الفاتورة يجب أن يزيد عن ${Number(card.min_invoice_amount).toFixed(2)} لاستخدام بطاقة الخصم`
  return null
}

/** مبلغ خصم البطاقة على مبلغ الفاتورة (بعد الخصومات الأخرى) مع سقف الخصم */
export function discountCardAmount(card: DiscountCard, invoiceAmount: number): number {
  const raw = Math.max(0, invoiceAmount) * Number(card.discount_percent) / 100
  const capped = Number(card.max_discount_amount) > 0 ? Math.min(raw, Number(card.max_discount_amount)) : raw
  return round2(capped)
}

export function localDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
