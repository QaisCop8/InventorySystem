import sql from "@/lib/database"
import { withBranchSymbol } from "@/lib/branch-symbol"
import { buildVoucherCode } from "@/app/api/stock-vouchers/_lib"
import { getAvailableMainUnitQuantities } from "@/lib/inventory-availability"
import { ProductionError, ensureProductionTables, loadProductionProducts, productionProductsInfo } from "@/lib/production-vouchers"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// أوامر الانتاج (2026-11-24) — تخطيط ما سيُنتَج قبل تنفيذه:
//   أمر = أصناف منتَجة بكميات مخططة + تاريخ تسليم + أولوية، اختيارياً مرتبطة بطلبيات مبيعات مفتوحة.
//   فحص توفر المواد: احتياج الخام (الوصفة مع الهدر × المتبقي) مقابل الرصيد المتاح في مستودع الخام ⇐ قائمة النواقص.
//   التنفيذ بسندات انتاج تحمل order_id؛ المنتَج = مجموع المواد المنتجة في سندات الأمر المعتمدة.
//   الحالة: 1 مخطط · 2 قيد التنفيذ (أول سند) · 3 منتهي (اكتمل كل شيء أو إغلاق يدوي) · 4 ملغى.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUS = { PLANNED: 1, IN_PROGRESS: 2, COMPLETED: 3, CANCELLED: 4 } as const
export const ORDER_STATUS_NAME: Record<number, string> = { 1: "مخطط", 2: "قيد التنفيذ", 3: "منتهي", 4: "ملغى" }

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const isDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))

export async function ensureProductionOrderTables() {
  await ensureProductionTables()
  // الجداول تُنشأ في ensureProductionTables (lib/production-vouchers.ts) — سند الانتاج يربط بها أيضاً
}

// ───────────── الرقم ─────────────

const ORDER_CODE_PREFIX = "M"
async function codeSegment(branchId: number | null) {
  return `${ORDER_CODE_PREFIX}${await withBranchSymbol("", branchId)}`.toUpperCase()
}
export async function nextOrderCode(branchId: number | null) {
  const segment = await codeSegment(branchId)
  const rows = (await sql`SELECT code FROM production_orders_tbl WHERE code LIKE ${segment + "%"}`) as any[]
  let max = 0
  for (const row of rows) {
    const value = Number(String(row.code).slice(segment.length))
    if (Number.isInteger(value) && value > max) max = value
  }
  return buildVoucherCode(segment, "", max + 1)
}

// ───────────── القراءة ─────────────

/** الكمية المنتجة لكل (أمر، صنف): المواد المنتجة في سندات الأمر — المعتمدة (produced) وغير المعتمدة (pending). */
async function producedByOrder(orderIds: number[]) {
  const map = new Map<string, { produced: number; pending: number }>()
  if (!orderIds.length) return map
  const rows = (await sql`
    SELECT p.order_id, i.item_id,
      COALESCE(SUM(i.quantity) FILTER (WHERE p.status = 2), 0) AS produced,
      COALESCE(SUM(i.quantity) FILTER (WHERE p.status IN (1, 5)), 0) AS pending
    FROM production_vouchers_tbl p JOIN production_voucher_items_tbl i ON i.production_id = p.id AND i.role = 1
    WHERE p.order_id = ANY(${orderIds}::int[]) AND p.status <> 3
    GROUP BY p.order_id, i.item_id
  `) as any[]
  for (const row of rows) map.set(`${row.order_id}:${row.item_id}`, { produced: Number(row.produced) || 0, pending: Number(row.pending) || 0 })
  return map
}

