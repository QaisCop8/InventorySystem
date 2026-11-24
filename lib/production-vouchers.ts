import { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getBaseCurrencyId } from "@/lib/auto-journals"
import { lotBalances, normalizeExpiry } from "@/lib/stock-lots"
import { PRODUCTION_RELEASING_STATUS, PRODUCTION_SYNCING_STATUS } from "@/lib/production-links"
import { withBranchSymbol } from "@/lib/branch-symbol"
import { getProductBalances } from "@/lib/item-inventory-reports"
import { PRODUCTION_COST_TYPES, ensureRecipeSchema, loadRecipeSettings, type RecipeSettings } from "@/lib/production-recipe"
import {
  INTERNAL_DELIVERY_VCH_TYPE,
  STOCK_IN_VCH_TYPE,
  STOCK_OUT_VCH_TYPE,
  buildVoucherCode,
  ensureTables as ensureStockVoucherTables,
  getStockVoucherNumberSettings,
  nextVoucherSequence,
  resolveVoucherBookName,
} from "@/app/api/stock-vouchers/_lib"
import { POST as createStockVoucher, PUT as updateStockVoucher } from "@/app/api/stock-vouchers/route"
import { DELETE as deleteStockVoucher } from "@/app/api/stock-vouchers/[id]/route"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// سند انتاج بضاعة (ادارة الاصناف ← الحركات): جدولان — المواد المنتجة (role 1) والمواد الخام (role 2).
// لا يحرّك المخزون بنفسه: الترحيل يولّد سند اخراج (9) للخام من مستودع المواد الخام ثم سند ادخال (8) للمنتَج
// إلى مستودع المواد الجاهزة — فتبقى كل التقارير وقواعد الدفعات/الرصيد السالب كما هي (مثل جرد المخازن).
// "نقل الى مستودع" بعد الترحيل يولّد ارسالية داخلية (10) من مستودع المواد الجاهزة لكميات (جزئية) من المنتَج.
// السندات المولَّدة محمية من التعديل المباشر (lib/production-links.ts).
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const PRODUCTION_STATUS = { SAVED: 1, POSTED: 2, CANCELLED: 3 } as const
export const PRODUCED_ROLE = 1
export const RAW_ROLE = 2
export const PRODUCTION_STATUS_NAME: Record<number, string> = { 1: "غير معتمد", 2: "معتمد", 3: "ملغى", 4: "قيد الإلغاء", 5: "قيد الحفظ" }

