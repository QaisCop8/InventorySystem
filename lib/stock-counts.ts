import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"
import { requirePermissionByName } from "@/lib/tenant-auth"
import { getProductBalances } from "@/lib/item-inventory-reports"
import { ensureItemSerialTables } from "@/lib/item-serials"
import { lotBalances, lotKey, normalizeExpiry } from "@/lib/stock-lots"
import { dimensionsLabel, isMeasuredProduct, quantityFromMeasurement } from "@/lib/measurement-formula"
import { runSchemaOnce } from "@/lib/schema-once"
import { ensureProductUnitRoleColumns } from "@/lib/product-unit-roles-schema"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// جرد المخازن (Physical inventory count) — على نمط أنظمة ERP العالمية (SAP Physical Inventory،
// Odoo Inventory Adjustments، Dynamics Counting Journals):
//   1) إنشاء وثيقة جرد لفرع + مستودع وتاريخ قطع (cutoff) ⇐ لقطة الكمية الدفترية بذلك التاريخ، من
//      حركات ذلك الفرع فقط.
//   2) قيد الجرد: إدخال الكميات المجرودة (يدوياً / باركود / Excel) — اختيارياً "جرد أعمى" يُخفي الدفترية.
//   3) إنهاء الجرد ⇐ مراجعة الفروقات وقيمتها (تُعاد الكمية الدفترية بتاريخ القطع لالتقاط سندات متأخرة).
//   4) الترحيل ⇐ سند ادخال بضاعة للزيادات + سند اخراج بضاعة للعجز، بتاريخ القطع، عبر مسار سندات المخزون
//      نفسه (نفس التحقق: الصلاحيات، فترة العمل، توفر الكمية، الأرقام التسلسلية، الأثر المخزني).
//
// وحدة العدّ (سطر الجرد) حسب ما يميّز الصنف فعلياً بالمخزن:
//   • صنف عادي ⇐ سطر واحد.
//   • صلاحية / رقم تشغيلي / متغيرات (خصائص) ⇐ سطر لكل دفعة (lot) — الدفعات المكتشفة بالرف وليست
//     بالدفتر تُضاف أثناء الجرد (manual).
//   • نوع قياس غير عادي (طول/عرض/ارتفاع/عدد كما في فاتورة المبيعات) ⇐ سطر لكل مقاس، ويُعدّ "عدد القطع"
//     وتُحسب الكمية بمعادلة نوع القياس.
//   • أرقام تسلسلية ⇐ سطر للصنف + قائمة سيريالات (الدفترية الموجودة بالمستودع بتاريخ القطع، والمجرودة
//     فعلياً) — الكمية الدفترية = عدد السيريالات الدفترية، والمجرودة = عدد المسحوبة.
// الحركات بعد تاريخ القطع لا تؤثر على الفرق (لقطة بتاريخ، لا تجميد للمستودع).
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const STOCK_COUNT_STATUS = { COUNTING: 1, FINISHED: 2, POSTED: 3, CANCELLED: 4 } as const
export const STOCK_COUNT_STATUS_NAME: Record<number, string> = { 1: "قيد الجرد", 2: "منتهي — مراجعة", 3: "معتمد", 4: "ملغى" }

export const STOCK_COUNT_PERMISSIONS = {
  view: "استعلام جرد المخازن",
  create: "إضافة جرد المخازن",
  edit: "تعديل جرد المخازن",
  post: "ترحيل جرد المخازن",
} as const
export type StockCountAction = keyof typeof STOCK_COUNT_PERMISSIONS
const PERMISSION_CATEGORY = "جرد المخازن"

const preparedDatabases = new Set<string>()