export async function loadOrder(id: number) {
  const header = ((await sql`
    SELECT o.*, o.order_date::text AS order_date_text, o.due_date::text AS due_date_text, b.branch_name,
      wf.warehouse_name AS finished_store_name, wr.warehouse_name AS raw_store_name,
      COALESCE((SELECT COALESCE(NULLIF(us.full_name, ''), us.username) FROM user_settings us WHERE us.user_id::text = o.created_by LIMIT 1), o.created_by) AS created_by_name
    FROM production_orders_tbl o
    LEFT JOIN branches b ON b.id = o.branch_id
    LEFT JOIN warehouses wf ON wf.id = o.finished_store_id
    LEFT JOIN warehouses wr ON wr.id = o.raw_store_id
    WHERE o.id = ${id}
  `) as any[])[0]
  if (!header) return null
  const [items, vouchers, produced] = await Promise.all([
    sql`
      SELECT i.*, p.product_code, p.product_name, u.unit_name
      FROM production_order_items_tbl i
      LEFT JOIN products p ON p.id = i.item_id
      LEFT JOIN units u ON u.id = p.measurment_unit
      WHERE i.order_id = ${id} ORDER BY i.sort_order, i.id
    ` as Promise<any[]>,
    sql`
      SELECT p.id, p.code, p.vch_date::text AS vch_date, p.status,
        (SELECT COALESCE(SUM(i.quantity * i.price), 0) FROM production_voucher_items_tbl i WHERE i.production_id = p.id AND i.role = 1) AS value
      FROM production_vouchers_tbl p WHERE p.order_id = ${id} AND p.status <> 3 ORDER BY p.id
    ` as Promise<any[]>,
    producedByOrder([id]),
  ])
  return {
    id: Number(header.id), code: header.code, status: Number(header.status), priority: Number(header.priority) || 1,
    order_date: String(header.order_date_text).slice(0, 10), due_date: header.due_date_text ? String(header.due_date_text).slice(0, 10) : "",
    branch_id: Number(header.branch_id), branch_name: header.branch_name || "",
    finished_store_id: header.finished_store_id == null ? null : Number(header.finished_store_id), raw_store_id: header.raw_store_id == null ? null : Number(header.raw_store_id),
    finished_store_name: header.finished_store_name || "", raw_store_name: header.raw_store_name || "",
    note: header.note || "", created_by_name: header.created_by_name || "", closed_at: header.closed_at,
    items: items.map((row) => {
      const done = produced.get(`${id}:${row.item_id}`) || { produced: 0, pending: 0 }
      return {
        id: Number(row.id), item_id: Number(row.item_id), product_code: row.product_code || "", product_name: row.product_name || "", unit_name: row.unit_name || "",
        quantity: Number(row.quantity), produced: round6(done.produced), pending: round6(done.pending),
        remaining: round6(Math.max(0, Number(row.quantity) - done.produced - done.pending)),
        sales_order_id: row.sales_order_id == null ? null : Number(row.sales_order_id), sales_order_number: row.sales_order_number || "", note: row.note || "",
      }
    }),
    vouchers: vouchers.map((row) => ({ id: Number(row.id), code: row.code, vch_date: String(row.vch_date).slice(0, 10), status: Number(row.status), value: Number(row.value) || 0 })),
  }
}

