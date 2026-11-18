import sql from "@/lib/database"
import { cleanAddons, logRestaurant } from "@/lib/restaurant"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// شاشة المطبخ (2026-11-18): كل طلب أُرسلت أصنافه يظهر بطاقةً في المطبخ حتى يضغط المطبخ «تم» أو «إلغاء».
//  • kitchen_snapshot = الأصناف كما رآها المطبخ آخر مرة (عند أول إرسال، ثم عند كل «تم»). أي اختلاف بعدها
//    (صنف جديد، كمية، إضافات/ملاحظة، حذف) ⇐ kitchen_status = 'changed' فتظهر البطاقة بلون آخر مع إبراز التغيير.
//  • الحالات: new · changed · done · rejected («إلغاء» من المطبخ بسبب) · cancelled (ألغته الصالة وهو قيد التحضير
//    ⇐ بطاقة حمراء حتى يضغط المطبخ «تم الاطلاع» ⇐ dismissed).
//  • «إلغاء» المطبخ لا يلغي الفاتورة/الطلب مالياً — يظهر للصالة «ألغاه المطبخ» والكاشير يقرر (حذف الصنف أو إلغاء الطلب).
//  • خدمة الطاولات (is_table_service) لا تصل للمطبخ.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type KitchenItem = { id: number; product_id: number; name: string; unit: string; quantity: number; addons: { group: string; value: string }[]; note: string }
export type KitchenStatus = "new" | "changed" | "done" | "rejected" | "cancelled" | "dismissed"
export const KITCHEN_PENDING: KitchenStatus[] = ["new", "changed"]

const num = (value: unknown) => Math.round((Number(value) || 0) * 10000) / 10000

export async function ensureKitchenColumns() {
  for (const column of [
    "kitchen_status VARCHAR(12)",
    "kitchen_snapshot JSONB",
    "kitchen_sent_at TIMESTAMPTZ",
    "kitchen_changed_at TIMESTAMPTZ",
    "kitchen_done_at TIMESTAMPTZ",
    "kitchen_done_by VARCHAR(50)",
    "kitchen_reason TEXT",
  ]) await sql.unsafe(`ALTER TABLE restaurant_orders_tbl ADD COLUMN IF NOT EXISTS ${column}`)
  await sql`CREATE INDEX IF NOT EXISTS restaurant_orders_kitchen_idx ON restaurant_orders_tbl (branch_id, kitchen_status) WHERE kitchen_status IS NOT NULL`
}

export async function kitchenItems(orderId: number): Promise<KitchenItem[]> {
  const rows = await sql`
    SELECT id, product_id, product_name, unit_name, quantity, addons, note FROM restaurant_order_items_tbl
    WHERE order_id = ${orderId} AND NOT COALESCE(is_table_service, FALSE) AND quantity > 0
    ORDER BY id
  `
  return rows.map(toKitchenItem)
}

function toKitchenItem(row: any): KitchenItem {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    name: String(row.product_name ?? row.name ?? ""),
    unit: String(row.unit_name ?? row.unit ?? ""),
    quantity: num(row.quantity),
    addons: cleanAddons(row.addons),
    note: String(row.note || "").trim(),
  }
}

const itemKey = (item: KitchenItem) => JSON.stringify([item.quantity, item.addons.map((addon) => `${addon.group}:${addon.value}`).sort(), item.note])
export function snapshotOf(value: unknown): KitchenItem[] | null {
  if (!Array.isArray(value)) return null
  return value.map(toKitchenItem)
}

export function sameItems(a: KitchenItem[], b: KitchenItem[]) {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.id, itemKey(item)]))
  return a.every((item) => byId.get(item.id) === itemKey(item))
}

export type KitchenLine = KitchenItem & { change: "same" | "added" | "increased" | "decreased" | "modified" | "removed"; previous_quantity?: number }