export class ProductionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export async function ensureProductionTables() {
  return runSchemaOnce("lib/production-vouchers.ts#ensureProductionTables", async () => {
    await ensureStockVoucherTables()
    await sql`
      CREATE TABLE IF NOT EXISTS production_vouchers_tbl (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL UNIQUE,
        vch_date DATE NOT NULL,
        branch_id INTEGER NOT NULL,
        finished_store_id INTEGER NOT NULL,
        raw_store_id INTEGER NOT NULL,
        note TEXT,
        status SMALLINT NOT NULL DEFAULT 1,
        in_voucher_id INTEGER,
        out_voucher_id INTEGER,
        created_by VARCHAR(50),
        posted_by VARCHAR(50),
        posted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS production_voucher_items_tbl (
        id SERIAL PRIMARY KEY,
        production_id INTEGER NOT NULL REFERENCES production_vouchers_tbl(id) ON DELETE CASCADE,
        role SMALLINT NOT NULL CHECK (role IN (1, 2)),
        item_id INTEGER NOT NULL,
        unit_id INTEGER,
        quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
        price NUMERIC(18,6) NOT NULL DEFAULT 0,
        expiry_date DATE,
        batch_no VARCHAR(30),
        note VARCHAR(200),
        source_line INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_items_production ON production_voucher_items_tbl(production_id, role, sort_order)`
    await sql`
      CREATE TABLE IF NOT EXISTS production_transfers_tbl (
        id SERIAL PRIMARY KEY,
        production_id INTEGER NOT NULL REFERENCES production_vouchers_tbl(id) ON DELETE CASCADE,
        voucher_id INTEGER,
        vch_code VARCHAR(30),
        to_store_id INTEGER NOT NULL,
        status SMALLINT NOT NULL DEFAULT 1,
        created_by VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS production_transfer_items_tbl (
        id SERIAL PRIMARY KEY,
        transfer_id INTEGER NOT NULL REFERENCES production_transfers_tbl(id) ON DELETE CASCADE,
        production_item_id INTEGER NOT NULL REFERENCES production_voucher_items_tbl(id) ON DELETE CASCADE,
        quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0)
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_transfers_production ON production_transfers_tbl(production_id, status)`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_links_in ON production_vouchers_tbl(in_voucher_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_links_out ON production_vouchers_tbl(out_voucher_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_transfers_voucher ON production_transfers_tbl(voucher_id)`
    // 2026-11-24 كلفة الانتاج الفعلية: احتساب تلقائي (السندات القديمة تبقى بأسعارها اليدوية)، تكاليف إضافية، نسبة توزيع الكلفة
    // على المنتجات، والكمية المعيارية للخام (من الوصفة مع الهدر) لتقارير الانحراف
    await sql`ALTER TABLE production_vouchers_tbl ADD COLUMN IF NOT EXISTS auto_cost BOOLEAN NOT NULL DEFAULT FALSE`
    await sql`ALTER TABLE production_vouchers_tbl ALTER COLUMN auto_cost SET DEFAULT TRUE`
    await sql`ALTER TABLE production_voucher_items_tbl ADD COLUMN IF NOT EXISTS cost_share NUMERIC(9,4)`
    await sql`ALTER TABLE production_voucher_items_tbl ADD COLUMN IF NOT EXISTS standard_quantity NUMERIC(18,6)`
    await sql`
      CREATE TABLE IF NOT EXISTS production_voucher_costs_tbl (
        id SERIAL PRIMARY KEY,
        production_id INTEGER NOT NULL REFERENCES production_vouchers_tbl(id) ON DELETE CASCADE,
        cost_type VARCHAR(20) NOT NULL DEFAULT 'other',
        description VARCHAR(200),
        amount NUMERIC(18,6) NOT NULL CHECK (amount > 0),
        source_line INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_costs_production ON production_voucher_costs_tbl(production_id, sort_order)`
    // أمر الانتاج الذي يُنفَّذ به السند (lib/production-orders.ts)
    await sql`ALTER TABLE production_vouchers_tbl ADD COLUMN IF NOT EXISTS order_id INTEGER`
    // أوامر الانتاج (lib/production-orders.ts)
    await sql`
      CREATE TABLE IF NOT EXISTS production_orders_tbl (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL UNIQUE,
        order_date DATE NOT NULL,
        due_date DATE,
        branch_id INTEGER NOT NULL,
        finished_store_id INTEGER,
        raw_store_id INTEGER,
        status SMALLINT NOT NULL DEFAULT 1,
        priority SMALLINT NOT NULL DEFAULT 1,
        note TEXT,
        closed_by VARCHAR(50),
        closed_at TIMESTAMP,
        created_by VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
    await sql`
      CREATE TABLE IF NOT EXISTS production_order_items_tbl (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES production_orders_tbl(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL,
        quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
        sales_order_id INTEGER,
        sales_order_number VARCHAR(40),
        note VARCHAR(200),
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_order_items_order ON production_order_items_tbl(order_id, sort_order)`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_orders_branch ON production_orders_tbl(branch_id, status, due_date)`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_vouchers_order ON production_vouchers_tbl(order_id) WHERE order_id IS NOT NULL`
    // 2026-11-24 أرض المصنع: مراكز العمل (خطوط/آلات بكلفة ساعة تشغيل) وعمال السند (ساعات × أجر الساعة) — كلفتهما تُضاف
    // لتكاليف السند الإضافية من الشاشة، وتُحفظ هنا لتقارير الإنتاجية
    await sql`
      CREATE TABLE IF NOT EXISTS production_work_centers_tbl (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        hourly_rate NUMERIC(18,6) NOT NULL DEFAULT 0,
        status SMALLINT NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    await sql`ALTER TABLE production_vouchers_tbl ADD COLUMN IF NOT EXISTS work_center_id INTEGER`
    await sql`ALTER TABLE production_vouchers_tbl ADD COLUMN IF NOT EXISTS machine_hours NUMERIC(18,4)`
    await sql`
      CREATE TABLE IF NOT EXISTS production_voucher_workers_tbl (
        id SERIAL PRIMARY KEY,
        production_id INTEGER NOT NULL REFERENCES production_vouchers_tbl(id) ON DELETE CASCADE,
        employee_id INTEGER,
        worker_name VARCHAR(200),
        hours NUMERIC(18,4) NOT NULL DEFAULT 0,
        hourly_rate NUMERIC(18,6) NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_production_workers_production ON production_voucher_workers_tbl(production_id)`

    await ensureRecipeSchema()
  })
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const round3 = (value: number) => Math.round(value * 1000) / 1000

// ───────────── الأصناف ومكونات التصنيع ─────────────

export type ProductionProduct = {
  id: number; product_code: string; product_name: string; unit_id: number | null; unit_name: string; price: number
  has_expiry: boolean; has_batch: boolean; unsupported: string | null
}

/** بيانات الأصناف للسند: الوحدة الرئيسية، سعر الشراء (آخر سعر شراء)، تتبع الصلاحية/الدفعة، وسبب عدم الدعم إن وُجد. */
export async function loadProductionProducts(productIds: number[]): Promise<Map<number, ProductionProduct>> {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))]
  if (!ids.length) return new Map()
  const variantsTable = Boolean(((await sql`SELECT to_regclass('product_atrributes_values_tbl') IS NOT NULL AS ok`) as any[])[0]?.ok)
  const rows = (await sql`
    SELECT p.id, p.product_code, p.product_name, p.measurment_unit AS unit_id, u.unit_name,
      COALESCE(NULLIF(to_jsonb(p)->>'last_purchase_price', '')::numeric, 0) AS price,
      COALESCE(p.serial_tracking, false) AS has_serial,
      COALESCE((to_jsonb(p)->>'has_expiry_date')::boolean, false) AS has_expiry,
      COALESCE((to_jsonb(p)->>'has_batch_number')::boolean, false) AS has_batch,
      COALESCE(NULLIF(to_jsonb(p)->>'measurment_id', '')::int, 1) AS measurment_id,
      COALESCE(p.type, 1) AS type, COALESCE(p.deleted, false) AS deleted, COALESCE(p.status, 1) AS status
    FROM products p LEFT JOIN units u ON u.id = p.measurment_unit
    WHERE p.id = ANY(${ids}::int[])
  `) as any[]
  const withVariants = new Set<number>()
  if (variantsTable) {
    for (const row of (await sql`SELECT DISTINCT product_id FROM product_atrributes_values_tbl WHERE product_id = ANY(${ids}::int[])`) as any[]) withVariants.add(Number(row.product_id))
  }
  return new Map(rows.map((row) => {
    const id = Number(row.id)
    const unsupported = row.deleted || Number(row.status) === 3 ? "محذوف"
      : Number(row.type) !== 1 ? "ليس صنفاً مخزنياً"
      : row.has_serial ? "له أرقام تسلسلية"
      : Number(row.measurment_id) !== 1 ? "نوع قياسه بالأبعاد"
      : withVariants.has(id) ? "له خصائص ومتغيرات"
      : null
    return [id, {
      id, product_code: row.product_code || "", product_name: row.product_name || "",
      unit_id: row.unit_id == null ? null : Number(row.unit_id), unit_name: row.unit_name || "",
      price: Number(row.price || 0), has_expiry: Boolean(row.has_expiry), has_batch: Boolean(row.has_batch), unsupported,
    }]
  }))
}

/** الصنف المنتَج + مكونات التصنيع المعرّفة عليه (كمية المكوّن لكل وحدة منتَجة). */
export async function productionProductInfo(productId: number) {
  const [info] = await productionProductsInfo([productId])
  if (!info) throw new ProductionError("الصنف غير موجود", 404)
  return info
}

/** عدة أصناف دفعة واحدة (اختيار متعدد من البحث): كل صنف مع مكونات تصنيعه — 3 استعلامات بدل 3 لكل صنف. */
export async function productionProductsInfo(productIds: number[], date?: string) {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))].slice(0, 200)
  if (!ids.length) return []
  await ensureRecipeSchema()
  const hasTable = Boolean(((await sql`SELECT to_regclass('product_manufacturing_components') IS NOT NULL AS ok`) as any[])[0]?.ok)
  const hasWaste = hasTable && Boolean(((await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'product_manufacturing_components' AND column_name = 'waste_percent' LIMIT 1`) as any[]).length)
  const rows = hasTable
    ? hasWaste
      ? (await sql`SELECT product_id, component_id, quantity, COALESCE(waste_percent, 0) AS waste_percent FROM product_manufacturing_components WHERE product_id = ANY(${ids}::int[]) ORDER BY id`) as any[]
      : (await sql`SELECT product_id, component_id, quantity, 0 AS waste_percent FROM product_manufacturing_components WHERE product_id = ANY(${ids}::int[]) ORDER BY id`) as any[]
    : []
  const allIds = [...ids, ...rows.map((row) => Number(row.component_id))]
  const [products, costs, recipes] = await Promise.all([loadProductionProducts(allIds), averageCosts(allIds, date), loadRecipeSettings(ids)])
  // السعر المقترح = متوسط الكلفة الحالي (وإلا آخر سعر شراء) — الخادم يعيد احتسابه بتاريخ السند عند الحفظ
  const priced = (product: ProductionProduct) => ({ ...product, price: costs.get(product.id) || product.price })
  return ids
    .filter((id) => products.has(id))
    .map((id) => ({
      product: priced(products.get(id)!),
      recipe: recipes.get(id) || null,
      components: rows
        .filter((row) => Number(row.product_id) === id)
        .map((row) => {
          const base = Number(row.quantity || 0)
          const waste = Number(row.waste_percent || 0)
          const product = products.get(Number(row.component_id))
          // الكمية المصروفة لكل وحدة منتَجة = كمية الوصفة × (1 + الهدر%)
          return { product: product ? priced(product) : undefined, per_unit: round6(base * (1 + waste / 100)), base_per_unit: base, waste_percent: waste }
        })
        .filter((row): row is { product: ProductionProduct; per_unit: number; base_per_unit: number; waste_percent: number } => Boolean(row.product) && row.per_unit > 0),
    }))
}

/**
 * متوسط كلفة الوحدة الرئيسية لكل صنف حتى تاريخ (نفس محرك تقارير الجرد/الأرباح) — 0 إن لم يُعرف.
 * أساس احتساب كلفة المواد الخام في سند الانتاج.
 */
export async function averageCosts(productIds: number[], date?: string): Promise<Map<number, number>> {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))]
  if (!ids.length) return new Map()
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : new Date().toISOString().slice(0, 10)
  try {
    const rows = await getProductBalances(0, day, 0, "", { productIds: ids, includeUnposted: true })
    return new Map(rows.map((row: any) => [Number(row.id), Math.max(0, Number(row.average_cost) || 0)] as [number, number]).filter(([, cost]) => cost > 0))
  } catch (error) {
    console.error("production average costs", error)
    return new Map()
  }
}

export type ProductionCostLine = { cost_type: string; description: string; amount: number; source_line: number | null }

function validateCosts(raw: unknown): ProductionCostLine[] {
  return (Array.isArray(raw) ? raw : [])
    .map((line: any) => ({
      cost_type: PRODUCTION_COST_TYPES[String(line?.cost_type)] ? String(line.cost_type) : "other",
      description: String(line?.description || "").trim().slice(0, 200),
      amount: round6(Number(line?.amount)),
      source_line: Number(line?.source_line) >= 0 && line?.source_line !== null && line?.source_line !== "" ? Number(line.source_line) : null,
    }))
    .filter((line) => {
      if (!Number.isFinite(line.amount) || line.amount < 0) throw new ProductionError("مبلغ التكلفة الإضافية غير صالح")
      return line.amount > 0
    })
}

/**
 * كلفة المنتَج الفعلية: (كلفة المواد الخام بمتوسط الكلفة بتاريخ السند + التكاليف الإضافية) موزعة على المواد المنتجة
 * حسب نسبة التوزيع المُدخلة لكل منتَج (وإلا حسب الكمية) ⇐ سعر وحدة كل منتَج = نصيبه ÷ كميته.
 */
export function allocateProductionCost<P extends { quantity: number; price: number; cost_share?: number | null }, R extends { quantity: number; price: number }>(produced: P[], raw: R[], costs: { amount: number }[]) {
  const rawTotal = raw.reduce((sum, line) => sum + line.quantity * line.price, 0)
  const extra = costs.reduce((sum, line) => sum + line.amount, 0)
  const total = rawTotal + extra
  const shares = produced.map((line) => Math.max(0, Number(line.cost_share) || 0))
  const shareTotal = shares.reduce((sum, value) => sum + value, 0)
  const quantityTotal = produced.reduce((sum, line) => sum + line.quantity, 0)
  return {
    raw_total: round6(rawTotal), extra_total: round6(extra), total: round6(total),
    produced: produced.map((line, index) => {
      const portion = shareTotal > 0 ? shares[index] / shareTotal : quantityTotal > 0 ? line.quantity / quantityTotal : 0
      return { ...line, price: line.quantity > 0 ? round6((total * portion) / line.quantity) : 0 }
    }),
  }
}

export type { RecipeSettings }

/** رقم الصنف أو باركوده (أو باركود إحدى وحداته) المكتوب في جدول السند ⇒ معرّف الصنف — طلب واحد بدل بحث ثم تحميل. */
export async function productionProductIdByCode(code: string) {
  const text = String(code || "").trim()
  if (!text) return null
  const row = ((await sql`
    SELECT p.id FROM products p
    WHERE COALESCE(p.deleted, false) = false AND COALESCE(p.status, 1) <> 3
      AND (UPPER(p.product_code) = UPPER(${text}) OR p.barcode = ${text}
           OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND (to_jsonb(pu)->>'barcode') = ${text}))
    ORDER BY (UPPER(p.product_code) = UPPER(${text})) DESC, p.id
    LIMIT 1
  `) as any[])[0]
  return row ? Number(row.id) : null
}

// ───────────── المستودعات الافتراضية ─────────────

/** مستودع المواد الجاهزة/الخام من إعدادات المستخدم ("في سند الانتاج")، وإلا أول مستودع يتعامل معه الفرع، وإلا أول مستودع في النظام. */
export async function defaultProductionWarehouses(userId: string, branchId: number | null) {
  const user = ((await sql`
    SELECT
      NULLIF(to_jsonb(us)->>'finished_goods_warehouse_id', '')::int AS finished,
      NULLIF(to_jsonb(us)->>'raw_materials_warehouse_id', '')::int AS raw
    FROM user_settings us WHERE us.user_id::text = ${String(userId)} LIMIT 1
  `) as any[])[0] || {}
  const active = async (id: unknown) => {
    const number = Number(id)
    if (!(number > 0)) return null
    const row = ((await sql`SELECT id FROM warehouses WHERE id = ${number} AND COALESCE(status, 1) <> 3 AND COALESCE(is_active, true) = true`) as any[])[0]
    return row ? number : null
  }
  // المستودعات غير مربوطة بالفروع تعريفياً — "حسب الفرع" = أول مستودع (بالترتيب) سبق للفرع التعامل معه بسند
  const fallback = ((await sql`
    SELECT w.id FROM warehouses w
    WHERE COALESCE(w.status, 1) <> 3 AND COALESCE(w.is_active, true) = true
    ORDER BY NOT EXISTS (
      SELECT 1 FROM voucher_header_tbl vh
      WHERE ${Number(branchId) || 0} > 0 AND vh.branch_id = ${Number(branchId) || 0} AND COALESCE(vh.status, 1) <> 3
        AND (vh.to_store_id = w.id OR vh.from_store_id = w.id)
    ), w.id
    LIMIT 1
  `) as any[])[0]
  const fallbackId = fallback ? Number(fallback.id) : null
  return {
    finished_store_id: (await active(user.finished)) ?? fallbackId,
    raw_store_id: (await active(user.raw)) ?? fallbackId,
  }
}

// ───────────── القراءة ─────────────

export async function loadProduction(id: number) {
  const header = ((await sql`
    SELECT p.*, p.vch_date::text AS vch_date_text, b.branch_name, wf.warehouse_name AS finished_store_name, wr.warehouse_name AS raw_store_name,
      vin.vch_code AS in_vch_code, vout.vch_code AS out_vch_code, po.code AS order_code, wc.name AS work_center_name,
      COALESCE((SELECT COALESCE(NULLIF(us.full_name, ''), us.username) FROM user_settings us WHERE us.user_id::text = p.created_by LIMIT 1), p.created_by) AS created_by_name
    FROM production_vouchers_tbl p
    LEFT JOIN branches b ON b.id = p.branch_id
    LEFT JOIN warehouses wf ON wf.id = p.finished_store_id
    LEFT JOIN warehouses wr ON wr.id = p.raw_store_id
    LEFT JOIN voucher_header_tbl vin ON vin.id = p.in_voucher_id
    LEFT JOIN voucher_header_tbl vout ON vout.id = p.out_voucher_id
    LEFT JOIN production_orders_tbl po ON po.id = p.order_id
    LEFT JOIN production_work_centers_tbl wc ON wc.id = p.work_center_id
    WHERE p.id = ${id}
  `) as any[])[0]
  if (!header) return null
  const items = (await sql`
    SELECT i.*, pr.product_code, pr.product_name, u.unit_name,
      COALESCE((SELECT SUM(ti.quantity) FROM production_transfer_items_tbl ti JOIN production_transfers_tbl t ON t.id = ti.transfer_id
                WHERE ti.production_item_id = i.id AND t.status = 1), 0) AS transferred
    FROM production_voucher_items_tbl i
    LEFT JOIN products pr ON pr.id = i.item_id
    LEFT JOIN units u ON u.id = i.unit_id
    WHERE i.production_id = ${id}
    ORDER BY i.role, i.sort_order, i.id
  `) as any[]
  const transfers = (await sql`
    SELECT t.id, t.voucher_id, t.vch_code, t.to_store_id, t.status, t.created_at, w.warehouse_name AS to_store_name,
      (SELECT SUM(quantity) FROM production_transfer_items_tbl WHERE transfer_id = t.id) AS quantity
    FROM production_transfers_tbl t LEFT JOIN warehouses w ON w.id = t.to_store_id
    WHERE t.production_id = ${id} ORDER BY t.id
  `) as any[]
  const costs = (await sql`SELECT cost_type, description, amount, source_line FROM production_voucher_costs_tbl WHERE production_id = ${id} ORDER BY sort_order, id`.catch(() => [])) as any[]
  const workers = (await sql`SELECT employee_id, worker_name, hours, hourly_rate FROM production_voucher_workers_tbl WHERE production_id = ${id} ORDER BY sort_order, id`.catch(() => [])) as any[]
  const shape = (row: any) => ({
    id: Number(row.id), role: Number(row.role), item_id: Number(row.item_id), product_code: row.product_code || "", product_name: row.product_name || "",
    unit_id: row.unit_id == null ? null : Number(row.unit_id), unit_name: row.unit_name || "", quantity: Number(row.quantity), price: Number(row.price),
    expiry_date: normalizeExpiry(row.expiry_date), batch_no: row.batch_no || "", note: row.note || "", source_line: row.source_line == null ? null : Number(row.source_line),
    transferred: Number(row.transferred || 0),
    cost_share: row.cost_share == null ? null : Number(row.cost_share), standard_quantity: row.standard_quantity == null ? null : Number(row.standard_quantity),
  })
  return {
    ...header,
    id: Number(header.id), status: Number(header.status), branch_id: Number(header.branch_id),
    finished_store_id: Number(header.finished_store_id), raw_store_id: Number(header.raw_store_id),
    // ::text — DATE يُقرأ كـDate بالمنطقة الزمنية المحلية فيُزاح يوماً عند toISOString
    vch_date: String(header.vch_date_text).slice(0, 10),
    produced: items.filter((row) => Number(row.role) === PRODUCED_ROLE).map(shape),
    raw: items.filter((row) => Number(row.role) === RAW_ROLE).map(shape),
    transfers: transfers.map((row) => ({ ...row, id: Number(row.id), status: Number(row.status), quantity: Number(row.quantity || 0) })),
    auto_cost: Boolean(header.auto_cost),
    work_center_id: header.work_center_id == null ? null : Number(header.work_center_id),
    machine_hours: header.machine_hours == null ? null : Number(header.machine_hours),
    workers: workers.map((row) => ({ employee_id: row.employee_id == null ? null : Number(row.employee_id), worker_name: row.worker_name || "", hours: Number(row.hours) || 0, hourly_rate: Number(row.hourly_rate) || 0 })),
    costs: costs.map((row) => ({ cost_type: String(row.cost_type || "other"), description: row.description || "", amount: Number(row.amount || 0), source_line: row.source_line == null ? null : Number(row.source_line) })),
  }
}

// ───────────── الحفظ ─────────────

type LineInput = { item_id: number; quantity: number; price: number; expiry_date: string | null; batch_no: string; note: string; source_line: number | null; cost_share: number | null; standard_quantity: number | null }

async function validateLines(rawLines: unknown, role: number): Promise<LineInput[]> {
  const label = role === PRODUCED_ROLE ? "المواد المنتجة" : "المواد الخام"
  const lines: LineInput[] = (Array.isArray(rawLines) ? rawLines : [])
    .filter((line: any) => Number(line?.item_id) > 0)
    .map((line: any) => ({
      item_id: Number(line.item_id),
      quantity: round6(Number(line.quantity)),
      price: round6(Number(line.price ?? 0)),
      expiry_date: role === PRODUCED_ROLE ? normalizeExpiry(line.expiry_date) : null,
      batch_no: role === PRODUCED_ROLE ? String(line.batch_no || "").trim().slice(0, 30) : "",
      note: String(line.note || "").trim().slice(0, 200),
      source_line: Number(line.source_line) >= 0 && line.source_line !== null && line.source_line !== "" ? Number(line.source_line) : null,
      cost_share: role === PRODUCED_ROLE && Number(line.cost_share) > 0 ? Math.min(100000, round6(Number(line.cost_share))) : null,
      standard_quantity: role === RAW_ROLE && Number(line.standard_quantity) > 0 ? round6(Number(line.standard_quantity)) : null,
    }))
  const products = await loadProductionProducts(lines.map((line) => line.item_id))
  lines.forEach((line, index) => {
    const product = products.get(line.item_id)
    const where = `${label} — السطر ${index + 1}${product ? ` (${product.product_name})` : ""}`
    if (!product) throw new ProductionError(`${where}: الصنف غير موجود`)
    if (product.unsupported) throw new ProductionError(`${where}: لا يمكن استخدام صنف ${product.unsupported} في سند الانتاج`)
    if (!(line.quantity > 0)) throw new ProductionError(`${where}: الكمية يجب أن تكون أكبر من صفر`)
    if (!Number.isFinite(line.price) || line.price < 0) throw new ProductionError(`${where}: السعر غير صالح`)
    if (role === PRODUCED_ROLE && product.has_expiry && !line.expiry_date) throw new ProductionError(`${where}: يجب إدخال تاريخ الصلاحية`)
    if (role === PRODUCED_ROLE && product.has_batch && !line.batch_no) throw new ProductionError(`${where}: يجب إدخال الرقم التشغيلي`)
  })
  return lines
}

// رقم سند الانتاج بنفس قاعدة باقي السندات: بادئة (P) + رمز الفرع + تسلسل مبطّن بأصفار = 10 خانات (lib/voucher-code.ts)
export const PRODUCTION_CODE_PREFIX = "P"
async function productionCodeSegment(branchId: number | null) {
  return `${PRODUCTION_CODE_PREFIX}${await withBranchSymbol("", branchId)}`.toUpperCase()
}

export async function nextProductionCode(branchId: number | null, sequence?: number) {
  const segment = await productionCodeSegment(branchId)
  if (sequence && sequence > 0) return buildVoucherCode(segment, "", sequence)
  const rows = (await sql`SELECT code FROM production_vouchers_tbl WHERE code LIKE ${segment + "%"}`) as any[]
  let max = 0
  for (const row of rows) {
    const value = Number(String(row.code).slice(segment.length))
    if (Number.isInteger(value) && value > max) max = value
  }
  return buildVoucherCode(segment, "", max + 1)
}

/** ما يكتبه المستخدم في رقم السند: كود موجود ⇒ معرّفه، أو رقم تسلسلي ⇒ الكود الكامل بصيغة الفرع. */
export async function resolveProductionCode(raw: string, branchId: number | null) {
  const text = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
  if (!text) return { code: await nextProductionCode(branchId), id: null }
  const exact = ((await sql`SELECT id FROM production_vouchers_tbl WHERE UPPER(code) = ${text} LIMIT 1`) as any[])[0]
  if (exact) return { code: text, id: Number(exact.id) }
  const segment = await productionCodeSegment(branchId)
  const digits = (text.startsWith(segment) ? text.slice(segment.length) : text).match(/^\d+$/)
  if (!digits) return { code: text, id: null }
  const code = await nextProductionCode(branchId, Number(digits[0]))
  const found = ((await sql`SELECT id FROM production_vouchers_tbl WHERE UPPER(code) = ${code} LIMIT 1`) as any[])[0]
  return { code, id: found ? Number(found.id) : null }
}

async function activeWarehouse(id: unknown, label: string) {
  const number = Number(id)
  const row = number > 0 ? ((await sql`SELECT id FROM warehouses WHERE id = ${number} AND COALESCE(status, 1) <> 3`) as any[])[0] : null
  if (!row) throw new ProductionError(`اختر ${label}`)
  return number
}

// ───────────── السندات المرتبطة (اخراج الخام / ادخال المنتَج) ─────────────
// مثل باقي السندات: الحفظ يُنشئ/يعدّل سندَي الإخراج والإدخال المرتبطين **محفوظين غير مرحّلين** (status 1) — فيدخلان
// في "المتاح" وفي الأرصدة غير المرحّلة، ويُطبَّق فحص الرصيد السالب (السماح باخراج كميات سالبة) على الخام فور الحفظ.
// الترحيل يرحّلهما (status 2)، وإلغاء الترحيل يلغيهما ثم يعيد إنشاءهما محفوظين، والحذف يحذفهما.

/** الدفتر الافتراضي للمستخدم لنوع السند، وإلا أول دفتر مسموح له. */
async function userBookFor(userId: string, vchType: number, label: string) {
  const rows = (await sql`
    SELECT p.vch_book_id, p.is_default
    FROM voucher_book_user_permissions_tbl p JOIN user_settings us ON us.id = p.user_id
    WHERE us.user_id::text = ${String(userId)} AND p.voucher_type_id = ${vchType}
    ORDER BY (p.is_default = 1) DESC, p.vch_book_id
    LIMIT 1
  `.catch(() => [])) as any[]
  if (!rows[0]) throw new ProductionError(`لا يوجد دفتر سندات مسموح لك لـ${label} — عرّفه من صلاحيات دفاتر السندات`)
  return Number(rows[0].vch_book_id)
}

type HandlerResult = { ok: boolean; body: any }

function voucherCaller(request: NextRequest, branchId: number) {
  return async (handler: (req: NextRequest) => Promise<Response>, payload: any, method: "POST" | "PUT"): Promise<HandlerResult> => {
    const headers = new Headers(request.headers)
    headers.delete("content-length")
    headers.set("content-type", "application/json")
    headers.set("x-branch-id", String(branchId))
    const response = await handler(new NextRequest(new URL("/api/stock-vouchers", request.url), { method, headers, body: JSON.stringify(payload) }))
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, body }
  }
}