export async function listOrders(branchIds: number[], filters: { from?: string | null; to?: string | null; status?: number; q?: string }) {
  const search = String(filters.q || "").trim()
  const rows = (await sql`
    SELECT o.id, o.code, o.order_date::text AS order_date, o.due_date::text AS due_date, o.status, o.priority, o.note, b.branch_name,
      (SELECT string_agg(p.product_name, '، ' ORDER BY i.sort_order) FROM production_order_items_tbl i JOIN products p ON p.id = i.item_id WHERE i.order_id = o.id) AS product_names,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM production_order_items_tbl i WHERE i.order_id = o.id) AS planned,
      (SELECT COALESCE(SUM(vi.quantity), 0) FROM production_vouchers_tbl v JOIN production_voucher_items_tbl vi ON vi.production_id = v.id AND vi.role = 1
        WHERE v.order_id = o.id AND v.status = 2) AS produced,
      (SELECT string_agg(DISTINCT i.sales_order_number, '، ') FROM production_order_items_tbl i WHERE i.order_id = o.id AND COALESCE(i.sales_order_number, '') <> '') AS sales_orders
    FROM production_orders_tbl o LEFT JOIN branches b ON b.id = o.branch_id
    WHERE o.branch_id = ANY(${branchIds}::int[])
      AND (${filters.from || null}::date IS NULL OR o.order_date >= ${filters.from || null}::date)
      AND (${filters.to || null}::date IS NULL OR o.order_date <= ${filters.to || null}::date)
      AND (${Number(filters.status) || 0} = 0 OR o.status = ${Number(filters.status) || 0})
      AND (${search} = '' OR o.code ILIKE ${"%" + search + "%"} OR COALESCE(o.note, '') ILIKE ${"%" + search + "%"}
           OR EXISTS (SELECT 1 FROM production_order_items_tbl i JOIN products p ON p.id = i.item_id
                      WHERE i.order_id = o.id AND (p.product_name ILIKE ${"%" + search + "%"} OR p.product_code ILIKE ${"%" + search + "%"} OR COALESCE(i.sales_order_number, '') ILIKE ${"%" + search + "%"})))
    ORDER BY CASE WHEN o.status IN (1, 2) THEN 0 ELSE 1 END, o.priority DESC, o.due_date NULLS LAST, o.id DESC
    LIMIT 1000
  `) as any[]
  const today = new Date().toISOString().slice(0, 10)
  return rows.map((row) => ({
    ...row, id: Number(row.id), status: Number(row.status), priority: Number(row.priority) || 1,
    order_date: String(row.order_date || "").slice(0, 10), due_date: row.due_date ? String(row.due_date).slice(0, 10) : "",
    planned: Number(row.planned) || 0, produced: Number(row.produced) || 0,
    progress: Number(row.planned) > 0 ? Math.min(100, Math.round((Number(row.produced) / Number(row.planned)) * 100)) : 0,
    late: [1, 2].includes(Number(row.status)) && Boolean(row.due_date) && String(row.due_date).slice(0, 10) < today,
  }))
}

// ───────────── الحفظ ─────────────

type ItemInput = { item_id: number; quantity: number; sales_order_id: number | null; sales_order_number: string; note: string }

async function validateItems(raw: unknown): Promise<ItemInput[]> {
  const items: ItemInput[] = (Array.isArray(raw) ? raw : [])
    .filter((row: any) => Number(row?.item_id) > 0)
    .map((row: any) => ({
      item_id: Number(row.item_id), quantity: round6(Number(row.quantity)),
      sales_order_id: Number(row.sales_order_id) > 0 ? Number(row.sales_order_id) : null,
      sales_order_number: String(row.sales_order_number || "").trim().slice(0, 40),
      note: String(row.note || "").trim().slice(0, 200),
    }))
  if (!items.length) throw new ProductionError("أضف صنفاً منتَجاً واحداً على الأقل")
  const products = await loadProductionProducts(items.map((row) => row.item_id))
  items.forEach((row, index) => {
    const product = products.get(row.item_id)
    const where = `السطر ${index + 1}${product ? ` (${product.product_name})` : ""}`
    if (!product) throw new ProductionError(`${where}: الصنف غير موجود`)
    if (product.unsupported) throw new ProductionError(`${where}: لا يمكن انتاج صنف ${product.unsupported}`)
    if (!(row.quantity > 0)) throw new ProductionError(`${where}: الكمية المخططة يجب أن تكون أكبر من صفر`)
  })
  return items
}

async function optionalWarehouse(id: unknown) {
  const number = Number(id)
  if (!(number > 0)) return null
  const row = ((await sql`SELECT id FROM warehouses WHERE id = ${number} AND COALESCE(status, 1) <> 3`) as any[])[0]
  if (!row) throw new ProductionError("المستودع غير موجود")
  return number
}