/** الأصناف الحالية مقابل ما رآه المطبخ: جديد/زيادة/نقص/تعديل إضافات أو ملاحظة/محذوف */
export function diffItems(current: KitchenItem[], snapshot: KitchenItem[] | null): KitchenLine[] {
  if (!snapshot) return current.map((item) => ({ ...item, change: "same" }))
  const before = new Map(snapshot.map((item) => [item.id, item]))
  const lines: KitchenLine[] = current.map((item) => {
    const old = before.get(item.id)
    if (!old) return { ...item, change: "added" }
    before.delete(item.id)
    if (item.quantity > old.quantity) return { ...item, change: "increased", previous_quantity: old.quantity }
    if (item.quantity < old.quantity) return { ...item, change: "decreased", previous_quantity: old.quantity }
    return { ...item, change: itemKey(item) === itemKey(old) ? "same" : "modified" }
  })
  for (const old of before.values()) lines.push({ ...old, change: "removed" })
  return lines
}

/**
 * بعد كل عملية تمس أصناف الطلب أو حالته (داخل معاملة الطلب): أول إرسال ⇐ new، اختلاف عمّا رآه المطبخ ⇐ changed،
 * إلغاء الطلب وهو قيد التحضير ⇐ cancelled، طلب دُمج في غيره ⇐ تُمسح حالته (انتقلت للهدف).
 */
export async function syncKitchen(orderId: number) {
  const order = (await sql`SELECT id, status, kitchen_status, kitchen_snapshot FROM restaurant_orders_tbl WHERE id = ${orderId}`)[0]
  if (!order) return
  const status = order.kitchen_status as KitchenStatus | null
  if (order.status === "merged") {
    if (status) await sql`UPDATE restaurant_orders_tbl SET kitchen_status = NULL WHERE id = ${orderId}`
    return
  }
  if (order.status === "cancelled") {
    if (status && KITCHEN_PENDING.includes(status)) await sql`UPDATE restaurant_orders_tbl SET kitchen_status = 'cancelled', kitchen_changed_at = NOW() WHERE id = ${orderId}`
    return
  }
  const current = await kitchenItems(orderId)
  const snapshot = snapshotOf(order.kitchen_snapshot)
  if (!snapshot) {
    if (!current.length) return
    await sql`
      UPDATE restaurant_orders_tbl SET kitchen_status = 'new', kitchen_snapshot = ${JSON.stringify(current)}::jsonb,
        kitchen_sent_at = NOW(), kitchen_changed_at = NULL, kitchen_reason = NULL
      WHERE id = ${orderId}
    `
    return
  }
  if (sameItems(current, snapshot)) return
  await sql`UPDATE restaurant_orders_tbl SET kitchen_status = 'changed', kitchen_changed_at = NOW() WHERE id = ${orderId}`
}

/** دمج طلب في آخر: ما رآه المطبخ من الطلبين يصبح لقطة الهدف، والحالة قيد التحضير إن كان أحدهما قيد التحضير */
export async function mergeKitchen(targetId: number, sourceId: number) {
  const rows = await sql`SELECT id, kitchen_status, kitchen_snapshot, kitchen_sent_at, kitchen_done_at FROM restaurant_orders_tbl WHERE id IN (${targetId}, ${sourceId})`
  const target = rows.find((row: any) => Number(row.id) === targetId), source = rows.find((row: any) => Number(row.id) === sourceId)
  if (!target || !source || !source.kitchen_status) return
  await sql`UPDATE restaurant_orders_tbl SET kitchen_status = NULL WHERE id = ${sourceId}`
  if (!target.kitchen_status) {
    await sql`
      UPDATE restaurant_orders_tbl SET kitchen_status = ${source.kitchen_status}, kitchen_snapshot = ${JSON.stringify(snapshotOf(source.kitchen_snapshot) || [])}::jsonb,
        kitchen_sent_at = ${source.kitchen_sent_at}, kitchen_done_at = ${source.kitchen_done_at}
      WHERE id = ${targetId}
    `
    return
  }
  const pending = (value: string) => KITCHEN_PENDING.includes(value as KitchenStatus)
  const next = target.kitchen_status === "new" && source.kitchen_status === "new" ? "new"
    : pending(target.kitchen_status) || pending(source.kitchen_status) ? "changed" : target.kitchen_status
  const snapshot = [...(snapshotOf(target.kitchen_snapshot) || []), ...(snapshotOf(source.kitchen_snapshot) || [])]
  await sql`
    UPDATE restaurant_orders_tbl SET kitchen_status = ${next}, kitchen_snapshot = ${JSON.stringify(snapshot)}::jsonb,
      kitchen_sent_at = LEAST(kitchen_sent_at, ${source.kitchen_sent_at}::timestamptz),
      kitchen_changed_at = CASE WHEN ${next} = 'changed' THEN NOW() ELSE kitchen_changed_at END
    WHERE id = ${targetId}
  `
}