async function voucherHeaderPayload(request: NextRequest, vchType: number, bookId: number, branchId: number, date: string) {
  const bookName = await resolveVoucherBookName(bookId, branchId)
  if (!bookName) throw new ProductionError("دفتر السندات غير صالح")
  const { prefix, startNumber } = await getStockVoucherNumberSettings(request.url, vchType)
  const sequence = await nextVoucherSequence(vchType, `${prefix}${bookName}`, startNumber)
  const currencyId = await getBaseCurrencyId()
  return { vch_type: vchType, vch_code: buildVoucherCode(prefix, bookName, sequence), vch_date: date, vch_book_id: bookId, branch_id: branchId, currency_id: currencyId, rate: 1 }
}

/** الخام ذو الصلاحية/الدفعة يُصرف من دفعات مستودع الخام الأقدم صلاحية أولاً (FIFO) — يُقسَّم لأكثر من سطر عند الحاجة. */
async function allocateRawLines(lines: any[], rawStoreId: number, branchId: number, excludeVoucherId: number | null = null) {
  const products = await loadProductionProducts(lines.map((line) => Number(line.item_id)))
  const tracked = lines.filter((line) => { const p = products.get(Number(line.item_id)); return p && (p.has_expiry || p.has_batch) })
  const lots = tracked.length
    ? await lotBalances({ warehouseId: rawStoreId, productIds: [...new Set(tracked.map((line) => Number(line.item_id)))], branchId, mode: "active", excludeVoucherId })
    : []
  const remaining = new Map(lots.map((lot, index) => [index, Number(lot.quantity)]))
  const result: any[] = []
  const shortages: string[] = []
  for (const line of lines) {
    const product = products.get(Number(line.item_id))!
    if (!product.has_expiry && !product.has_batch) { result.push({ line, quantity: Number(line.quantity) }); continue }
    let needed = Number(line.quantity)
    const candidates = lots
      .map((lot, index) => ({ lot, index }))
      .filter(({ lot, index }) => Number(lot.item_id) === product.id && (remaining.get(index) || 0) > 0)
      .sort((a, b) => String(normalizeExpiry(a.lot.expiry_date) || "9999").localeCompare(String(normalizeExpiry(b.lot.expiry_date) || "9999")))
    for (const { lot, index } of candidates) {
      if (needed <= 0.000001) break
      const take = Math.min(needed, remaining.get(index) || 0)
      remaining.set(index, (remaining.get(index) || 0) - take)
      needed = round6(needed - take)
      result.push({ line, quantity: round6(take), expiry_date: normalizeExpiry(lot.expiry_date), batch_no: lot.batch_no || "" })
    }
    if (needed > 0.000001) shortages.push(`${product.product_name} (ينقص ${round3(needed)})`)
  }
  if (shortages.length) throw new ProductionError(`لا توجد دفعات كافية في مستودع المواد الخام: ${shortages.slice(0, 5).join("، ")}`)
  return result
}