export async function saveOrder(data: any, userId: string, branchId: number, existingId: number | null) {
  const orderDate = isDate(data.order_date) ? String(data.order_date) : null
  if (!orderDate) throw new ProductionError("تاريخ الأمر غير صالح")
  const dueDate = isDate(data.due_date) ? String(data.due_date) : null
  if (dueDate && dueDate < orderDate) throw new ProductionError("تاريخ التسليم قبل تاريخ الأمر")
  const items = await validateItems(data.items)
  const finished = await optionalWarehouse(data.finished_store_id)
  const raw = await optionalWarehouse(data.raw_store_id)
  const priority = Number(data.priority) === 2 ? 2 : 1
  const note = String(data.note || "").trim().slice(0, 1000) || null

  let id = existingId
  if (id) {
    const current = await loadOrder(id)
    if (!current) throw new ProductionError("أمر الانتاج غير موجود", 404)
    if (current.status === ORDER_STATUS.CANCELLED || current.status === ORDER_STATUS.COMPLETED) throw new ProductionError("أمر الانتاج منتهٍ أو ملغى — أعد فتحه أولاً")
    // صنف نُفِّذ منه شيء لا يُحذف من الأمر ولا تقل كميته المخططة عن المنفّذ
    for (const line of current.items) {
      const done = line.produced + line.pending
      if (done <= 0) continue
      const planned = items.filter((row) => row.item_id === line.item_id).reduce((sum, row) => sum + row.quantity, 0)
      if (planned + 1e-6 < done) throw new ProductionError(`${line.product_name}: الكمية المخططة أقل مما نُفِّذ بسندات الانتاج (${done})`)
    }
    await sql`
      UPDATE production_orders_tbl SET order_date = ${orderDate}, due_date = ${dueDate}, branch_id = ${branchId}, finished_store_id = ${finished},
        raw_store_id = ${raw}, priority = ${priority}, note = ${note}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}`
  } else {
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      const code = await nextOrderCode(branchId)
      const inserted = (await sql`
        INSERT INTO production_orders_tbl (code, order_date, due_date, branch_id, finished_store_id, raw_store_id, status, priority, note, created_by)
        VALUES (${code}, ${orderDate}, ${dueDate}, ${branchId}, ${finished}, ${raw}, ${ORDER_STATUS.PLANNED}, ${priority}, ${note}, ${userId})
        ON CONFLICT (code) DO NOTHING RETURNING id`) as any[]
      if (inserted[0]) id = Number(inserted[0].id)
    }
    if (!id) throw new ProductionError("تعذر توليد رقم أمر الانتاج — أعد المحاولة")
  }
  await sql`DELETE FROM production_order_items_tbl WHERE order_id = ${id}`
  for (const [index, row] of items.entries()) {
    await sql`
      INSERT INTO production_order_items_tbl (order_id, item_id, quantity, sales_order_id, sales_order_number, note, sort_order)
      VALUES (${id}, ${row.item_id}, ${row.quantity}, ${row.sales_order_id}, ${row.sales_order_number || null}, ${row.note || null}, ${index})`
  }
  await refreshOrderStatus(Number(id))
  return Number(id)
}