/**
 * فصل كميات لطاولة أخرى: الكمية المنقولة تُنقل من لقطة المصدر للهدف (وإلا ظهرت للمطبخ كطلب جديد يُحضَّر مرتين).
 * moves: {fromItemId, toItemId, quantity} — toItemId = نفس السطر إن نُقل كاملاً.
 */
export async function splitKitchen(sourceId: number, targetId: number, moves: { fromItemId: number; toItemId: number; quantity: number }[]) {
  const rows = await sql`SELECT id, kitchen_status, kitchen_snapshot, kitchen_sent_at, kitchen_done_at FROM restaurant_orders_tbl WHERE id IN (${targetId}, ${sourceId})`
  const target = rows.find((row: any) => Number(row.id) === targetId), source = rows.find((row: any) => Number(row.id) === sourceId)
  const sourceSnapshot = snapshotOf(source?.kitchen_snapshot)
  if (!target || !source || !sourceSnapshot) return
  const moved: KitchenItem[] = []
  for (const move of moves) {
    const seen = sourceSnapshot.find((item) => item.id === move.fromItemId)
    if (!seen) continue
    const quantity = Math.min(seen.quantity, move.quantity)
    seen.quantity = num(seen.quantity - quantity)
    if (quantity > 0) moved.push({ ...seen, id: move.toItemId, quantity })
  }
  const remaining = sourceSnapshot.filter((item) => item.quantity > 0)
  await sql`UPDATE restaurant_orders_tbl SET kitchen_snapshot = ${JSON.stringify(remaining)}::jsonb WHERE id = ${sourceId}`
  if (!moved.length) return
  const targetSnapshot = [...(snapshotOf(target.kitchen_snapshot) || []), ...moved]
  const status = target.kitchen_status
    ? (KITCHEN_PENDING.includes(target.kitchen_status) || KITCHEN_PENDING.includes(source.kitchen_status) ? (target.kitchen_status === "new" && source.kitchen_status === "new" ? "new" : "changed") : target.kitchen_status)
    : source.kitchen_status
  await sql`
    UPDATE restaurant_orders_tbl SET kitchen_status = ${status}, kitchen_snapshot = ${JSON.stringify(targetSnapshot)}::jsonb,
      kitchen_sent_at = COALESCE(kitchen_sent_at, ${source.kitchen_sent_at}::timestamptz), kitchen_done_at = COALESCE(kitchen_done_at, ${source.kitchen_done_at}::timestamptz)
    WHERE id = ${targetId}
  `
}

// ───────────── شاشة المطبخ ─────────────

export type KitchenCard = {
  order_id: number; order_no: string; order_status: string; order_type: string; takeaway_name: string | null
  location_id: number; location_name: string; tables: string; waiter_name: string | null; guests: number; note: string | null
  kitchen_status: KitchenStatus; kitchen_sent_at: string | null; kitchen_changed_at: string | null; kitchen_done_at: string | null
  kitchen_reason: string | null; cancel_reason: string | null; lines: KitchenLine[]
}