const itemPayload = (line: any, quantity: number, storeId: number, extra: { expiry_date?: string | null; batch_no?: string } = {}, note?: string) => ({
  product_id: Number(line.item_id),
  product_name: line.product_name,
  unit_id: line.unit_id,
  unit: line.unit_name,
  quantity: round6(quantity),
  unit_price: Number(line.price || 0),
  total_price: round3(quantity * Number(line.price || 0)),
  store_id: storeId,
  expiry_date: extra.expiry_date || undefined,
  batch_number: extra.batch_no || undefined,
  note: note || line.note || undefined,
})

type SyncContext = {
  request: NextRequest; userId: string; branchId: number; code: string; note: string | null; vchDate: string
  finishedStoreId: number; rawStoreId: number; produced: any[]; raw: any[]
}
type Links = { in_voucher_id: number | null; out_voucher_id: number | null }

async function storedHeader(voucherId: number | null) {
  if (!voucherId) return null
  const row = ((await sql`SELECT id, vch_type, vch_code, vch_book_id, branch_id, currency_id, rate, status FROM voucher_header_tbl WHERE id = ${voucherId}`) as any[])[0]
  return row && Number(row.status) !== 3 ? row : null
}

/** حمولة سند مرتبط: رأس السند القائم (رقمه/دفتره) إن وُجد وإلا رأس جديد بالدفتر الافتراضي للمستخدم. */
async function linkedPayload(ctx: SyncContext, vchType: number, status: number, existingId: number | null) {
  const existing = await storedHeader(existingId)
  // الفرع أو التاريخ تغيّر: الرقم يُعاد توليده فقط لسند جديد؛ القائم يحتفظ برقمه
  const header = existing
    ? { id: Number(existing.id), vch_type: vchType, vch_code: existing.vch_code, vch_date: ctx.vchDate, vch_book_id: existing.vch_book_id, branch_id: ctx.branchId, currency_id: existing.currency_id, rate: Number(existing.rate) || 1 }
    : await voucherHeaderPayload(ctx.request, vchType, await userBookFor(ctx.userId, vchType, vchType === STOCK_OUT_VCH_TYPE ? "سند اخراج بضاعة" : "سند ادخال بضاعة"), ctx.branchId, ctx.vchDate)
  const label = `سند انتاج رقم ${ctx.code}${ctx.note ? ` — ${ctx.note}` : ""}`
  if (vchType === STOCK_OUT_VCH_TYPE) {
    const allocations = await allocateRawLines(ctx.raw, ctx.rawStoreId, ctx.branchId, existing ? Number(existing.id) : null)
    return { existing: Boolean(existing), payload: { ...header, to_store_id: ctx.rawStoreId, note: `مواد خام — ${label}`, status, insert_user: Number(ctx.userId) || null, items: allocations.map((row) => itemPayload(row.line, row.quantity, ctx.rawStoreId, row)) } }
  }
  return { existing: Boolean(existing), payload: { ...header, to_store_id: ctx.finishedStoreId, note: `مواد منتجة — ${label}`, status, insert_user: Number(ctx.userId) || null, items: ctx.produced.map((line) => itemPayload(line, line.quantity, ctx.finishedStoreId, line)) } }
}