export async function ensureStockCountTables() { return runSchemaOnce("lib/stock-counts.ts#ensureStockCountTables", async () => {
  const databaseName = await resolveCurrentDbName()
  if (preparedDatabases.has(databaseName)) return
  await sql`
    CREATE TABLE IF NOT EXISTS stock_counts (
      id SERIAL PRIMARY KEY,
      count_no VARCHAR(20),
      warehouse_id INTEGER NOT NULL,
      branch_id INTEGER,
      count_date DATE NOT NULL,
      status SMALLINT NOT NULL DEFAULT 1,
      blind BOOLEAN NOT NULL DEFAULT false,
      include_zero BOOLEAN NOT NULL DEFAULT false,
      notes TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP,
      posted_at TIMESTAMP,
      posted_by TEXT,
      in_voucher_id INTEGER,
      out_voucher_id INTEGER
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS stock_count_items (
      id SERIAL PRIMARY KEY,
      count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      product_code VARCHAR(60),
      product_name TEXT,
      barcode VARCHAR(100),
      unit_id INTEGER,
      unit_name VARCHAR(100),
      system_qty NUMERIC(20,6) NOT NULL DEFAULT 0,
      counted_qty NUMERIC(20,6),
      unit_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
      has_serial BOOLEAN NOT NULL DEFAULT false,
      has_expiry BOOLEAN NOT NULL DEFAULT false,
      has_batch BOOLEAN NOT NULL DEFAULT false,
      note TEXT,
      counted_by TEXT,
      counted_at TIMESTAMP
    )
  `
  // تفصيل الدفعة/المقاس/المتغير — سطر لكل (صنف، lot_key) بدل سطر لكل صنف
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS lot_key TEXT NOT NULL DEFAULT ''`
  // معامل وحدة الجرد (الكمية الدفترية/التكلفة محفوظة بها) — 1 = الوحدة الرئيسية
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS unit_factor DOUBLE PRECISION NOT NULL DEFAULT 1`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS expiry_date DATE`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS batch_no VARCHAR(60)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS attribute_value_ids INTEGER[] NOT NULL DEFAULT '{}'`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS variant_label TEXT`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS measurment_id INTEGER NOT NULL DEFAULT 1`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS length NUMERIC(20,6)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS width NUMERIC(20,6)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS height NUMERIC(20,6)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS system_pieces NUMERIC(20,6)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS counted_pieces NUMERIC(20,6)`
  await sql`ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false`
  await sql`ALTER TABLE stock_count_items DROP CONSTRAINT IF EXISTS stock_count_items_count_id_item_id_key`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_count_items_lot_unique ON stock_count_items(count_id, item_id, lot_key)`
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON stock_count_items(count_id)`
  await sql`
    CREATE TABLE IF NOT EXISTS stock_count_serials (
      id SERIAL PRIMARY KEY,
      count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      line_id INTEGER NOT NULL REFERENCES stock_count_items(id) ON DELETE CASCADE,
      serial TEXT NOT NULL,
      in_system BOOLEAN NOT NULL DEFAULT false,
      counted BOOLEAN NOT NULL DEFAULT false,
      counted_at TIMESTAMP,
      UNIQUE (line_id, serial)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_count_serials_count ON stock_count_serials(count_id)`

  // جلسات الجرد: عدة مستخدمين يعدّون نفس الوثيقة بالتوازي — لكل مستخدم جلسة مفتوحة واحدة بالوثيقة،
  // وكمية السطر المجرودة = مجموع كميات كل الجلسات (stock_count_items.counted_qty مجمّع يُعاد حسابه).
  await sql`
    CREATE TABLE IF NOT EXISTS stock_count_sessions (
      id SERIAL PRIMARY KEY,
      count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      session_no INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      status SMALLINT NOT NULL DEFAULT 1,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP,
      finished_by TEXT,
      UNIQUE (count_id, session_no)
    )
  `
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_count_sessions_one_open ON stock_count_sessions(count_id, user_id) WHERE status = 1`
  await sql`
    CREATE TABLE IF NOT EXISTS stock_count_session_lines (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
      count_id INTEGER NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      line_id INTEGER NOT NULL REFERENCES stock_count_items(id) ON DELETE CASCADE,
      counted_qty NUMERIC(20,6),
      counted_pieces NUMERIC(20,6),
      note TEXT,
      counted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_id, line_id)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_count_session_lines_count ON stock_count_session_lines(count_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_stock_count_session_lines_line ON stock_count_session_lines(line_id)`
  await sql`ALTER TABLE stock_count_serials ADD COLUMN IF NOT EXISTS session_id INTEGER`
  // وثائق مفتوحة من قبل الجلسات: كمياتها المجرودة تُنقل لجلسة منتهية رقم 1 كي لا تضيع عند إعادة التجميع
  const legacy = (await sql`
    SELECT c.id, c.created_by FROM stock_counts c
    WHERE c.status IN (1, 2)
      AND NOT EXISTS (SELECT 1 FROM stock_count_sessions s WHERE s.count_id = c.id)
      AND EXISTS (SELECT 1 FROM stock_count_items i WHERE i.count_id = c.id AND (i.counted_qty IS NOT NULL OR COALESCE(i.note, '') <> ''))
  `) as any[]
  for (const count of legacy) {
    const created = (await sql`
      INSERT INTO stock_count_sessions (count_id, session_no, user_id, user_name, status, finished_at)
      VALUES (${Number(count.id)}, 1, ${String(count.created_by || "0")}, 'جلسة سابقة', 2, CURRENT_TIMESTAMP)
      RETURNING id
    `) as any[]
    const sessionId = Number(created[0].id)
    await sql`
      INSERT INTO stock_count_session_lines (session_id, count_id, line_id, counted_qty, counted_pieces, note, counted_at)
      SELECT ${sessionId}, i.count_id, i.id, CASE WHEN i.has_serial THEN NULL ELSE i.counted_qty END, i.counted_pieces, NULLIF(i.note, ''), COALESCE(i.counted_at, CURRENT_TIMESTAMP)
      FROM stock_count_items i
      WHERE i.count_id = ${Number(count.id)} AND (i.counted_qty IS NOT NULL OR COALESCE(i.note, '') <> '')
    `
    await sql`UPDATE stock_count_serials SET session_id = ${sessionId} WHERE count_id = ${Number(count.id)} AND counted AND session_id IS NULL`
  }
  preparedDatabases.add(databaseName)
}) }

// صلاحيات الجرد تُعرَّف ذاتياً (نفس أسلوب ensurePosCashierPermission) — ممنوحة لدور "مدير" ولمن له
// "جميع الصلاحيات"، وتظهر في شاشة الصلاحيات ضمن تصنيف "جرد المخازن".
async function ensureStockCountPermission(name: string) {
  await ensurePermissionTables(await resolveCurrentDbName())
  const categoryRows = await sql`
    INSERT INTO access_category (name) SELECT ${PERMISSION_CATEGORY}
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = ${PERMISSION_CATEGORY})
    RETURNING id
  `
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name = ${PERMISSION_CATEGORY} ORDER BY id LIMIT 1`)[0]
  const inserted = await sql`
    INSERT INTO access_list (name, category_id) SELECT ${name}, ${Number(category.id)}
    WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE LOWER(BTRIM(name)) = LOWER(BTRIM(${name}))) ON CONFLICT DO NOTHING
    RETURNING id
  `
  if (!inserted[0]) return
  const accessId = Number(inserted[0].id)
  await sql`
    INSERT INTO role_permissions (role_id, access_id, is_granted)
    SELECT id, ${accessId}, TRUE FROM job_roles WHERE LOWER(name) = LOWER('مدير')
    ON CONFLICT (role_id, access_id) DO NOTHING
  `
  await sql`
    INSERT INTO user_access (user_id, access_id, is_granted)
    SELECT user_id, ${accessId}, TRUE FROM user_settings WHERE permissions::text LIKE '%جميع الصلاحيات%'
    ON CONFLICT (user_id, access_id) DO NOTHING
  `
}

export async function requireStockCountPermission(request: NextRequest, action: StockCountAction) {
  await ensureStockCountTables()
  for (const name of Object.values(STOCK_COUNT_PERMISSIONS)) await ensureStockCountPermission(name)
  return requirePermissionByName(request, STOCK_COUNT_PERMISSIONS[action])
}

export const jsonError = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const branchIdsOf = (branchId: number | null | undefined) => (Number(branchId) > 0 ? [Number(branchId)] : [])

export type CountScope = { warehouseId: number; branchId: number | null; countDate: string }

/** الكمية الدفترية (بالوحدة الرئيسية) ومتوسط التكلفة لكل صنف في مستودع (وفرع) بتاريخ القطع — من السندات المرحّلة. */
export async function warehouseBalancesAt(scope: CountScope, productIds: number[] = []) {
  const balances = await getProductBalances(1, scope.countDate, 0, "", { warehouseIds: [scope.warehouseId], branchIds: branchIdsOf(scope.branchId), productIds })
  return new Map<number, { balance: number; average_cost: number; row: any }>(
    (balances as any[]).map((row) => [Number(row.id), { balance: Number(row.balance || 0), average_cost: Number(row.average_cost || 0), row }]),
  )
}

export type ProductMeta = {
  id: number; product_code: string; product_name: string; barcode: string; unit_id: number | null; unit_name: string
  /** معامل وحدة الجرد إلى الوحدة الرئيسية (1 إن لم تُحدَّد وحدة جرد) */
  unit_factor: number
  has_serial: boolean; has_expiry: boolean; has_batch: boolean; has_variants: boolean
  measurment_id: number; length: number; width: number; density: number
}

export async function loadProductMeta(filter: { productIds?: number[]; categoryIds?: number[]; code?: string } = {}): Promise<ProductMeta[]> {
  const productIds = filter.productIds || []
  const categoryIds = filter.categoryIds || []
  const code = String(filter.code || "").trim()
  const variantsTable = Boolean(((await sql`SELECT to_regclass('product_atrributes_values_tbl') IS NOT NULL AS ok`) as any[])[0]?.ok)
  await ensureProductUnitRoleColumns()
  const rows = await sql`
    SELECT p.id, p.product_code, p.product_name, p.barcode, p.measurment_unit AS unit_id, u.unit_name,
      cu.unit_id AS count_unit_id, cuu.unit_name AS count_unit_name, cu.to_main_qnty AS count_unit_factor,
      COALESCE(p.serial_tracking, false) AS has_serial,
      COALESCE((to_jsonb(p)->>'has_expiry_date')::boolean, false) AS has_expiry,
      COALESCE((to_jsonb(p)->>'has_batch_number')::boolean, false) AS has_batch,
      COALESCE(NULLIF(to_jsonb(p)->>'measurment_id', '')::int, 1) AS measurment_id,
      COALESCE(NULLIF(to_jsonb(p)->>'length', '')::numeric, 0) AS length,
      COALESCE(NULLIF(to_jsonb(p)->>'width', '')::numeric, 0) AS width,
      COALESCE(NULLIF(to_jsonb(p)->>'density', '')::numeric, 0) AS density
    FROM products p
    LEFT JOIN units u ON u.id = p.measurment_unit
    -- وحدة الجرد المؤشَّرة في تعريف الصنف (تبويب الوحدات)
    LEFT JOIN LATERAL (SELECT pu.unit_id, pu.to_main_qnty FROM product_units pu WHERE pu.product_id = p.id AND pu.is_stock_count_unit ORDER BY pu.id LIMIT 1) cu ON true
    LEFT JOIN units cuu ON cuu.id = cu.unit_id
    WHERE COALESCE(p.deleted, false) = false AND COALESCE(p.status, 1) <> 3 AND COALESCE(p.type, 1) = 1
      AND (${productIds.length} = 0 OR p.id = ANY(${productIds}::int[]))
      AND (${categoryIds.length} = 0 OR p.category_id = ANY(${categoryIds}::int[]))
      AND (${code} = '' OR UPPER(p.product_code) = UPPER(${code}) OR p.barcode = ${code}
        OR EXISTS (SELECT 1 FROM product_units pu WHERE pu.product_id = p.id AND (to_jsonb(pu)->>'barcode') = ${code}))
    ORDER BY p.product_code, p.product_name
  `
  const withVariants = new Set<number>()
  if (variantsTable && (rows as any[]).length) {
    const ids = (rows as any[]).map((row) => Number(row.id))
    for (const row of (await sql`SELECT DISTINCT product_id FROM product_atrributes_values_tbl WHERE product_id = ANY(${ids}::int[])`) as any[]) {
      withVariants.add(Number(row.product_id))
    }
  }
  return (rows as any[]).map((row) => {
    // وحدة الجرد: للأصناف العادية/الدفعات فقط — السيريال يُعدّ بالقطعة والمقاسات بمعادلة القياس (الوحدة الرئيسية)
    const factor = Number(row.count_unit_factor)
    const useCountUnit = row.count_unit_id != null && factor > 0 && !row.has_serial && !isMeasuredProduct(Number(row.measurment_id || 1))
    return {
    id: Number(row.id),
    product_code: row.product_code || "",
    product_name: row.product_name || "",
    barcode: row.barcode || "",
    unit_id: useCountUnit ? Number(row.count_unit_id) : row.unit_id == null ? null : Number(row.unit_id),
    unit_name: (useCountUnit ? row.count_unit_name : row.unit_name) || "",
    unit_factor: useCountUnit ? factor : 1,
    has_serial: Boolean(row.has_serial),
    has_expiry: Boolean(row.has_expiry),
    has_batch: Boolean(row.has_batch),
    has_variants: withVariants.has(Number(row.id)),
    measurment_id: Number(row.measurment_id || 1),
    length: Number(row.length || 0),
    width: Number(row.width || 0),
    density: Number(row.density || 0),
  }})
}

/** الأصناف التي تُعدّ بتفصيل دفعات (صلاحية/رقم تشغيلي/متغيرات/مقاسات) — السيريال له مسار خاص. */
const isLotProduct = (product: ProductMeta) =>
  !product.has_serial && (product.has_expiry || product.has_batch || product.has_variants || isMeasuredProduct(product.measurment_id))

/** "اللون: أحمر، المقاس: L" لقائمة معرّفات قيم الخصائص. */
export async function variantLabels(valueIds: number[]) {
  const ids = [...new Set(valueIds.filter((id) => id > 0))]
  const map = new Map<number, { attribute: string; value: string }>()
  if (!ids.length) return map
  const rows = await sql`
    SELECT pav.id, a.name AS attribute_name, av.name AS value_name
    FROM product_atrributes_values_tbl pav
    JOIN attributes_tbl a ON a.id = pav.attr_id
    JOIN attribute_values_tbl av ON av.id = pav.value_id
    WHERE pav.id = ANY(${ids}::bigint[])
  `
  for (const row of rows as any[]) map.set(Number(row.id), { attribute: row.attribute_name, value: row.value_name })
  return map
}

const labelFor = (ids: number[], labels: Map<number, { attribute: string; value: string }>) =>
  ids.map((id) => labels.get(id)).filter(Boolean).map((entry) => `${entry!.attribute}: ${entry!.value}`).join("، ")

/** السيريالات الموجودة دفترياً بالمستودع بتاريخ القطع (آخر حركة مرحّلة للسيريال حتى التاريخ أدخلته لهذا المستودع، وضمن الفرع). */
export async function systemSerialsAt(scope: CountScope, productIds: number[]) {
  await ensureItemSerialTables()
  if (!productIds.length) return new Map<number, string[]>()
  const branchId = Number(scope.branchId) > 0 ? Number(scope.branchId) : null
  const rows = await sql`
    SELECT s.item_id, s.serial
    FROM items_serials_tbl s
    JOIN LATERAL (
      SELECT vis.in_stock, vis.store_id, vh.branch_id
      FROM vouchers_items_serials_tbl vis
      JOIN voucher_header_tbl vh ON vh.id = vis.voucher_id
      WHERE vis.item_serial_id = s.id AND COALESCE(vh.status, 1) <> 3 AND vh.vch_status = 2
        AND vh.vch_date::date <= ${scope.countDate}::date
      ORDER BY vis.voucher_id DESC, vis.id DESC LIMIT 1
    ) last ON true
    WHERE s.item_id = ANY(${productIds}::int[])
      AND last.in_stock = true AND last.store_id = ${scope.warehouseId}
      AND (${branchId}::int IS NULL OR last.branch_id = ${branchId}::int)
    ORDER BY s.serial
  `
  const map = new Map<number, string[]>()
  for (const row of rows as any[]) {
    const list = map.get(Number(row.item_id)) || []
    list.push(String(row.serial))
    map.set(Number(row.item_id), list)
  }
  return map
}

type LineInput = {
  product: ProductMeta
  lot_key: string
  system_qty: number
  unit_cost: number
  expiry_date?: string | null
  batch_no?: string | null
  attribute_value_ids?: number[]
  variant_label?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  system_pieces?: number | null
  manual?: boolean
}

export async function insertCountLine(countId: number, line: LineInput) {
  const product = line.product
  // system_qty/unit_cost تصل بالوحدة الرئيسية ⇐ تُحفظ بوحدة الجرد
  const factor = product.unit_factor > 0 ? product.unit_factor : 1
  const rows = await sql`
    INSERT INTO stock_count_items (count_id, item_id, product_code, product_name, barcode, unit_id, unit_name, unit_factor,
      system_qty, unit_cost, has_serial, has_expiry, has_batch, has_variants, measurment_id,
      lot_key, expiry_date, batch_no, attribute_value_ids, variant_label, length, width, height, system_pieces, manual)
    VALUES (${countId}, ${product.id}, ${product.product_code}, ${product.product_name}, ${product.barcode},
      ${product.unit_id}, ${product.unit_name}, ${factor}, ${round6(line.system_qty / factor)}, ${round6(line.unit_cost * factor)},
      ${product.has_serial}, ${product.has_expiry}, ${product.has_batch}, ${product.has_variants}, ${product.measurment_id},
      ${line.lot_key}, ${line.expiry_date || null}, ${line.batch_no || null}, ${line.attribute_value_ids || []}::int[], ${line.variant_label || null},
      ${line.length ?? null}, ${line.width ?? null}, ${line.height ?? null}, ${line.system_pieces ?? null}, ${Boolean(line.manual)})
    ON CONFLICT (count_id, item_id, lot_key) DO NOTHING
    RETURNING id
  `
  return (rows as any[])[0] ? Number((rows as any[])[0].id) : null
}

/** أسطر الدفترية المتوقعة (صنف/دفعة) بتاريخ القطع لمجموعة أصناف — مشتركة بين التوليد والتحديث. */
async function expectedLines(scope: CountScope, products: ProductMeta[]) {
  const ids = products.map((product) => product.id)
  const balances = await warehouseBalancesAt(scope, ids)
  const lotProducts = products.filter(isLotProduct)
  const measuredIds = new Set(lotProducts.filter((product) => isMeasuredProduct(product.measurment_id)).map((product) => product.id))
  const lots = lotProducts.length
    ? await lotBalances({
        warehouseId: scope.warehouseId,
        branchId: scope.branchId,
        toDate: scope.countDate,
        productIds: lotProducts.map((product) => product.id),
        mode: "posted",
        splitDimensions: measuredIds.size > 0,
      })
    : []
  const labels = await variantLabels(lots.flatMap((lot) => lot.attribute_value_ids))
  const serials = await systemSerialsAt(scope, products.filter((product) => product.has_serial).map((product) => product.id))

  const result: Array<LineInput & { serials?: string[] }> = []
  for (const product of products) {
    const balance = balances.get(product.id)
    const unitCost = balance?.average_cost ?? 0
    if (product.has_serial) {
      const list = serials.get(product.id) || []
      result.push({ product, lot_key: "", system_qty: list.length, unit_cost: unitCost, serials: list })
      continue
    }
    if (!isLotProduct(product)) {
      result.push({ product, lot_key: "", system_qty: balance?.balance ?? 0, unit_cost: unitCost })
      continue
    }
    const measured = measuredIds.has(product.id)
    for (const lot of lots.filter((entry) => entry.item_id === product.id)) {
      const dims = measured ? { length: lot.length, width: lot.width, height: lot.height } : { length: null, width: null, height: null }
      result.push({
        product,
        lot_key: lotKey({ ...lot, ...dims }),
        system_qty: lot.quantity,
        unit_cost: unitCost,
        expiry_date: lot.expiry_date,
        batch_no: lot.batch_no,
        attribute_value_ids: lot.attribute_value_ids,
        variant_label: labelFor(lot.attribute_value_ids, labels),
        ...dims,
        system_pieces: measured ? lot.pieces : null,
      })
    }
  }
  return result
}

/** يبني أسطر وثيقة الجرد من أرصدة المستودع (والفرع) بتاريخ القطع. */
export async function generateCountLines(countId: number, scope: CountScope, includeZero: boolean, categoryIds: number[] = []) {
  const products = await loadProductMeta({ categoryIds })
  const expected = await expectedLines(scope, products)
  const covered = new Set<number>()
  let inserted = 0
  for (const line of expected) {
    const zero = Math.abs(line.system_qty) < 0.000001 && !(line.serials && line.serials.length)
    if (zero && !includeZero) continue
    const lineId = await insertCountLine(countId, line)
    if (!lineId) continue
    covered.add(line.product.id)
    inserted++
    for (const serial of line.serials || []) {
      await sql`INSERT INTO stock_count_serials (count_id, line_id, serial, in_system) VALUES (${countId}, ${lineId}, ${serial}, true) ON CONFLICT (line_id, serial) DO NOTHING`
    }
  }
  // أصناف دفعات بلا أي دفعة برصيد (تضمين الأصفار) ⇐ سطر فارغ يُعدّ عليه أو تُضاف دفعاته أثناء الجرد
  if (includeZero) {
    for (const product of products.filter((entry) => isLotProduct(entry) && !covered.has(entry.id))) {
      if (await insertCountLine(countId, { product, lot_key: "", system_qty: 0, unit_cost: 0 })) inserted++
    }
  }
  return inserted
}

/**
 * يُعيد الكمية الدفترية بتاريخ القطع لكل أسطر الوثيقة (يلتقط سندات أُدخلت بتاريخ سابق للقطع بعد الإنشاء):
 * دفعات جديدة ظهرت دفترياً تُضاف كأسطر، ودفعات اختفت تصبح دفتريتها صفراً، وسيريالات دفترية تُحدَّث.
 */
export async function refreshSystemQuantities(countId: number, scope: CountScope) {
  const lines = (await sql`SELECT id, item_id, lot_key, unit_factor FROM stock_count_items WHERE count_id = ${countId}`) as any[]
  if (!lines.length) return
  const productIds = [...new Set(lines.map((line) => Number(line.item_id)))]
  const products = await loadProductMeta({ productIds })
  const expected = await expectedLines(scope, products)
  const expectedByKey = new Map(expected.map((line) => [`${line.product.id}#${line.lot_key}`, line]))

  for (const line of lines) {
    const key = `${Number(line.item_id)}#${line.lot_key}`
    const match = expectedByKey.get(key)
    expectedByKey.delete(key)
    const product = products.find((entry) => entry.id === Number(line.item_id))
    const factor = Number(line.unit_factor) > 0 ? Number(line.unit_factor) : 1
    await sql`
      UPDATE stock_count_items
      SET system_qty = ${round6((match?.system_qty ?? 0) / factor)}, system_pieces = ${match?.system_pieces ?? (product && isMeasuredProduct(product.measurment_id) ? 0 : null)},
        unit_cost = ${round6((match?.unit_cost ?? 0) * factor)}
      WHERE id = ${Number(line.id)}
    `
    if (product?.has_serial) {
      const list = match?.serials || []
      await sql`UPDATE stock_count_serials SET in_system = (serial = ANY(${list}::text[])) WHERE line_id = ${Number(line.id)}`
      for (const serial of list) {
        await sql`INSERT INTO stock_count_serials (count_id, line_id, serial, in_system) VALUES (${countId}, ${Number(line.id)}, ${serial}, true) ON CONFLICT (line_id, serial) DO UPDATE SET in_system = true`
      }
      await sql`DELETE FROM stock_count_serials WHERE line_id = ${Number(line.id)} AND in_system = false AND counted = false`
      await sql`UPDATE stock_count_items SET system_qty = ${list.length} WHERE id = ${Number(line.id)}`
    }
  }
  // دفعات دفترية جديدة لأصناف الوثيقة لم يكن لها سطر
  for (const line of expectedByKey.values()) {
    if (Math.abs(line.system_qty) < 0.000001) continue
    await insertCountLine(countId, line)
  }
}

