import sql, { resolveCurrentDbName } from "@/lib/database"

/**
 * الأرقام التسلسلية للأصناف (serial_tracking) في السندات — نفس منطق شامل (ShamelAPI):
 *  - items_serials_tbl: سجل الرقم التسلسلي لكل صنف (فريد لكل صنف).
 *  - vouchers_items_serials_tbl: ربط الرقم بسطر سند، ويحفظ "حالة الرقم بعد الحركة" (في المخزون أم
 *    خارجه، وبأي مستودع) — آخر ربط فعّال (سند غير ملغى) يحدد أين الرقم الآن.
 * سطور السند تُحذف وتُعاد مع كل حفظ، فالربط يُحذف معها تلقائياً (ON DELETE CASCADE) ويُعاد إدراجه.
 */

export type SerialDirection = "in" | "out" | "transfer"

// 8 ادخال، 15 مردود ارسالية أمانة، 16 مردود مبيعات، 17 فاتورة مشتريات، 18 ارسالية مشتريات → دخول
// 9 اخراج، 11 استعمال، 12 فاتورة مبيعات، 13 ارسالية مبيعات، 14 ارسالية أمانة، 19 مردود مشتريات → خروج
// 10 ارسالية داخلية → نقل بين مستودعين
const DIRECTIONS: Record<number, SerialDirection> = {
  8: "in", 15: "in", 16: "in", 17: "in", 18: "in",
  9: "out", 11: "out", 12: "out", 13: "out", 14: "out", 19: "out",
  10: "transfer",
}

export const serialDirection = (vchType: number): SerialDirection | null => DIRECTIONS[Number(vchType)] ?? null

