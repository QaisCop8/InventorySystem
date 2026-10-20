import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"

// تحميل تكاليف الشحن والجمارك على الأصناف (Landed cost):
// مستند مرتبط بفاتورة مشتريات (17) فيه بنود تكاليف إضافية (شحن، جمارك، تخليص، تأمين...) كل بند على حساب
// دائن (المورد/مزوّد الخدمة)، يُوزَّع مجموعها على أصناف الفاتورة حسب القيمة أو الكمية أو الوزن.
// - التوزيع لا يُخزَّن لكل سطر: سطور الفاتورة تُحذف وتُعاد عند كل حفظ (saveSalesVoucherItems)، لذا يُحسب
//   دائماً من View (landed_cost_lines_v) على سطور الفاتورة الحالية — تعديل الفاتورة يعيد التوزيع تلقائياً.
// - حصة كل سطر (بعملة الفاتورة) تُضاف لكلفة الوحدة في تقييم المخزون (lib/item-inventory-reports.ts +
//   lib/voucher-inventory-valuation.ts) ⇐ المتوسط/آخر شراء/FIFO وتقارير أرباح الأصناف تشمل التكاليف.
// - قيد آلي (internal_voucher_id 33): مدين حساب المخزون/المشتريات، دائن حساب كل بند.

export const LANDED_COST_INTERNAL_VOUCHER = 33
export const LANDED_COST_PURCHASE_TYPES = [17]
export const LANDED_COST_METHODS = ["value", "quantity", "weight"] as const
export type LandedCostMethod = (typeof LANDED_COST_METHODS)[number]
export const LANDED_COST_METHOD_LABELS: Record<LandedCostMethod, string> = { value: "حسب القيمة", quantity: "حسب الكمية", weight: "حسب الوزن" }
export const LANDED_COST_CHARGE_TYPES: Record<string, string> = {
  freight: "شحن", customs: "جمارك", clearance: "تخليص", insurance: "تأمين", other: "أخرى",
}