export async function loadCountHeader(countId: number) {
  const rows = await sql`
    SELECT c.*, w.warehouse_name, b.branch_name,
      inv.vch_code AS in_voucher_code, outv.vch_code AS out_voucher_code
    FROM stock_counts c
    LEFT JOIN warehouses w ON w.id = c.warehouse_id
    LEFT JOIN branches b ON b.id = c.branch_id
    LEFT JOIN voucher_header_tbl inv ON inv.id = c.in_voucher_id
    LEFT JOIN voucher_header_tbl outv ON outv.id = c.out_voucher_id
    WHERE c.id = ${countId}
  `
  return (rows as any[])[0] || null
}

export const scopeOf = (header: any): CountScope => ({
  warehouseId: Number(header.warehouse_id),
  branchId: Number(header.branch_id) > 0 ? Number(header.branch_id) : null,
  countDate: String(header.count_date instanceof Date ? header.count_date.toISOString() : header.count_date).slice(0, 10),
})

/** الكمية لسطر مقاس من عدد القطع (معادلة نوع القياس — أنواع 9/10 تستخدم طول/عرض/كثافة الصنف نفسه). */
export const quantityFromPieces = (product: ProductMeta, line: any, pieces: number | null) =>
  pieces == null ? null : round6(quantityFromMeasurement(product, { length: line.length, width: line.width, height: line.height, count: pieces }))