export async function kitchenBoard(branchId: number, locationId: number | null, view: "active" | "done"): Promise<KitchenCard[]> {
  const orders = view === "active"
    ? await sql`
        SELECT o.*, l.name AS location_name, COALESCE(NULLIF(wu.full_name, ''), wu.username, o.waiter_id) AS waiter_name
        FROM restaurant_orders_tbl o
        JOIN restaurant_locations_tbl l ON l.id = o.location_id
        LEFT JOIN user_settings wu ON wu.user_id::text = o.waiter_id
        WHERE o.branch_id = ${branchId} AND o.kitchen_status IN ('new', 'changed', 'cancelled')
          AND (${locationId || 0}::int = 0 OR o.location_id = ${locationId || 0})
        ORDER BY COALESCE(o.kitchen_sent_at, o.opened_at), o.id
        LIMIT 200
      `
    : await sql`
        SELECT o.*, l.name AS location_name, COALESCE(NULLIF(wu.full_name, ''), wu.username, o.waiter_id) AS waiter_name
        FROM restaurant_orders_tbl o
        JOIN restaurant_locations_tbl l ON l.id = o.location_id
        LEFT JOIN user_settings wu ON wu.user_id::text = o.waiter_id
        WHERE o.branch_id = ${branchId} AND o.kitchen_status IN ('done', 'rejected', 'dismissed')
          AND o.kitchen_done_at >= NOW() - INTERVAL '12 hours'
          AND (${locationId || 0}::int = 0 OR o.location_id = ${locationId || 0})
        ORDER BY o.kitchen_done_at DESC
        LIMIT 60
      `
  if (!orders.length) return []
  const ids = orders.map((order: any) => Number(order.id))
  const [items, tables] = await Promise.all([
    sql`
      SELECT id, order_id, product_id, product_name, unit_name, quantity, addons, note FROM restaurant_order_items_tbl
      WHERE order_id = ANY(${ids}::int[]) AND NOT COALESCE(is_table_service, FALSE) AND quantity > 0
      ORDER BY id
    `,
    sql`
      SELECT ot.order_id, string_agg(t.name, ' + ' ORDER BY ot.is_primary DESC, t.sort_order, t.id) AS names
      FROM restaurant_order_tables_tbl ot JOIN restaurant_tables_tbl t ON t.id = ot.table_id
      WHERE ot.order_id = ANY(${ids}::int[]) AND (ot.active OR ot.released_at >= NOW() - INTERVAL '12 hours')
      GROUP BY ot.order_id
    `,
  ])
  const itemsByOrder = new Map<number, KitchenItem[]>()
  for (const row of items) {
    const list = itemsByOrder.get(Number(row.order_id)) || []
    list.push(toKitchenItem(row))
    itemsByOrder.set(Number(row.order_id), list)
  }
  const tablesByOrder = new Map<number, string>(tables.map((row: any) => [Number(row.order_id), String(row.names || "")]))
  return orders.map((order: any) => {
    const current = itemsByOrder.get(Number(order.id)) || []
    const snapshot = snapshotOf(order.kitchen_snapshot)
    // البطاقة المعدّلة تُبرز الفرق عمّا رآه المطبخ؛ غيرها تعرض الأصناف كما هي
    const lines = order.kitchen_status === "changed" ? diffItems(current, snapshot)
      : order.kitchen_status === "cancelled" ? (snapshot || current).map((item) => ({ ...item, change: "same" as const }))
      : current.map((item) => ({ ...item, change: "same" as const }))
    return {
      order_id: Number(order.id), order_no: String(order.order_no || order.id), order_status: String(order.status), order_type: String(order.order_type || "dine_in"),
      takeaway_name: order.takeaway_name || null, location_id: Number(order.location_id), location_name: String(order.location_name || ""),
      tables: tablesByOrder.get(Number(order.id)) || "", waiter_name: order.waiter_name || null, guests: Number(order.guests) || 0, note: order.note || null,
      kitchen_status: order.kitchen_status, kitchen_sent_at: order.kitchen_sent_at, kitchen_changed_at: order.kitchen_changed_at, kitchen_done_at: order.kitchen_done_at,
      kitchen_reason: order.kitchen_reason || null, cancel_reason: order.cancel_reason || null, lines,
    }
  })
}

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status })