const ensured = new Set<string>()
export async function ensureItemSerialTables() {
  const db = await resolveCurrentDbName().catch(() => "default")
  if (ensured.has(db)) return
  await sql`CREATE TABLE IF NOT EXISTS items_serials_tbl (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    serial TEXT NOT NULL,
    note TEXT,
    insert_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (item_id, serial)
  )`
  await sql`CREATE TABLE IF NOT EXISTS vouchers_items_serials_tbl (
    id SERIAL PRIMARY KEY,
    voucher_id INTEGER NOT NULL,
    voucher_item_id INTEGER NOT NULL REFERENCES voucher_items_tbl(id) ON DELETE CASCADE,
    item_serial_id INTEGER NOT NULL REFERENCES items_serials_tbl(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL,
    in_stock BOOLEAN NOT NULL,
    store_id INTEGER,
    order_no INTEGER DEFAULT 0,
    insert_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
  await sql`CREATE INDEX IF NOT EXISTS vouchers_items_serials_serial_idx ON vouchers_items_serials_tbl (item_serial_id, id DESC)`
  await sql`CREATE INDEX IF NOT EXISTS vouchers_items_serials_voucher_idx ON vouchers_items_serials_tbl (voucher_id)`
  ensured.add(db)
}

/** الأرقام كما أرسلتها الواجهة (نصوص أو كائنات {serial}) — بلا فراغات وبلا تكرار. */
export function serialsOf(row: any): string[] {
  const raw = Array.isArray(row?.serials) ? row.serials : Array.isArray(row?.serial_numbers) ? row.serial_numbers : []
  return raw.map((value: any) => String(typeof value === "object" && value ? value.serial ?? "" : value ?? "").trim()).filter(Boolean)
}

const lineStore = (row: any, fallback?: number | null) => Number(row?.store_id ?? row?.warehouse_id ?? fallback ?? 0) || null
const lineName = (row: any) => String(row?.product_name || row?.item_name || row?.product_code || row?.product_id || "")
/** العدد المطلوب = الكمية + البونص (كما في شامل). */
export const requiredSerialCount = (row: any) => Math.round(Number(row?.quantity ?? row?.qnty ?? 0) + Number(row?.bonus_quantity ?? row?.bonus ?? 0))

export async function serialTrackedIds(productIds: number[]) {
  const ids = [...new Set(productIds.map(Number).filter((id) => id > 0))]
  if (!ids.length) return new Set<number>()
  const rows = await sql`SELECT id FROM products WHERE id = ANY(${ids}::int[]) AND COALESCE(serial_tracking, false) = true`
  return new Set<number>((rows as any[]).map((row) => Number(row.id)))
}

export type SerialIssue = { index: number; serial?: string; message: string }

type LastMove = { item_id: number; serial: string; in_stock: boolean; store_id: number | null; voucher_id: number; vch_code: string; status: number; store_name: string | null }

/**
 * آخر حركة فعّالة (سند غير ملغى) لكل رقم — مع استثناء السند الجاري تعديله.
 * الترتيب حسب رقم السند (voucher_id) لا رقم سطر الربط: ربط السند يُحذف ويُعاد إدراجه عند كل حفظ
 * فيأخذ معرّفات أحدث، فكان إعادة حفظ سند قديم تجعله "آخر حركة" فيبدو رقمٌ مُباع موجوداً بالمخزون.
 */
async function lastMoves(pairs: Array<{ itemId: number; serial: string }>, excludeVoucherId: number | null) {
  const map = new Map<string, LastMove>()
  if (!pairs.length) return map
  const itemIds = pairs.map((pair) => pair.itemId)
  const serials = pairs.map((pair) => pair.serial)
  const rows = await sql`
    WITH wanted AS (SELECT * FROM unnest(${itemIds}::int[], ${serials}::text[]) AS w(item_id, serial))
    SELECT s.item_id, s.serial, l.in_stock, l.store_id, l.voucher_id, h.vch_code, h.status, wh.warehouse_name AS store_name
    FROM wanted w
    JOIN items_serials_tbl s ON s.item_id = w.item_id AND s.serial = w.serial
    JOIN LATERAL (
      SELECT vis.* FROM vouchers_items_serials_tbl vis
      JOIN voucher_header_tbl vh ON vh.id = vis.voucher_id
      WHERE vis.item_serial_id = s.id AND COALESCE(vh.status, 1) <> 3 AND vis.voucher_id <> ${excludeVoucherId ?? -1}
      ORDER BY vis.voucher_id DESC, vis.id DESC LIMIT 1
    ) l ON true
    JOIN voucher_header_tbl h ON h.id = l.voucher_id
    LEFT JOIN warehouses wh ON wh.id = l.store_id
  `
  for (const row of rows as any[]) map.set(`${row.item_id}|${row.serial}`, { ...row, in_stock: Boolean(row.in_stock), status: Number(row.status), store_id: row.store_id == null ? null : Number(row.store_id) })
  return map
}

/**
 * التحقق من أرقام سند كامل. يعيد كل المشاكل (لا أولها فقط) حتى تعرضها نافذة الأرقام بجانب كل رقم.
 * enforceCount=false: يُتحقق فقط من الأرقام المُدخلة (يُستخدم لنقاط البيع التي لا تُدخل أرقاماً).
 */
export async function checkVoucherSerials(params: {
  vchType: number
  voucherId?: number | null
  items: any[]
  fromStoreId?: number | null
  toStoreId?: number | null
  enforceCount?: boolean
}): Promise<SerialIssue[]> {
  const direction = serialDirection(params.vchType)
  if (!direction) return []
  await ensureItemSerialTables()
  const items = Array.isArray(params.items) ? params.items : []
  const tracked = await serialTrackedIds(items.map((row) => Number(row?.product_id ?? row?.item_id)))
  const issues: SerialIssue[] = []
  const pairs: Array<{ itemId: number; serial: string; index: number }> = []
  const seen = new Map<string, number>()

  items.forEach((row, index) => {
    const itemId = Number(row?.product_id ?? row?.item_id)
    if (!tracked.has(itemId)) return
    // سطر منقول من ارسالية (فاتورة من ارسالية): الأرقام خرجت/دخلت مع الارسالية نفسها
    if (Number(row?.delivery_item_id) > 0) return
    const serials = serialsOf(row)
    const required = requiredSerialCount(row)
    if (params.enforceCount !== false && serials.length !== required) {
      issues.push({ index, message: `الصنف ${lineName(row)}: عدد الأرقام التسلسلية (${serials.length}) يجب أن يساوي الكمية + البونص (${required})` })
    }
    for (const serial of serials) {
      const key = `${itemId}|${serial.toLowerCase()}`
      if (seen.has(key)) issues.push({ index, serial, message: `الرقم التسلسلي ${serial} مكرر في السند (${lineName(row)})` })
      else { seen.set(key, index); pairs.push({ itemId, serial, index }) }
    }
  })

  const moves = await lastMoves(pairs, params.voucherId ?? null)
  for (const pair of pairs) {
    const row = items[pair.index]
    const last = moves.get(`${pair.itemId}|${pair.serial}`)
    const store = lineStore(row, params.fromStoreId)
    const label = `${pair.serial} (${lineName(row)})`
    if (last && last.status === 1) {
      issues.push({ index: pair.index, serial: pair.serial, message: `الرقم التسلسلي ${label} عليه حركة غير مرحّلة في السند ${last.vch_code} — يجب ترحيل ذلك السند أو حذفه أولاً` })
      continue
    }
    if (direction === "in") {
      if (last?.in_stock) issues.push({ index: pair.index, serial: pair.serial, message: `الرقم التسلسلي ${label} موجود مسبقاً في المخزون${last.store_name ? ` (${last.store_name})` : ""} — سند ${last.vch_code}` })
      continue
    }
    // خروج / نقل: يجب أن يكون الرقم داخل المخزون وبنفس المستودع
    if (!last) issues.push({ index: pair.index, serial: pair.serial, message: `الرقم التسلسلي ${label} غير موجود في المخزون` })
    else if (!last.in_stock) issues.push({ index: pair.index, serial: pair.serial, message: `الرقم التسلسلي ${label} تم إخراجه في السند ${last.vch_code}` })
    else if (store && last.store_id && last.store_id !== store) issues.push({ index: pair.index, serial: pair.serial, message: `الرقم التسلسلي ${label} موجود في مستودع آخر${last.store_name ? `: ${last.store_name}` : ""}` })
  }
  return issues
}

/** رسالة خطأ واحدة للحفظ (أول مشكلة)، أو null. */
export async function validateVoucherSerials(params: Parameters<typeof checkVoucherSerials>[0]) {
  const issues = await checkVoucherSerials(params)
  return issues.length ? issues[0].message : null
}

/**
 * حفظ ربط الأرقام بعد إدراج سطور السند. savedItems بنفس ترتيب الأسطر المرسلة ولكل منها id السطر الجديد.
 */
export async function saveVoucherSerials(voucherId: number, vchType: number, savedItems: any[], toStoreId?: number | null, fromStoreId?: number | null) {
  const direction = serialDirection(vchType)
  if (!direction) return
  await ensureItemSerialTables()
  // الربط القديم يُحذف مع السطور القديمة (cascade)؛ هذا احتياط لسطور لم تُحذف
  await sql`DELETE FROM vouchers_items_serials_tbl WHERE voucher_id = ${voucherId}`
  const tracked = await serialTrackedIds(savedItems.map((row) => Number(row?.product_id ?? row?.item_id)))
  for (const row of savedItems) {
    const itemId = Number(row?.product_id ?? row?.item_id)
    const voucherItemId = Number(row?.id)
    if (!tracked.has(itemId) || !(voucherItemId > 0)) continue
    // سطر منقول من ارسالية: الحركة مسجلة على الارسالية نفسها
    if (Number(row?.delivery_item_id) > 0) continue
    const serials = [...new Set(serialsOf(row))]
    if (!serials.length) continue
    const inStock = direction !== "out"
    const store = direction === "transfer" ? Number(toStoreId) || null : lineStore(row, fromStoreId)
    let order = 0
    for (const serial of serials) {
      const master = await sql`
        INSERT INTO items_serials_tbl (item_id, serial) VALUES (${itemId}, ${serial})
        ON CONFLICT (item_id, serial) DO UPDATE SET serial = EXCLUDED.serial
        RETURNING id
      `
      await sql`
        INSERT INTO vouchers_items_serials_tbl (voucher_id, voucher_item_id, item_serial_id, item_id, in_stock, store_id, order_no)
        VALUES (${voucherId}, ${voucherItemId}, ${Number(master[0].id)}, ${itemId}, ${inStock}, ${store}, ${order++})
      `
    }
  }
}

/** يضيف serials: string[] لكل سطر (حسب id السطر) وhas_serial (الصنف له رقم تسلسلي). */
export async function attachItemSerials<T extends Record<string, any>>(items: T[]): Promise<Array<T & { serials: string[]; has_serial: boolean }>> {
  const list = Array.isArray(items) ? items : []
  const tracked = await serialTrackedIds(list.map((row) => Number(row?.product_id ?? row?.item_id)))
  const ids = list.map((row) => Number(row?.id)).filter((id) => id > 0)
  if (!ids.length) return list.map((row) => ({ ...row, serials: [], has_serial: tracked.has(Number(row?.product_id ?? row?.item_id)) }))
  await ensureItemSerialTables()
  const rows = await sql`
    SELECT vis.voucher_item_id, s.serial FROM vouchers_items_serials_tbl vis
    JOIN items_serials_tbl s ON s.id = vis.item_serial_id
    WHERE vis.voucher_item_id = ANY(${ids}::int[]) ORDER BY vis.voucher_item_id, vis.order_no, vis.id
  `
  const byItem = new Map<number, string[]>()
  for (const row of rows as any[]) byItem.set(Number(row.voucher_item_id), [...(byItem.get(Number(row.voucher_item_id)) || []), String(row.serial)])
  return list.map((row) => ({ ...row, serials: byItem.get(Number(row?.id)) || [], has_serial: tracked.has(Number(row?.product_id ?? row?.item_id)) }))
}

/**
 * قبل إلغاء/حذف سند: لا يجوز إن كان على أحد أرقامه حركة لاحقة في سند آخر غير ملغى
 * ("يمكن حذف الرقم المتسلسل لآخر حركة تمت عليه فقط" — شامل).
 */
export async function validateSerialsRemoval(voucherId: number): Promise<string | null> {
  await ensureItemSerialTables()
  const rows = await sql`
    SELECT s.serial, h.vch_code, p.product_name
    FROM vouchers_items_serials_tbl mine
    JOIN items_serials_tbl s ON s.id = mine.item_serial_id
    JOIN vouchers_items_serials_tbl later ON later.item_serial_id = mine.item_serial_id AND later.voucher_id > mine.voucher_id
    JOIN voucher_header_tbl h ON h.id = later.voucher_id AND COALESCE(h.status, 1) <> 3
    LEFT JOIN products p ON p.id = s.item_id
    WHERE mine.voucher_id = ${voucherId}
    LIMIT 1
  `
  const row = (rows as any[])[0]
  return row ? `لا يمكن إلغاء/حذف السند: الرقم التسلسلي ${row.serial} (${row.product_name || ""}) عليه حركة لاحقة في السند ${row.vch_code}` : null
}

/**
 * الأرقام المحفوظة حالياً على السند والتي ستُزال بالحفظ الجديد (حذف سطر، تعديل أرقامه، تغيير الصنف) —
 * إن كان على أيٍّ منها حركة لاحقة في سند آخر غير ملغى يُرفَض (لا يُحذف الرقم إلا من آخر حركة عليه).
 * items = أسطر السند كما ستُحفظ (بحقل serials)؛ أسطر الفاتورة من ارسالية لا تحمل ربطاً أصلاً.
 */
export async function findBlockedSerialRemovals(voucherId: number, items: any[]) {
  if (!(voucherId > 0)) return [] as Array<{ serial: string; product_name: string; vch_code: string }>
  await ensureItemSerialTables()
  const keep = new Set<string>()
  for (const row of Array.isArray(items) ? items : []) {
    const itemId = Number(row?.product_id ?? row?.item_id)
    if (!(itemId > 0)) continue
    for (const serial of serialsOf(row)) keep.add(`${itemId}|${serial.toLowerCase()}`)
  }
  const rows = await sql`
    SELECT DISTINCT ON (s.id) s.item_id, s.serial, h.vch_code, p.product_name
    FROM vouchers_items_serials_tbl mine
    JOIN items_serials_tbl s ON s.id = mine.item_serial_id
    JOIN vouchers_items_serials_tbl later ON later.item_serial_id = mine.item_serial_id AND later.voucher_id > mine.voucher_id
    JOIN voucher_header_tbl h ON h.id = later.voucher_id AND COALESCE(h.status, 1) <> 3
    LEFT JOIN products p ON p.id = s.item_id
    WHERE mine.voucher_id = ${voucherId}
    ORDER BY s.id, later.voucher_id
  `
  return (rows as any[])
    .filter((row) => !keep.has(`${Number(row.item_id)}|${String(row.serial).toLowerCase()}`))
    .map((row) => ({ serial: String(row.serial), product_name: String(row.product_name || ""), vch_code: String(row.vch_code || "") }))
}

export async function validateSerialsRemovalOnUpdate(voucherId: number, items: any[]): Promise<string | null> {
  const blocked = await findBlockedSerialRemovals(voucherId, items)
  const first = blocked[0]
  return first
    ? `لا يمكن حذف السطر/الرقم التسلسلي ${first.serial} (${first.product_name}): عليه حركة لاحقة في السند ${first.vch_code} — يجب حذف تلك الحركة أولاً`
    : null
}

/** الأرقام الموجودة حالياً في المخزون لصنف (ومستودع اختياري) — لاختيارها في سندات الخروج. */
export async function availableSerials(params: { itemId: number; storeId?: number | null; excludeVoucherId?: number | null; search?: string; limit?: number }) {
  await ensureItemSerialTables()
  const search = String(params.search || "").trim()
  const rows = await sql`
    SELECT s.id, s.serial, l.store_id, wh.warehouse_name AS store_name, h.vch_code, h.vch_date
    FROM items_serials_tbl s
    JOIN LATERAL (
      SELECT vis.* FROM vouchers_items_serials_tbl vis
      JOIN voucher_header_tbl vh ON vh.id = vis.voucher_id
      WHERE vis.item_serial_id = s.id AND COALESCE(vh.status, 1) <> 3 AND vis.voucher_id <> ${params.excludeVoucherId ?? -1}
      ORDER BY vis.voucher_id DESC, vis.id DESC LIMIT 1
    ) l ON true
    JOIN voucher_header_tbl h ON h.id = l.voucher_id
    LEFT JOIN warehouses wh ON wh.id = l.store_id
    WHERE s.item_id = ${params.itemId}
      AND l.in_stock = true
      AND COALESCE(h.status, 1) = 2
      AND (${params.storeId ?? null}::int IS NULL OR l.store_id = ${params.storeId ?? null}::int)
      AND (${search} = '' OR s.serial ILIKE ${"%" + search + "%"})
    ORDER BY s.serial
    LIMIT ${Math.min(Math.max(Number(params.limit) || 500, 1), 2000)}
  `
  return rows as any[]
}
