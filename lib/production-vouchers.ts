import { NextRequest } from "next/server"
import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getBaseCurrencyId } from "@/lib/auto-journals"
import { lotBalances, normalizeExpiry } from "@/lib/stock-lots"
import { PRODUCTION_RELEASING_STATUS, PRODUCTION_SYNCING_STATUS } from "@/lib/production-links"
import { withBranchSymbol } from "@/lib/branch-symbol"
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
export async function productionProductsInfo(productIds: number[]) {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))].slice(0, 200)
  if (!ids.length) return []
  const hasTable = Boolean(((await sql`SELECT to_regclass('product_manufacturing_components') IS NOT NULL AS ok`) as any[])[0]?.ok)
  const rows = hasTable ? (await sql`SELECT product_id, component_id, quantity FROM product_manufacturing_components WHERE product_id = ANY(${ids}::int[]) ORDER BY id`) as any[] : []
  const products = await loadProductionProducts([...ids, ...rows.map((row) => Number(row.component_id))])
  return ids
    .filter((id) => products.has(id))
    .map((id) => ({
      product: products.get(id)!,
      components: rows
        .filter((row) => Number(row.product_id) === id)
        .map((row) => ({ product: products.get(Number(row.component_id)), per_unit: Number(row.quantity || 0) }))
        .filter((row): row is { product: ProductionProduct; per_unit: number } => Boolean(row.product) && row.per_unit > 0),
    }))
}

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
      vin.vch_code AS in_vch_code, vout.vch_code AS out_vch_code,
      COALESCE((SELECT COALESCE(NULLIF(us.full_name, ''), us.username) FROM user_settings us WHERE us.user_id::text = p.created_by LIMIT 1), p.created_by) AS created_by_name
    FROM production_vouchers_tbl p
    LEFT JOIN branches b ON b.id = p.branch_id
    LEFT JOIN warehouses wf ON wf.id = p.finished_store_id
    LEFT JOIN warehouses wr ON wr.id = p.raw_store_id
    LEFT JOIN voucher_header_tbl vin ON vin.id = p.in_voucher_id
    LEFT JOIN voucher_header_tbl vout ON vout.id = p.out_voucher_id
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
  const shape = (row: any) => ({
    id: Number(row.id), role: Number(row.role), item_id: Number(row.item_id), product_code: row.product_code || "", product_name: row.product_name || "",
    unit_id: row.unit_id == null ? null : Number(row.unit_id), unit_name: row.unit_name || "", quantity: Number(row.quantity), price: Number(row.price),
    expiry_date: normalizeExpiry(row.expiry_date), batch_no: row.batch_no || "", note: row.note || "", source_line: row.source_line == null ? null : Number(row.source_line),
    transferred: Number(row.transferred || 0),
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
  }
}

// ───────────── الحفظ ─────────────

type LineInput = { item_id: number; quantity: number; price: number; expiry_date: string | null; batch_no: string; note: string; source_line: number | null }

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
  const produced = await validateLines(data.produced, PRODUCED_ROLE)
  const rawLines = await validateLines(data.raw, RAW_ROLE)
  if (!produced.length) throw new ProductionError("أضف صنفاً واحداً على الأقل في المواد المنتجة")
  if (!rawLines.length) throw new ProductionError("أضف صنفاً واحداً على الأقل في المواد الخام")
  const products = await loadProductionProducts([...produced, ...rawLines].map((line) => line.item_id))
  const note = String(data.note || "").trim().slice(0, 1000) || null
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
    UPDATE production_vouchers_tbl SET vch_date = ${vchDate}, branch_id = ${branchId}, finished_store_id = ${finished}, raw_store_id = ${raw}, note = ${note},
      in_voucher_id = ${links.in_voucher_id}, out_voucher_id = ${links.out_voucher_id}, status = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}`
  await sql`DELETE FROM production_voucher_items_tbl WHERE production_id = ${id}`
  const insertLines = async (lines: LineInput[], role: number) => {
    for (const [index, line] of lines.entries()) {
      const product = products.get(line.item_id)!
      await sql`
        INSERT INTO production_voucher_items_tbl (production_id, role, item_id, unit_id, quantity, price, expiry_date, batch_no, note, source_line, sort_order)
        VALUES (${id}, ${role}, ${line.item_id}, ${product.unit_id}, ${line.quantity}, ${line.price}, ${line.expiry_date}, ${line.batch_no || null},
                ${line.note || null}, ${role === RAW_ROLE ? line.source_line : null}, ${index})`
    }
  }
  await insertLines(produced, PRODUCED_ROLE)
  await insertLines(rawLines, RAW_ROLE)
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