async function writeLinked(ctx: SyncContext, vchType: number, status: number, existingId: number | null) {
  const { existing, payload } = await linkedPayload(ctx, vchType, status, existingId)
  const call = voucherCaller(ctx.request, ctx.branchId)
  const result = existing ? await call(updateStockVoucher, payload, "PUT") : await call(createStockVoucher, payload, "POST")
  const what = vchType === STOCK_OUT_VCH_TYPE ? "سند إخراج المواد الخام" : "سند إدخال المواد المنتجة"
  if (!result.ok) throw new ProductionError(`تعذر ${existing ? "تعديل" : "إنشاء"} ${what}: ${result.body?.error || "خطأ غير معروف"}`)
  return { id: existing ? Number((payload as any).id) : Number(result.body.id), vch_code: existing ? String(payload.vch_code) : String(result.body.vch_code), created: !existing }
}

/** حذف سند مرتبط محفوظ (أو إلغاؤه إن كان مرحّلاً). */
async function removeLinked(request: NextRequest, branchId: number, voucherId: number | null) {
  const header = await storedHeader(voucherId)
  if (!header) return
  if (Number(header.status) === 2) { await cancelLinkedVoucher(voucherCaller(request, branchId), Number(header.id)); return }
  const headers = new Headers(request.headers)
  headers.delete("content-length")
  headers.set("x-branch-id", String(branchId))
  const response = await deleteStockVoucher(new NextRequest(new URL(`/api/stock-vouchers/${header.id}`, request.url), { method: "DELETE", headers }), { params: { id: String(header.id) } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ProductionError(`تعذر حذف السند ${header.vch_code}: ${body?.error || "خطأ غير معروف"}`)
  }
}

/** ينشئ/يعدّل السندين المرتبطين — الإدخال أولاً ثم الإخراج (الأكثر عرضة لرفض الرصيد)؛ فشل الثاني يعيد الأول لحالته. */
async function syncLinked(ctx: SyncContext, links: Links, status: number, rollback?: SyncContext): Promise<Links> {
  const inn = await writeLinked(ctx, STOCK_IN_VCH_TYPE, status, links.in_voucher_id)
  try {
    const out = await writeLinked(ctx, STOCK_OUT_VCH_TYPE, status, links.out_voucher_id)
    return { in_voucher_id: inn.id, out_voucher_id: out.id }
  } catch (error) {
    if (inn.created) await removeLinked(ctx.request, ctx.branchId, inn.id).catch(() => undefined)
    else if (rollback) await writeLinked(rollback, STOCK_IN_VCH_TYPE, 1, inn.id).catch(() => undefined)
    throw error
  }
}

async function contextFor(request: NextRequest, production: any, userId: string): Promise<SyncContext> {
  return {
    request, userId, branchId: production.branch_id, code: production.code, note: production.note || null, vchDate: production.vch_date,
    finishedStoreId: production.finished_store_id, rawStoreId: production.raw_store_id, produced: production.produced, raw: production.raw,
  }
}

// ───────────── الحفظ ─────────────

/** إنشاء/تعديل سند انتاج غير مرحّل مع سندَيه المرتبطين (محفوظين) — الترحيل منفصل (postProduction). */
export async function saveProduction(request: NextRequest, data: any, userId: string, branchId: number, existingId: number | null) {
  const vchDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.vch_date || "")) ? String(data.vch_date) : null
  if (!vchDate) throw new ProductionError("التاريخ غير صالح")
  const finished = await activeWarehouse(data.finished_store_id, "مستودع المواد الجاهزة")
  const raw = await activeWarehouse(data.raw_store_id, "مستودع المواد الخام")
  let produced = await validateLines(data.produced, PRODUCED_ROLE)
  const rawLines = await validateLines(data.raw, RAW_ROLE)
  const costs = validateCosts(data.costs)
  // احتساب الكلفة تلقائياً (الافتراضي): الخام بمتوسط كلفته بتاريخ السند (وإلا السعر المُدخل)، والمنتَج = نصيبه من الكلفة الكلية
  const autoCost = data.auto_cost !== false
  if (autoCost && produced.length) {
    const average = await averageCosts(rawLines.map((line) => line.item_id), vchDate)
    for (const line of rawLines) { const cost = average.get(line.item_id); if (cost) line.price = round6(cost) }
    produced = allocateProductionCost(produced, rawLines, costs).produced
  }
  if (!produced.length) throw new ProductionError("أضف صنفاً واحداً على الأقل في المواد المنتجة")
  if (!rawLines.length) throw new ProductionError("أضف صنفاً واحداً على الأقل في المواد الخام")
  const products = await loadProductionProducts([...produced, ...rawLines].map((line) => line.item_id))
  const note = String(data.note || "").trim().slice(0, 1000) || null
  const orderId = Number(data.order_id) > 0 ? Number(data.order_id) : null
  if (orderId) {
    const order = ((await sql`SELECT status FROM production_orders_tbl WHERE id = ${orderId}`.catch(() => [])) as any[])[0]
    if (!order) throw new ProductionError("أمر الانتاج المرتبط غير موجود")
    if (Number(order.status) === 4) throw new ProductionError("أمر الانتاج المرتبط ملغى")
  }
  const workCenterId = Number(data.work_center_id) > 0 ? Number(data.work_center_id) : null
  if (workCenterId && !((await sql`SELECT 1 FROM production_work_centers_tbl WHERE id = ${workCenterId}`) as any[]).length) throw new ProductionError("مركز العمل غير موجود")
  const machineHours = Number(data.machine_hours) > 0 ? Math.round(Number(data.machine_hours) * 1e4) / 1e4 : null
  const workers = (Array.isArray(data.workers) ? data.workers : [])
    .map((row: any) => ({
      employee_id: Number(row?.employee_id) > 0 ? Number(row.employee_id) : null,
      worker_name: String(row?.worker_name || "").trim().slice(0, 200),
      hours: Math.max(0, Math.round((Number(row?.hours) || 0) * 1e4) / 1e4),
      hourly_rate: Math.max(0, round6(Number(row?.hourly_rate) || 0)),
    }))
    .filter((row: any) => row.employee_id || row.worker_name)
  const withMeta = (line: LineInput) => { const p = products.get(line.item_id)!; return { ...line, product_name: p.product_name, unit_id: p.unit_id, unit_name: p.unit_name } }

  let id = existingId
  let code = ""
  let previous: any = null
  if (id) {
    previous = await loadProduction(id)
    if (!previous) throw new ProductionError("سند الانتاج غير موجود", 404)
    if (previous.status !== PRODUCTION_STATUS.SAVED) throw new ProductionError("سند الانتاج معتمد أو ملغى ولا يمكن تعديله — ألغِ الترحيل أولاً")
    code = previous.code
    await sql`UPDATE production_vouchers_tbl SET status = ${PRODUCTION_SYNCING_STATUS} WHERE id = ${id}`
  } else {
    // رقم مكتوب/مولّد في الشاشة يُعتمد إن كان صالحاً وغير مستخدم، وإلا يُولَّد التالي لفرع السند
    const typed = String(data.code || "").trim().toUpperCase()
    let requested = /^[A-Z0-9]{1,10}$/.test(typed) ? typed : null
    if (requested && ((await sql`SELECT 1 FROM production_vouchers_tbl WHERE UPPER(code) = ${requested}`) as any[]).length) requested = null
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      const candidate = attempt === 0 && requested ? requested : await nextProductionCode(branchId)
      const inserted = (await sql`
        INSERT INTO production_vouchers_tbl (code, vch_date, branch_id, finished_store_id, raw_store_id, note, status, created_by)
        VALUES (${candidate}, ${vchDate}, ${branchId}, ${finished}, ${raw}, ${note}, ${PRODUCTION_SYNCING_STATUS}, ${userId})
        ON CONFLICT (code) DO NOTHING RETURNING id`) as any[]
      if (inserted[0]) { id = Number(inserted[0].id); code = candidate }
    }
    if (!id) throw new ProductionError("تعذر توليد رقم سند الانتاج — أعد المحاولة")
  }

  const ctx: SyncContext = { request, userId, branchId, code, note, vchDate, finishedStoreId: finished, rawStoreId: raw, produced: produced.map(withMeta), raw: rawLines.map(withMeta) }
  let links: Links
  try {
    links = await syncLinked(ctx, { in_voucher_id: previous?.in_voucher_id ?? null, out_voucher_id: previous?.out_voucher_id ?? null }, 1, previous ? await contextFor(request, previous, userId) : undefined)
  } catch (error) {
    if (previous) await sql`UPDATE production_vouchers_tbl SET status = 1 WHERE id = ${id}`
    else await sql`DELETE FROM production_vouchers_tbl WHERE id = ${id}`
    throw error
  }

  await sql`
    UPDATE production_vouchers_tbl SET vch_date = ${vchDate}, branch_id = ${branchId}, finished_store_id = ${finished}, raw_store_id = ${raw}, note = ${note}, auto_cost = ${autoCost}, order_id = ${orderId}, work_center_id = ${workCenterId}, machine_hours = ${machineHours},
      in_voucher_id = ${links.in_voucher_id}, out_voucher_id = ${links.out_voucher_id}, status = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}`
  await sql`DELETE FROM production_voucher_items_tbl WHERE production_id = ${id}`
  const insertLines = async (lines: LineInput[], role: number) => {
    for (const [index, line] of lines.entries()) {
      const product = products.get(line.item_id)!
      await sql`
        INSERT INTO production_voucher_items_tbl (production_id, role, item_id, unit_id, quantity, price, expiry_date, batch_no, note, source_line, sort_order, cost_share, standard_quantity)
        VALUES (${id}, ${role}, ${line.item_id}, ${product.unit_id}, ${line.quantity}, ${line.price}, ${line.expiry_date}, ${line.batch_no || null},
                ${line.note || null}, ${role === RAW_ROLE ? line.source_line : null}, ${index}, ${line.cost_share}, ${line.standard_quantity})`
    }
  }
  await insertLines(produced, PRODUCED_ROLE)
  await insertLines(rawLines, RAW_ROLE)
  await sql`DELETE FROM production_voucher_workers_tbl WHERE production_id = ${id}`
  for (const [index, row] of workers.entries()) {
    await sql`
      INSERT INTO production_voucher_workers_tbl (production_id, employee_id, worker_name, hours, hourly_rate, sort_order)
      VALUES (${id}, ${row.employee_id}, ${row.worker_name || null}, ${row.hours}, ${row.hourly_rate}, ${index})`
  }
  await sql`DELETE FROM production_voucher_costs_tbl WHERE production_id = ${id}`
  for (const [index, line] of costs.entries()) {
    await sql`
      INSERT INTO production_voucher_costs_tbl (production_id, cost_type, description, amount, source_line, sort_order)
      VALUES (${id}, ${line.cost_type}, ${line.description || null}, ${line.amount}, ${line.source_line}, ${index})`
  }
  return Number(id)
}