export async function ensureLandedCostSchema() { return runSchemaOnce("lib/landed-costs.ts#ensureLandedCostSchema", async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS landed_costs_tbl (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL,
      doc_date DATE NOT NULL,
      branch_id INTEGER,
      purchase_voucher_id INTEGER NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'value',
      currency_id INTEGER,
      rate NUMERIC(18,6) NOT NULL DEFAULT 1,
      debit_account_id INTEGER,
      total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      note TEXT,
      journal_voucher_id INTEGER,
      status INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_landed_costs_purchase ON landed_costs_tbl(purchase_voucher_id) WHERE status <> 3`
  await sql`
    CREATE TABLE IF NOT EXISTS landed_cost_charges_tbl (
      id SERIAL PRIMARY KEY,
      landed_cost_id INTEGER NOT NULL REFERENCES landed_costs_tbl(id) ON DELETE CASCADE,
      charge_type VARCHAR(20) NOT NULL DEFAULT 'other',
      account_id INTEGER NOT NULL,
      amount NUMERIC(18,4) NOT NULL DEFAULT 0,
      reference VARCHAR(100),
      note TEXT
    )
  `
  // حصة كل سطر صنف (مخزني) من فاتورة المشتريات بعملة الفاتورة. أساس القيمة = صافي السطر قبل الضريبة
  // بعد خصم السطر؛ الكمية والوزن بالوحدة الرئيسية وتشمل البونص (البونص يدخل المخزون ويحمل تكلفته).
  await sql`DROP VIEW IF EXISTS landed_cost_lines_v`
  await sql.unsafe(`
    CREATE VIEW landed_cost_lines_v AS
    WITH base AS (
      SELECT lc.id AS landed_cost_id, lc.doc_date, lc.method, lc.purchase_voucher_id, vi.id AS voucher_item_id, vi.item_id AS product_id,
        lc.total_amount * COALESCE(NULLIF(lc.rate, 0), 1) / COALESCE(NULLIF(vh.rate, 0), 1) AS total_invoice_amount,
        COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0)
          / CASE WHEN COALESCE((to_jsonb(vh)->>'vat_included')::boolean, false) THEN COALESCE(NULLIF(1 + COALESCE(vi.vat_ratio, 0) / 100, 0), 1) ELSE 1 END
          * (1 - COALESCE(vi.discount, 0) / 100) AS basis_value,
        (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(NULLIF(pu.to_main_qnty, 0), 1) AS basis_quantity,
        (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(NULLIF(pu.to_main_qnty, 0), 1)
          * COALESCE(NULLIF(to_jsonb(p)->>'weight', '')::numeric, 0) AS basis_weight
      FROM landed_costs_tbl lc
      JOIN voucher_header_tbl vh ON vh.id = lc.purchase_voucher_id
      JOIN voucher_items_tbl vi ON vi.voucher_id = vh.id
      JOIN products p ON p.id = vi.item_id AND COALESCE(p.type, 1) = 1
      LEFT JOIN LATERAL (
        SELECT to_main_qnty FROM product_units WHERE product_id = vi.item_id AND unit_id = vi.unit_id ORDER BY id LIMIT 1
      ) pu ON TRUE
      WHERE lc.status <> 3 AND COALESCE(vh.status, 1) <> 3
    ), weighed AS (
      SELECT base.*, GREATEST(0, CASE method WHEN 'quantity' THEN basis_quantity WHEN 'weight' THEN basis_weight ELSE basis_value END) AS basis
      FROM base
    )
    SELECT landed_cost_id, doc_date, method, purchase_voucher_id, voucher_item_id, product_id, basis,
      CASE WHEN SUM(basis) OVER (PARTITION BY landed_cost_id) > 0
        THEN total_invoice_amount * basis / SUM(basis) OVER (PARTITION BY landed_cost_id) ELSE 0 END AS amount
    FROM weighed
  `)
}) }

/** أسطر فاتورة المشتريات مع أسس التوزيع الثلاثة — لمعاينة التوزيع في الشاشة قبل الحفظ. */
export async function purchaseLinesForLandedCost(voucherId: number) {
  const header = (await sql`
    SELECT vh.id, vh.vch_code, vh.vch_type, vh.vch_date::date::text AS vch_date, vh.currency_id, COALESCE(NULLIF(vh.rate, 0), 1) AS rate,
      vh.branch_id, vh.amount, acc.code AS supplier_code, acc.name AS supplier_name, c.currency_code, c.currency_name
    FROM voucher_header_tbl vh
    LEFT JOIN account_tbl acc ON acc.id = vh.account_id
    LEFT JOIN currency c ON c.id = vh.currency_id
    WHERE vh.id = ${voucherId} AND vh.vch_type = ANY(${LANDED_COST_PURCHASE_TYPES}::int[]) AND COALESCE(vh.status, 1) <> 3
  `)[0] as any
  if (!header) return null
  const lines = await sql`
    SELECT vi.id, vi.item_id AS product_id, p.product_code, COALESCE(p.product_name, vi.item_name) AS product_name, u.unit_name,
      COALESCE(vi.qnty, 0) AS qnty, COALESCE(vi.bonus, 0) AS bonus, COALESCE(vi.price, 0) AS price,
      COALESCE(NULLIF(pu.to_main_qnty, 0), 1) AS unit_factor,
      COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0)
        / CASE WHEN COALESCE((to_jsonb(vh)->>'vat_included')::boolean, false) THEN COALESCE(NULLIF(1 + COALESCE(vi.vat_ratio, 0) / 100, 0), 1) ELSE 1 END
        * (1 - COALESCE(vi.discount, 0) / 100) AS basis_value,
      (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(NULLIF(pu.to_main_qnty, 0), 1) AS basis_quantity,
      (COALESCE(vi.qnty, 0) + COALESCE(vi.bonus, 0)) * COALESCE(NULLIF(pu.to_main_qnty, 0), 1)
        * COALESCE(NULLIF(to_jsonb(p)->>'weight', '')::numeric, 0) AS basis_weight,
      COALESCE((SELECT SUM(l.amount) FROM landed_cost_lines_v l WHERE l.voucher_item_id = vi.id), 0) AS allocated_before
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    JOIN products p ON p.id = vi.item_id AND COALESCE(p.type, 1) = 1
    LEFT JOIN units u ON u.id = vi.unit_id
    LEFT JOIN LATERAL (SELECT to_main_qnty FROM product_units WHERE product_id = vi.item_id AND unit_id = vi.unit_id ORDER BY id LIMIT 1) pu ON TRUE
    WHERE vi.voucher_id = ${voucherId}
    ORDER BY vi.id
  `
  return { header, lines }
}

export async function nextLandedCostCode() {
  const row = (await sql`SELECT COALESCE(MAX(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::bigint), 0) + 1 AS next FROM landed_costs_tbl`)[0] as any
  return `LC-${String(row?.next || 1).padStart(5, "0")}`
}