export const lineDifference = (line: any, uncounted: "skip" | "zero" = "skip") => {
  const counted = line.counted_qty == null ? (uncounted === "zero" ? 0 : null) : Number(line.counted_qty)
  if (counted == null) return 0
  return round6(counted - Number(line.system_qty || 0))
}

export const lineLotLabel = (line: any) =>
  [
    line.variant_label,
    normalizeExpiry(line.expiry_date) ? `صلاحية ${normalizeExpiry(line.expiry_date)}` : "",
    line.batch_no ? `دفعة ${line.batch_no}` : "",
    dimensionsLabel(line) ? `مقاس ${dimensionsLabel(line)}` : "",
  ].filter(Boolean).join(" — ")

// ── جلسات الجرد ──────────────────────────────────────────────────────────────────────────────
export const STOCK_COUNT_SESSION_STATUS = { OPEN: 1, FINISHED: 2, CANCELLED: 3 } as const
export const STOCK_COUNT_SESSION_STATUS_NAME: Record<number, string> = { 1: "مفتوحة", 2: "منتهية", 3: "ملغاة" }

export type CountSessionUser = { user_id: string; username?: string; full_name?: string }
const sessionUserName = (user: CountSessionUser) => String(user.full_name || user.username || user.user_id || "")

/** الجلسة المفتوحة للمستخدم في الوثيقة (أو null). */
export async function openSessionOf(countId: number, userId: string) {
  const rows = (await sql`
    SELECT id, session_no FROM stock_count_sessions WHERE count_id = ${countId} AND user_id = ${userId} AND status = 1 LIMIT 1
  `) as any[]
  return rows[0] ? { id: Number(rows[0].id), session_no: Number(rows[0].session_no) } : null
}