export async function deleteProduction(request: NextRequest, id: number) {
  const production = await loadProduction(id)
  if (!production) throw new ProductionError("سند الانتاج غير موجود", 404)
  if (production.status !== PRODUCTION_STATUS.SAVED) throw new ProductionError("سند الانتاج معتمد — ألغِ الترحيل أولاً ثم احذفه")
  await sql`UPDATE production_vouchers_tbl SET status = ${PRODUCTION_SYNCING_STATUS} WHERE id = ${id}`
  try {
    await removeLinked(request, production.branch_id, production.in_voucher_id)
    await removeLinked(request, production.branch_id, production.out_voucher_id)
  } catch (error) {
    await sql`UPDATE production_vouchers_tbl SET status = 1 WHERE id = ${id}`
    throw error
  }
  await sql`DELETE FROM production_vouchers_tbl WHERE id = ${id}`
}

// ───────────── الترحيل وإلغاؤه ─────────────

export async function postProduction(request: NextRequest, id: number, userId: string) {
  const production = await loadProduction(id)
  if (!production) throw new ProductionError("سند الانتاج غير موجود", 404)
  if (production.status !== PRODUCTION_STATUS.SAVED) throw new ProductionError("سند الانتاج معتمد أو ملغى مسبقاً")
  if (!production.produced.length || !production.raw.length) throw new ProductionError("سند الانتاج يحتاج مواد منتجة ومواد خام")
  // الأصناف تُفحص مجدداً (قد تكون تغيّرت منذ الحفظ)
  await validateLines(production.produced, PRODUCED_ROLE)
  await validateLines(production.raw, RAW_ROLE)
  const ctx = await contextFor(request, production, userId)

  await sql`UPDATE production_vouchers_tbl SET status = ${PRODUCTION_SYNCING_STATUS} WHERE id = ${id}`
  let out: Awaited<ReturnType<typeof writeLinked>>
  try {
    // الإخراج أولاً (فحص الرصيد)؛ فشله لا يغيّر شيئاً
    out = await writeLinked(ctx, STOCK_OUT_VCH_TYPE, 2, production.out_voucher_id)
  } catch (error) {
    await sql`UPDATE production_vouchers_tbl SET status = 1 WHERE id = ${id}`
    throw error
  }
  let inn: Awaited<ReturnType<typeof writeLinked>>
  try {
    inn = await writeLinked(ctx, STOCK_IN_VCH_TYPE, 2, production.in_voucher_id)
  } catch (error) {
    // تعويض: سند الإخراج رُحّل ولا يعود "محفوظاً" — يُلغى ويُنشأ بدله سند إخراج محفوظ
    let outId: number | null = null
    try {
      await cancelLinkedVoucher(voucherCaller(request, production.branch_id), out.id)
      outId = (await writeLinked(ctx, STOCK_OUT_VCH_TYPE, 1, null)).id
    } catch { /* يبقى السند بلا سند إخراج — الترحيل التالي ينشئه */ }
    await sql`UPDATE production_vouchers_tbl SET status = 1, out_voucher_id = ${outId} WHERE id = ${id}`
    throw error
  }
  await sql`
    UPDATE production_vouchers_tbl SET status = 2, in_voucher_id = ${inn.id}, out_voucher_id = ${out.id},
      posted_by = ${userId}, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}`
  return { in_voucher: { id: inn.id, vch_code: inn.vch_code }, out_voucher: { id: out.id, vch_code: out.vch_code } }
}

