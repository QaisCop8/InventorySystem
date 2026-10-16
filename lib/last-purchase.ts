import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// آخر سعر شراء للصنف من فاتورة المشتريات (17) وإرسالية المشتريات (18):
// products.last_purchase_price (بالوحدة الرئيسية، بعد خصم السطر، بعملة السند) + تاريخ وعملة آخر شراء.
// يُحدَّث فقط إن كان تاريخ السند >= آخر تاريخ شراء مسجّل للصنف — سند بتاريخ أقدم لا يكتب فوق الأحدث.
export const LAST_PURCHASE_VCH_TYPES = [17, 18]

export async function ensureLastPurchaseColumns() { return runSchemaOnce("lib/last-purchase.ts#ensureLastPurchaseColumns", async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_date DATE`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_currency_id INTEGER`
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_voucher_id INTEGER`
  // تعبئة أولى من سجل المشتريات للأصناف التي لم يُسجَّل لها تاريخ شراء بعد (آمنة للتكرار: فقط حيث التاريخ فارغ)
  await sql`
    WITH latest AS (
      SELECT DISTINCT ON (vi.item_id) vi.item_id, vh.id voucher_id, vh.vch_date::date vch_date, vh.currency_id,
        vi.price * (1 - LEAST(GREATEST(COALESCE(vi.pos_discount_percent, vi.discount, 0), 0), 100) / 100.0)
          / NULLIF(COALESCE(NULLIF(pu.to_main_qnty, 0), 1), 0) AS main_unit_price
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id AND vh.vch_type = ANY(${LAST_PURCHASE_VCH_TYPES}::int[]) AND vh.status <> 3
      LEFT JOIN product_units pu ON pu.product_id = vi.item_id AND pu.unit_id = vi.unit_id
      WHERE vi.item_id IS NOT NULL AND COALESCE(vi.price, 0) > 0 AND COALESCE(vi.qnty, 0) > 0
      ORDER BY vi.item_id, vh.vch_date DESC, vh.id DESC, vi.id DESC
    )
    UPDATE products p SET
      last_purchase_price = ROUND(l.main_unit_price::numeric, 4),
      last_purchase_date = l.vch_date,
      last_purchase_currency_id = l.currency_id,
      last_purchase_voucher_id = l.voucher_id
    FROM latest l
    WHERE p.id = l.item_id AND p.last_purchase_date IS NULL
  `
}) }

export async function updateLastPurchasePrices(voucherId: number): Promise<number> {
  const header = (await sql`
    SELECT id, vch_type, vch_date::date::text vch_date, currency_id, status FROM voucher_header_tbl WHERE id = ${voucherId}
  `)[0] as any
  if (!header || !LAST_PURCHASE_VCH_TYPES.includes(Number(header.vch_type)) || Number(header.status) === 3) return 0
  await ensureLastPurchaseColumns()
  const updated = await sql`
    WITH lines AS (
      SELECT DISTINCT ON (vi.item_id) vi.item_id,
        vi.price * (1 - LEAST(GREATEST(COALESCE(vi.pos_discount_percent, vi.discount, 0), 0), 100) / 100.0)
          / NULLIF(COALESCE(NULLIF(pu.to_main_qnty, 0), 1), 0) AS main_unit_price
      FROM voucher_items_tbl vi
      LEFT JOIN product_units pu ON pu.product_id = vi.item_id AND pu.unit_id = vi.unit_id
      WHERE vi.voucher_id = ${voucherId} AND vi.item_id IS NOT NULL AND COALESCE(vi.price, 0) > 0 AND COALESCE(vi.qnty, 0) > 0
      ORDER BY vi.item_id, vi.id DESC
    )
    UPDATE products p SET
      last_purchase_price = ROUND(l.main_unit_price::numeric, 4),
      last_purchase_date = ${header.vch_date}::date,
      last_purchase_currency_id = ${header.currency_id == null ? null : Number(header.currency_id)},
      last_purchase_voucher_id = ${voucherId}
    FROM lines l
    WHERE p.id = l.item_id
      AND (p.last_purchase_date IS NULL OR p.last_purchase_date <= ${header.vch_date}::date)
    RETURNING p.id
  `
  return updated.length
}