/** جلسة المستخدم المفتوحة، أو جلسة جديدة برقم تالٍ بالوثيقة عند أول إدخال له. */
export async function ensureOpenSession(countId: number, user: CountSessionUser) {
  const userId = String(user.user_id)
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await openSessionOf(countId, userId)
    if (existing) return existing
    try {
      const rows = (await sql`
        INSERT INTO stock_count_sessions (count_id, session_no, user_id, user_name)
        SELECT ${countId}, COALESCE(MAX(session_no), 0) + 1, ${userId}, ${sessionUserName(user)}
        FROM stock_count_sessions WHERE count_id = ${countId}
        RETURNING id, session_no
      `) as any[]
      return { id: Number(rows[0].id), session_no: Number(rows[0].session_no) }
    } catch (error: any) {
      // سباق: مستخدمان فتحا جلسة بنفس الرقم، أو نفس المستخدم من نافذتين ⇐ إعادة المحاولة
      if (String(error?.code) !== "23505") throw error
    }
  }
  throw new Error("تعذر فتح جلسة جرد — أعد المحاولة")
}

/** يحفظ كمية/ملاحظة سطر في جلسة (null بلا ملاحظة ⇐ حذف إدخال الجلسة للسطر). */
export async function setSessionLine(sessionId: number, countId: number, lineId: number, entry: { counted_qty: number | null; counted_pieces?: number | null; note?: string | null }) {
  const note = String(entry.note ?? "").trim()
  if (entry.counted_qty == null && !note) {
    await sql`DELETE FROM stock_count_session_lines WHERE session_id = ${sessionId} AND line_id = ${lineId}`
    return
  }
  await sql`
    INSERT INTO stock_count_session_lines (session_id, count_id, line_id, counted_qty, counted_pieces, note, counted_at)
    VALUES (${sessionId}, ${countId}, ${lineId}, ${entry.counted_qty}, ${entry.counted_pieces ?? null}, ${note || null}, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id, line_id) DO UPDATE SET
      counted_qty = EXCLUDED.counted_qty, counted_pieces = EXCLUDED.counted_pieces, note = EXCLUDED.note, counted_at = CURRENT_TIMESTAMP
  `
  await sql`UPDATE stock_count_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ${sessionId}`
}