/** حالة الأمر من تنفيذه: سند واحد على الأقل ⇐ قيد التنفيذ؛ كل الأصناف أُنتجت (سندات معتمدة) ⇐ منتهي. */
export async function refreshOrderStatus(id: number) {
  const order = await loadOrder(id)
  if (!order || order.status === ORDER_STATUS.CANCELLED) return
  // الإغلاق اليدوي (closed_at) يبقى منتهياً
  if (order.status === ORDER_STATUS.COMPLETED && order.closed_at) return
  const complete = order.items.length > 0 && order.items.every((line) => line.produced + 1e-6 >= line.quantity)
  const started = order.vouchers.length > 0
  const status = complete ? ORDER_STATUS.COMPLETED : started ? ORDER_STATUS.IN_PROGRESS : ORDER_STATUS.PLANNED
  if (status !== order.status) await sql`UPDATE production_orders_tbl SET status = ${status}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
}

export async function changeOrderStatus(id: number, action: string, userId: string) {
  const order = await loadOrder(id)
  if (!order) throw new ProductionError("أمر الانتاج غير موجود", 404)
  if (action === "cancel") {
    if (order.vouchers.some((row) => row.status !== 3)) throw new ProductionError("للأمر سندات انتاج — أغلقه بدل إلغائه، أو احذف سنداته أولاً")
    await sql`UPDATE production_orders_tbl SET status = ${ORDER_STATUS.CANCELLED}, closed_by = ${userId}, closed_at = CURRENT_TIMESTAMP WHERE id = ${id}`
  } else if (action === "close") {
    if (order.status === ORDER_STATUS.CANCELLED) throw new ProductionError("أمر الانتاج ملغى")
    await sql`UPDATE production_orders_tbl SET status = ${ORDER_STATUS.COMPLETED}, closed_by = ${userId}, closed_at = CURRENT_TIMESTAMP WHERE id = ${id}`
  } else if (action === "reopen") {
    await sql`UPDATE production_orders_tbl SET status = ${ORDER_STATUS.PLANNED}, closed_by = NULL, closed_at = NULL WHERE id = ${id}`
    await refreshOrderStatus(id)
  } else throw new ProductionError("إجراء غير معروف")
}

export async function deleteOrder(id: number) {
  const order = await loadOrder(id)
  if (!order) throw new ProductionError("أمر الانتاج غير موجود", 404)
  if (order.vouchers.length) throw new ProductionError("للأمر سندات انتاج مرتبطة — لا يمكن حذفه (يمكن إغلاقه)")
  await sql`DELETE FROM production_orders_tbl WHERE id = ${id}`
}

// ───────────── فحص توفر المواد ─────────────

export type RequirementRow = {
  item_id: number; product_code: string; product_name: string; unit_name: string
  required: number; available: number; shortage: number; unit_cost: number; shortage_value: number; used_by: string[]
}

/**
 * احتياج المواد الخام لكميات منتجة: Σ(كمية الوصفة مع الهدر × الكمية) لكل مكوّن، مقابل المتاح في مستودع الخام بتاريخ.
 * صنف منتَج بلا وصفة يظهر في no_recipe (لا يمكن حساب احتياجه).
 */
export async function materialRequirements(lines: { item_id: number; quantity: number }[], rawStoreId: number | null, date: string) {
  const wanted = lines.filter((line) => line.item_id > 0 && line.quantity > 0)
  const infos = await productionProductsInfo(wanted.map((line) => line.item_id), date)
  const byId = new Map(infos.map((info) => [info.product.id, info]))
  const totals = new Map<number, RequirementRow>()
  const noRecipe: string[] = []
  for (const line of wanted) {
    const info = byId.get(line.item_id)
    if (!info) continue
    if (!info.components.length) { noRecipe.push(info.product.product_name); continue }
    for (const component of info.components) {
      const row = totals.get(component.product.id) || {
        item_id: component.product.id, product_code: component.product.product_code, product_name: component.product.product_name, unit_name: component.product.unit_name,
        required: 0, available: 0, shortage: 0, unit_cost: component.product.price, shortage_value: 0, used_by: [],
      }
      row.required = round6(row.required + component.per_unit * line.quantity)
      if (!row.used_by.includes(info.product.product_name)) row.used_by.push(info.product.product_name)
      totals.set(component.product.id, row)
    }
  }
  const rows = [...totals.values()]
  // one stock query for all materials; unit_cost already = average cost (productionProductsInfo prices components)
  const available = rawStoreId ? await getAvailableMainUnitQuantities(rows.map((row) => row.item_id), rawStoreId, date).catch(() => new Map<number, number>()) : new Map<number, number>()
  for (const row of rows) {
    row.available = round6(available.get(row.item_id) || 0)
    row.shortage = round6(Math.max(0, row.required - row.available))
    row.shortage_value = round6(row.shortage * row.unit_cost)
  }
  rows.sort((a, b) => b.shortage - a.shortage || a.product_name.localeCompare(b.product_name))
  return {
    rows,
    no_recipe: noRecipe,
    store_checked: Boolean(rawStoreId),
    total_cost: round6(rows.reduce((sum, row) => sum + row.required * row.unit_cost, 0)),
    shortage_count: rows.filter((row) => row.shortage > 0).length,
    shortage_value: round6(rows.reduce((sum, row) => sum + row.shortage_value, 0)),
  }
}

/** احتياج أمر: المتبقي من كل صنف (المخطط − المنفّذ) — أو المخطط كاملاً لأمر لم يبدأ. */
export async function orderRequirements(id: number, rawStoreId: number | null) {
  const order = await loadOrder(id)
  if (!order) throw new ProductionError("أمر الانتاج غير موجود", 404)
  const store = rawStoreId || order.raw_store_id
  const today = new Date().toISOString().slice(0, 10)
  return materialRequirements(order.items.map((line) => ({ item_id: line.item_id, quantity: line.remaining })), store, today)
}

// ───────────── من طلبيات المبيعات ─────────────

/** أسطر طلبيات المبيعات المفتوحة (حالة 1-3) لأصناف لها وصفة تصنيع، بالمتبقي بالوحدة الرئيسية — لإنشاء أمر انتاج منها. */
export async function openSalesOrderLines(branchIds: number[], search: string) {
  const text = String(search || "").trim()
  const hasRecipes = Boolean(((await sql`SELECT to_regclass('product_manufacturing_components') IS NOT NULL AS ok`) as any[])[0]?.ok)
  if (!hasRecipes) return []
  const rows = (await sql`
    SELECT o.id AS sales_order_id, o.order_number, o.order_date::text AS order_date, o.delivery_date::text AS delivery_date,
      COALESCE(NULLIF(o.customer_name, ''), a.name, '') AS customer_name, oi.product_id AS item_id, p.product_code, p.product_name,
      GREATEST(COALESCE(oi.quantity, 0) - COALESCE(oi.delivered_quantity, 0), 0)
        * COALESCE((SELECT pu.to_main_qnty FROM product_units pu WHERE pu.product_id = oi.product_id AND pu.unit_id = oi.unit_id LIMIT 1), 1) AS remaining,
      (SELECT COALESCE(SUM(poi.quantity), 0) FROM production_order_items_tbl poi JOIN production_orders_tbl po ON po.id = poi.order_id
        WHERE poi.sales_order_id = o.id AND poi.item_id = oi.product_id AND po.status <> 4) AS planned
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN account_tbl a ON a.id = o.customer_id
    WHERE COALESCE(o.order_type, 1) = 1 AND COALESCE(o.deleted, false) = false AND COALESCE(o.order_status, 1) IN (1, 2, 3)
      AND (o.branch_id IS NULL OR o.branch_id = ANY(${branchIds}::int[]))
      AND EXISTS (SELECT 1 FROM product_manufacturing_components pmc WHERE pmc.product_id = oi.product_id)
      AND (${text} = '' OR o.order_number ILIKE ${"%" + text + "%"} OR p.product_name ILIKE ${"%" + text + "%"} OR p.product_code ILIKE ${"%" + text + "%"}
           OR COALESCE(o.customer_name, a.name, '') ILIKE ${"%" + text + "%"})
    ORDER BY o.delivery_date NULLS LAST, o.order_date, o.id
    LIMIT 300
  `.catch((error: unknown) => { console.error("open sales order lines", error); return [] as any[] })) as any[]
  return rows
    .map((row) => ({
      sales_order_id: Number(row.sales_order_id), order_number: row.order_number || "", order_date: String(row.order_date || "").slice(0, 10),
      delivery_date: row.delivery_date ? String(row.delivery_date).slice(0, 10) : "", customer_name: row.customer_name || "",
      item_id: Number(row.item_id), product_code: row.product_code || "", product_name: row.product_name || "",
      remaining: round6(Number(row.remaining) || 0), planned: round6(Number(row.planned) || 0),
      to_plan: round6(Math.max(0, (Number(row.remaining) || 0) - (Number(row.planned) || 0))),
    }))
    .filter((row) => row.remaining > 0)
}