async function cancelLinkedVoucher(call: ReturnType<typeof voucherCaller>, voucherId: number | null) {
  if (!voucherId) return
  const row = ((await sql`SELECT id, vch_type, vch_code, vch_date::date::text AS vch_date, vch_book_id, branch_id, currency_id, rate, status FROM voucher_header_tbl WHERE id = ${voucherId}`) as any[])[0]
  if (!row || Number(row.status) === 3) return
  const date = String(row.vch_date).slice(0, 10)
  const result = await call(updateStockVoucher, {
    id: Number(row.id), vch_type: Number(row.vch_type), vch_code: row.vch_code, vch_date: date, vch_book_id: row.vch_book_id,
    branch_id: row.branch_id, currency_id: row.currency_id, rate: Number(row.rate) || 1, status: 3,
  }, "PUT")
  if (!result.ok) throw new ProductionError(`تعذر إلغاء السند ${row.vch_code}: ${result.body?.error || "خطأ غير معروف"}`)
}

/** إلغاء الترحيل: يُلغي (منطقياً) سندَي الإدخال والإخراج المرحّلين ثم يعيد إنشاءهما محفوظين. ممنوع مع وجود نقل فعّال. */
export async function unpostProduction(request: NextRequest, id: number, userId: string) {
  const production = await loadProduction(id)
  if (!production) throw new ProductionError("سند الانتاج غير موجود", 404)
  // RELEASING = محاولة إلغاء سابقة توقفت بعد إلغاء سند الإدخال — تُستكمل
  if (production.status !== PRODUCTION_STATUS.POSTED && production.status !== PRODUCTION_RELEASING_STATUS) throw new ProductionError("سند الانتاج غير معتمد")
  if (production.transfers.some((transfer: any) => transfer.status === 1 || transfer.status === PRODUCTION_RELEASING_STATUS)) throw new ProductionError("يوجد نقل الى مستودع مرتبط بالسند — ألغِ النقل أولاً")
  const call = voucherCaller(request, production.branch_id)
  await sql`UPDATE production_vouchers_tbl SET status = ${PRODUCTION_RELEASING_STATUS} WHERE id = ${id}`
  try {
    // الإدخال أولاً: إلغاؤه يُرفض إن صُرف المنتَج بعد ترحيله (الرصيد لا يكفي) — فيبقى الخام كما هو
    await cancelLinkedVoucher(call, production.in_voucher_id)
    await cancelLinkedVoucher(call, production.out_voucher_id)
  } catch (error) {
    const stillPosted = ((await sql`SELECT status FROM voucher_header_tbl WHERE id = ${production.in_voucher_id}`) as any[])[0]
    if (stillPosted && Number(stillPosted.status) !== 3) await sql`UPDATE production_vouchers_tbl SET status = 2 WHERE id = ${id}`
    // وإلا: الإدخال أُلغي والإخراج لم يُلغَ — يبقى "قيد الإلغاء" لإعادة المحاولة
    throw error
  }
  // السند يعود "محفوظاً": سندان مرتبطان جديدان محفوظان (المرحّلان لا يعودان لحالة الحفظ)
  let links: Links = { in_voucher_id: null, out_voucher_id: null }
  try {
    links = await syncLinked(await contextFor(request, production, userId), links, 1)
  } catch { /* يبقى بلا سندات مرتبطة — الحفظ أو الترحيل التالي ينشئها */ }
  await sql`
    UPDATE production_vouchers_tbl SET status = 1, in_voucher_id = ${links.in_voucher_id}, out_voucher_id = ${links.out_voucher_id},
      posted_by = NULL, posted_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}`
}

// ───────────── نقل الى مستودع (ارسالية داخلية) ─────────────