/**
 * إجراءات المطبخ (داخل معاملة): done «تم» · reject «إلغاء» بسبب · dismiss «تم الاطلاع» على طلب ألغته الصالة · recall إعادة طلب منجز.
 * seen يمنع «تم» على نسخة قديمة: إن عدّلت الصالة الطلب بعد آخر تحميل للشاشة يُرفض حتى يراجع المطبخ التعديل.
 */
export async function kitchenAction(input: { orderId: number; branchId: number; action: string; seen?: string | null; reason?: string; userId: string }) {
  const order = (await sql`SELECT * FROM restaurant_orders_tbl WHERE id = ${input.orderId} FOR UPDATE`)[0]
  if (!order || Number(order.branch_id) !== input.branchId) throw fail("الطلب غير موجود", 404)
  const status = order.kitchen_status as KitchenStatus | null
  // seen = kitchen_changed_at كما عرضته الشاشة (الدفع وتغيّر revision لا يمسّان المطبخ)
  const stamp = (value: unknown) => value ? new Date(value as string).getTime() : 0
  const stale = input.seen !== undefined && stamp(input.seen) !== stamp(order.kitchen_changed_at)
  if (input.action === "done" || input.action === "reject") {
    if (!status || !KITCHEN_PENDING.includes(status)) throw fail("الطلب لم يعد قيد التحضير؛ حدّث الشاشة", 409)
    if (stale) throw fail("عُدِّل الطلب للتو من الصالة — راجع التعديل ثم أعد المحاولة", 409)
    const reason = String(input.reason || "").trim().slice(0, 300)
    if (input.action === "reject" && !reason) throw fail("سبب الإلغاء مطلوب")
    const current = await kitchenItems(input.orderId)
    await sql`
      UPDATE restaurant_orders_tbl SET kitchen_status = ${input.action === "done" ? "done" : "rejected"}, kitchen_snapshot = ${JSON.stringify(current)}::jsonb,
        kitchen_done_at = NOW(), kitchen_done_by = ${input.userId}, kitchen_reason = ${input.action === "reject" ? reason : null}
      WHERE id = ${input.orderId}
    `
    await logRestaurant(input.orderId, input.action === "done" ? "kitchen_done" : "kitchen_reject", { ...(reason ? { reason } : {}), items: current.map((item) => ({ name: item.name, quantity: item.quantity })) }, input.userId)
    return
  }
  if (input.action === "dismiss") {
    if (status !== "cancelled") throw fail("الطلب ليس ملغى؛ حدّث الشاشة", 409)
    await sql`UPDATE restaurant_orders_tbl SET kitchen_status = 'dismissed', kitchen_done_at = NOW(), kitchen_done_by = ${input.userId} WHERE id = ${input.orderId}`
    await logRestaurant(input.orderId, "kitchen_dismiss", {}, input.userId)
    return
  }
  if (input.action === "recall") {
    if (status !== "done" && status !== "rejected") throw fail("لا يمكن إرجاع هذا الطلب", 409)
    if (order.status !== "open" && order.status !== "paid") throw fail("الطلب ملغى أو مدموج", 409)
    await sql`UPDATE restaurant_orders_tbl SET kitchen_status = 'new', kitchen_reason = NULL, kitchen_changed_at = NULL WHERE id = ${input.orderId}`
    await logRestaurant(input.orderId, "kitchen_recall", {}, input.userId)
    return
  }
  throw fail("إجراء غير معروف")
}