/**
 * يجمّع كميات الجلسات على أسطر الوثيقة: المجرودة = مجموع الجلسات (NULL إن لم تعدّه أي جلسة)، والقطع
 * كذلك، والملاحظة = ملاحظات الجلسات. أسطر السيريال تُحسب من السيريالات المجرودة (syncSerialCount).
 */
export async function recomputeCountedLines(countId: number, lineIds: number[] | null = null) {
  const ids = lineIds || []
  const all = lineIds == null
  await sql`
    UPDATE stock_count_items i SET
      counted_qty = a.qty, counted_pieces = a.pieces, note = COALESCE(a.notes, ''),
      counted_by = a.users, counted_at = a.last_at
    FROM (
      SELECT li.id,
        SUM(e.counted_qty) AS qty,
        SUM(e.counted_pieces) AS pieces,
        string_agg(DISTINCT NULLIF(BTRIM(e.note), ''), ' | ') AS notes,
        string_agg(DISTINCT CASE WHEN e.counted_qty IS NOT NULL THEN s.user_id END, ',') AS users,
        MAX(e.counted_at) FILTER (WHERE e.counted_qty IS NOT NULL) AS last_at
      FROM stock_count_items li
      LEFT JOIN stock_count_session_lines e ON e.line_id = li.id
      LEFT JOIN stock_count_sessions s ON s.id = e.session_id
      WHERE li.count_id = ${countId} AND NOT li.has_serial AND (${all} OR li.id = ANY(${ids}::int[]))
      GROUP BY li.id
    ) a
    WHERE i.id = a.id
  `
  // ملاحظات أسطر السيريال (كميتها من السيريالات)
  await sql`
    UPDATE stock_count_items i SET note = COALESCE((
      SELECT string_agg(DISTINCT NULLIF(BTRIM(e.note), ''), ' | ') FROM stock_count_session_lines e WHERE e.line_id = i.id
    ), '')
    WHERE i.count_id = ${countId} AND i.has_serial AND (${all} OR i.id = ANY(${ids}::int[]))
  `
}