export async function transferProduction(request: NextRequest, id: number, data: any, userId: string) {
  const production = await loadProduction(id)
  if (!production) throw new ProductionError("سند الانتاج غير موجود", 404)
  if (production.status !== PRODUCTION_STATUS.POSTED) throw new ProductionError("النقل متاح لسند انتاج معتمد فقط")
  const toStore = await activeWarehouse(data.to_store_id, "المستودع المستلم")
  if (toStore === production.finished_store_id) throw new ProductionError("اختر مستودعاً غير مستودع المواد الجاهزة")
  const requested = new Map<number, number>()
  for (const line of Array.isArray(data.lines) ? data.lines : []) {
    const quantity = round6(Number(line?.quantity))
    if (quantity > 0) requested.set(Number(line.production_item_id), quantity)
  }
  if (!requested.size) throw new ProductionError("أدخل كمية لصنف واحد على الأقل")
  const rows: { line: any; quantity: number }[] = []
  for (const [lineId, quantity] of requested) {
    const line = production.produced.find((row: any) => row.id === lineId)
    if (!line) throw new ProductionError("سطر غير موجود في المواد المنتجة")
    const available = round6(line.quantity - line.transferred)
    if (quantity > available + 0.000001) throw new ProductionError(`${line.product_name}: الكمية أكبر من المتبقي للنقل (${round3(available)})`)
    rows.push({ line, quantity })
  }
  const book = await userBookFor(userId, INTERNAL_DELIVERY_VCH_TYPE, "ارسالية داخلية")
  const call = voucherCaller(request, production.branch_id)
  const today = new Date().toISOString().slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.vch_date || "")) ? String(data.vch_date) : today
  const payload = {
    ...(await voucherHeaderPayload(request, INTERNAL_DELIVERY_VCH_TYPE, book, production.branch_id, date)),
    from_store_id: production.finished_store_id, to_store_id: toStore, status: 2, insert_user: Number(userId) || null,
    note: `نقل من سند انتاج رقم ${production.code}${data.note ? ` — ${String(data.note).slice(0, 200)}` : ""}`,
    items: rows.map(({ line, quantity }) => itemPayload(line, quantity, production.finished_store_id, line)),
  }
  // سجل النقل أولاً (حالة RELEASING) كي لا يُعتبر السند المولَّد "حراً" لحظة إنشائه
  const transfer = ((await sql`
    INSERT INTO production_transfers_tbl (production_id, to_store_id, status, created_by) VALUES (${id}, ${toStore}, ${PRODUCTION_RELEASING_STATUS}, ${userId}) RETURNING id
  `) as any[])[0]
  const result = await call(createStockVoucher, payload, "POST")
  if (!result.ok) {
    await sql`DELETE FROM production_transfers_tbl WHERE id = ${transfer.id}`
    throw new ProductionError(`تعذر إنشاء الإرسالية الداخلية: ${result.body?.error || "خطأ غير معروف"}`)
  }
  for (const { line, quantity } of rows) {
    await sql`INSERT INTO production_transfer_items_tbl (transfer_id, production_item_id, quantity) VALUES (${transfer.id}, ${line.id}, ${quantity})`
  }
  await sql`UPDATE production_transfers_tbl SET status = 1, voucher_id = ${Number(result.body.id)}, vch_code = ${result.body.vch_code} WHERE id = ${transfer.id}`
  return { voucher: { id: Number(result.body.id), vch_code: result.body.vch_code } }
}

export async function cancelProductionTransfer(request: NextRequest, id: number, transferId: number) {
  const production = await loadProduction(id)
  if (!production) throw new ProductionError("سند الانتاج غير موجود", 404)
  const transfer = production.transfers.find((row: any) => row.id === Number(transferId))
  if (!transfer || transfer.status !== 1) throw new ProductionError("النقل غير موجود أو ملغى مسبقاً")
  await sql`UPDATE production_transfers_tbl SET status = ${PRODUCTION_RELEASING_STATUS} WHERE id = ${transfer.id}`
  try {
    await cancelLinkedVoucher(voucherCaller(request, production.branch_id), transfer.voucher_id)
  } catch (error) {
    await sql`UPDATE production_transfers_tbl SET status = 1 WHERE id = ${transfer.id}`
    throw error
  }
  await sql`UPDATE production_transfers_tbl SET status = 3 WHERE id = ${transfer.id}`
}

// ───────────── مراكز العمل والعمال ─────────────

export async function listWorkCenters(includeInactive = false) {
  const rows = (await sql`SELECT id, name, hourly_rate, status FROM production_work_centers_tbl WHERE ${includeInactive} OR status = 1 ORDER BY sort_order, id`) as any[]
  return rows.map((row) => ({ id: Number(row.id), name: row.name, hourly_rate: Number(row.hourly_rate) || 0, active: Number(row.status) === 1 }))
}

/** حفظ قائمة مراكز العمل كاملة: الموجود يُعدَّل، الجديد يُضاف، والمحذوف من القائمة يُعطَّل (قد تكون سندات تشير إليه). */
export async function saveWorkCenters(input: unknown) {
  const rows = (Array.isArray(input) ? input : [])
    .map((row: any, index: number) => ({ id: Number(row?.id) > 0 ? Number(row.id) : null, name: String(row?.name || "").trim().slice(0, 100), hourly_rate: Math.max(0, round6(Number(row?.hourly_rate) || 0)), active: row?.active !== false, index }))
    .filter((row) => row.name)
  const kept: number[] = []
  for (const row of rows) {
    if (row.id) {
      await sql`UPDATE production_work_centers_tbl SET name = ${row.name}, hourly_rate = ${row.hourly_rate}, status = ${row.active ? 1 : 2}, sort_order = ${row.index} WHERE id = ${row.id}`
      kept.push(row.id)
    } else {
      const inserted = (await sql`INSERT INTO production_work_centers_tbl (name, hourly_rate, status, sort_order) VALUES (${row.name}, ${row.hourly_rate}, ${row.active ? 1 : 2}, ${row.index}) RETURNING id`) as any[]
      kept.push(Number(inserted[0].id))
    }
  }
  await sql`UPDATE production_work_centers_tbl SET status = 2 WHERE NOT (id = ANY(${kept}::int[]))`
  return listWorkCenters(true)
}

/**
 * موظفو الفرع (الفعّالون) مع أجر الساعة المقترح = الراتب الأساسي ÷ أيام الشهر ÷ ساعات اليوم (إعدادات الدوام والرواتب)،
 * ولموظف يومي/بالساعة: الأجر ÷ ساعات اليوم أو الأجر نفسه. جداول الموارد البشرية قد لا تكون موجودة ⇐ قائمة فارغة.
 */
export async function productionEmployees(branchIds: number[]) {
  const exists = Boolean(((await sql`SELECT to_regclass('employees_tbl') IS NOT NULL AS ok`) as any[])[0]?.ok)
  if (!exists) return []
  const settings = ((await sql`SELECT id, value FROM system_settings WHERE id IN ('hr_att_month_days', 'hr_att_hours_per_day')`.catch(() => [])) as any[])
  const setting = (key: string, fallback: number) => Number(settings.find((row) => row.id === key)?.value) > 0 ? Number(settings.find((row) => row.id === key)?.value) : fallback
  const monthDays = setting("hr_att_month_days", 30)
  const hoursPerDay = setting("hr_att_hours_per_day", 8)
  const rows = (await sql`
    SELECT id, employee_code, full_name, COALESCE(salary_type, 'monthly') AS salary_type, COALESCE(basic_salary, 0) AS basic_salary
    FROM employees_tbl
    WHERE COALESCE(status, 1) = 1 AND (branch_id IS NULL OR branch_id = ANY(${branchIds}::int[]))
    ORDER BY full_name
    LIMIT 1000
  `.catch(() => [])) as any[]
  return rows.map((row) => {
    const salary = Number(row.basic_salary) || 0
    const type = String(row.salary_type)
    const hourly = type === "hourly" ? salary : type === "daily" ? salary / hoursPerDay : salary / monthDays / hoursPerDay
    return { id: Number(row.id), code: row.employee_code || "", name: row.full_name || "", hourly_rate: Math.round(hourly * 1000) / 1000 }
  })
}