export async function loadCountSessions(countId: number) {
  const rows = (await sql`
    SELECT s.id, s.session_no, s.user_id, s.user_name, s.status, s.started_at, s.updated_at, s.finished_at,
      (SELECT COUNT(*) FROM stock_count_session_lines e WHERE e.session_id = s.id AND e.counted_qty IS NOT NULL)::int
        + (SELECT COUNT(DISTINCT sr.line_id) FROM stock_count_serials sr WHERE sr.session_id = s.id AND sr.counted)::int AS lines_counted,
      COALESCE((SELECT SUM(e.counted_qty) FROM stock_count_session_lines e WHERE e.session_id = s.id), 0)
        + (SELECT COUNT(*) FROM stock_count_serials sr WHERE sr.session_id = s.id AND sr.counted) AS total_qty
    FROM stock_count_sessions s
    WHERE s.count_id = ${countId}
    ORDER BY s.session_no
  `) as any[]
  return rows.map((row) => ({
    id: Number(row.id),
    session_no: Number(row.session_no),
    user_id: String(row.user_id),
    user_name: row.user_name || "",
    status: Number(row.status),
    started_at: row.started_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
    lines_counted: Number(row.lines_counted || 0),
    total_qty: Number(row.total_qty || 0),
  }))
}

/** رسالة منع الاعتماد/الإنهاء إن بقيت جلسة مفتوحة — null إن كانت كل الجلسات منتهية. */
export async function openSessionsMessage(countId: number) {
  const open = (await sql`
    SELECT session_no, user_name FROM stock_count_sessions WHERE count_id = ${countId} AND status = 1 ORDER BY session_no
  `) as any[]
  if (!open.length) return null
  return open.map((row) => `يجب انهاء الجرد للجلسة رقم - ${Number(row.session_no)}${row.user_name ? ` (${row.user_name})` : ""}`).join("، ")
}

/** إلغاء جلسة: تُحذف كمياتها وتُلغى سيريالاتها المجرودة ثم يُعاد تجميع الأسطر. */
export async function cancelCountSession(countId: number, sessionId: number) {
  const serialLines = (await sql`SELECT DISTINCT line_id FROM stock_count_serials WHERE session_id = ${sessionId} AND counted`) as any[]
  await sql`DELETE FROM stock_count_serials WHERE session_id = ${sessionId} AND counted AND in_system = false`
  await sql`UPDATE stock_count_serials SET counted = false, counted_at = NULL, session_id = NULL WHERE session_id = ${sessionId}`
  for (const row of serialLines) {
    await sql`UPDATE stock_count_items SET counted_qty = NULLIF((SELECT COUNT(*) FROM stock_count_serials WHERE line_id = ${Number(row.line_id)} AND counted), 0) WHERE id = ${Number(row.line_id)}`
  }
  await sql`DELETE FROM stock_count_session_lines WHERE session_id = ${sessionId}`
  await sql`UPDATE stock_count_sessions SET status = 3, updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP WHERE id = ${sessionId}`
  await recomputeCountedLines(countId)
}
