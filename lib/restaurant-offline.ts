"use client"

import type { FloorLocation, FloorTable, OrderItem } from "@/components/restaurant/restaurant-dialogs"
import type { Takeaway } from "@/components/restaurant/restaurant-floor"
import type { Order } from "@/components/restaurant/restaurant-order"

// شاشة المطعم دون اتصال — "هذا الجهاز فقط" (2026-11-18):
//   • آخر لوحة طاولات وطلبات مفتوحة وعهدة لكل موقع تُحفظ على الجهاز (localStorage) عند كل تحميل ناجح.
//   • دون اتصال: الإجراءات (فتح طاولة/سفري، إرسال للمطبخ، تعديل/حذف صنف، خصم/أشخاص/اسم، إلغاء، دفع) تُطبَّق على نسخة
//     محلية من الطلب وتُحفظ في طابور. طلب جديد يأخذ رقماً سالباً مؤقتاً، وكذلك الأصناف المضافة دون اتصال.
//   • عند عودة الاتصال: syncRestaurantOffline يعيد تنفيذ الطابور بالترتيب على /api/restaurant/orders ويحوّل الأرقام المؤقتة إلى
//     الحقيقية (الطلب من رد open، والأصناف بمقارنة أصناف الطلب قبل add_items وبعده). الدفع يُرسل بأسطر صريحة = ما طُبع إيصاله.
//   • طاولة فُتحت من جهاز آخر أثناء الانقطاع ⇐ يُحفظ الطلب كسفري باسم الطاولة بدل خلطه بطلب غيره.
//   • الدمج/الفصل/النقل/تحويل النادل تحتاج اتصالاً (تؤثر على طاولات وأجهزة أخرى).

type Floor = { branch_id: number; permissions: any; locations: FloorLocation[]; tables: FloorTable[]; takeaways: Takeaway[]; server_time: string; me?: any; kitchen_stuck?: number }
export type OfflineOp = { id: string; action: string; body: Record<string, any>; at: string; label: string; status: "queued" | "failed"; error?: string }
type State = { seq: number; ops: OfflineOp[]; orders: Record<string, Order>; floor: Floor | null; custody: Record<string, any> }

export const OFFLINE_ACTIONS = new Set(["open", "open_takeaway", "add_items", "update_item", "remove_item", "update_order", "cancel", "pay", "print"])
const ACTION_LABELS: Record<string, string> = { open: "فتح طاولة", open_takeaway: "فتح سفري", add_items: "إرسال أصناف", update_item: "تعديل صنف", remove_item: "حذف صنف", update_order: "تعديل الطلب", cancel: "إلغاء الطلب", pay: "دفع" }

let storeKey = "restaurant-offline"
export function setRestaurantOfflineScope(tenantKey: string) { storeKey = `restaurant-offline:${tenantKey}` }

function read(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(storeKey) || "null")
    if (parsed && typeof parsed === "object") return { seq: Number(parsed.seq) || 0, ops: parsed.ops || [], orders: parsed.orders || {}, floor: parsed.floor || null, custody: parsed.custody || {} }
  } catch {}
  return { seq: 0, ops: [], orders: {}, floor: null, custody: {} }
}
function write(state: State) {
  try { localStorage.setItem(storeKey, JSON.stringify(state)) } catch { /* مساحة ممتلئة: تبقى النسخة السابقة */ }
}
const update = <T>(fn: (state: State) => T): T => { const state = read(); const result = fn(state); write(state); return result }

/** خطأ شبكة (لا يوجد اتصال بالخادم) — بخلاف رفض الخادم */
export const isNetworkError = (error: unknown) => error instanceof TypeError || (error instanceof Error && error.name === "NetworkError")
export const isLocalId = (id: unknown) => Number(id) < 0

const round2 = (value: number) => Math.round(value * 100) / 100
const lineNet = (item: OrderItem, quantity: number) => item.price * quantity * (1 - Number(item.discount || 0) / 100)
function retotal(order: Order) {
  const discount = 1 - Number(order.discount_percent || 0) / 100
  for (const item of order.items) item.remaining_quantity = Math.max(0, Math.round((item.quantity - item.paid_quantity) * 10000) / 10000)
  order.totals = {
    gross: round2(order.items.reduce((sum, item) => sum + lineNet(item, item.quantity), 0) * discount),
    remaining: round2(order.items.reduce((sum, item) => sum + lineNet(item, item.remaining_quantity), 0) * discount),
    paid: round2(order.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
  }
  return order
}

// ---------------- النسخ المحفوظة (متصلاً) ----------------
export function cacheFloor(floor: Floor) {
  update((state) => {
    state.floor = floor
    // طلب خادم أُغلق/أُلغي من جهاز آخر ولا عمليات معلّقة عليه ⇐ لا داعي لإبقاء نسخته
    const open = new Set([...floor.tables.map((t) => t.order_id), ...floor.takeaways.map((t) => t.order_id)].filter(Boolean).map(Number))
    const touched = new Set(state.ops.map((op) => Number(op.body.order_id)))
    for (const key of Object.keys(state.orders)) if (Number(key) > 0 && !open.has(Number(key)) && !touched.has(Number(key))) delete state.orders[key]
  })
}
export function cacheOrder(order: Order) { update((state) => { if (!state.ops.some((op) => Number(op.body.order_id) === order.id)) state.orders[String(order.id)] = order }) }
export function cacheCustody(locationId: number, info: any) { update((state) => { state.custody[String(locationId)] = info }) }
export const cachedCustody = (locationId: number) => read().custody[String(locationId)] || null
export const offlineOrder = (orderId: number): Order | null => read().orders[String(orderId)] || null
export const offlineOps = () => read().ops
export const hasQueuedOps = () => read().ops.length > 0
/** طلب عليه عمليات دون اتصال لم تُزامن بعد ⇐ تُعرض نسخته المحلية وتُطبَّق إجراءاته محلياً حتى المزامنة */
export const hasOfflineChanges = (orderId: number) => orderId < 0 || read().ops.some((op) => Number(op.body.local_order_id ?? op.body.order_id) === orderId)

/** لوحة الطاولات المحفوظة + طلبات هذا الجهاز دون اتصال فوقها */
export function offlineFloor(): Floor | null {
  const state = read()
  if (!state.floor) return null
  const floor: Floor = JSON.parse(JSON.stringify(state.floor))
  // فقط طلبات هذا الجهاز دون اتصال (مؤقتة أو عليها عمليات معلّقة) — نسخ الطلبات المحفوظة للعرض لا تُغطي اللوحة
  const touched = new Set(state.ops.map((op) => Number(op.body.local_order_id ?? op.body.order_id)))
  for (const order of Object.values(state.orders)) {
    if (order.id > 0 && !touched.has(order.id)) continue
    const live = order.status === "open"
    const summary = { remaining: order.totals.remaining, items_count: order.items.length, paid_amount: order.totals.paid }
    if (order.order_type === "takeaway") {
      floor.takeaways = floor.takeaways.filter((row) => row.order_id !== order.id)
      if (live) floor.takeaways.push({ order_id: order.id, order_no: order.order_no, takeaway_name: order.takeaway_name, location_id: order.location_id, opened_at: order.opened_at, opened_by_name: null, ...summary })
      continue
    }
    const ids = new Set(order.tables.map((t) => t.table_id))
    floor.tables = floor.tables.map((table) => {
      if (!ids.has(table.id) && table.order_id !== order.id) return table
      return live
        ? { ...table, order_id: order.id, order_no: order.order_no, guests: order.guests, opened_at: order.opened_at, revision: order.revision, is_primary: true, ...summary }
        : { ...table, order_id: null, order_no: null, guests: null, opened_at: null, revision: null, is_primary: null, remaining: 0, items_count: 0, paid_amount: 0, merged_with: null, kitchen_status: null, kitchen_reason: null }
    })
  }
  return floor
}

// ---------------- تنفيذ إجراء دون اتصال ----------------
type Context = { floor: Floor | null; userName?: string }
type Result = { order_id: number; order: Order; vch_code?: string; closed?: boolean; offline: true }

export function applyOffline(action: string, body: Record<string, any>, ctx: Context): Result {
  if (!OFFLINE_ACTIONS.has(action)) throw new Error("هذا الإجراء يحتاج اتصالاً بالخادم")
  return update((state) => {
    const nextId = () => -(++state.seq)
    const now = new Date().toISOString()
    let order: Order
    if (action === "open" || action === "open_takeaway") {
      const floor = ctx.floor || state.floor
      const table = action === "open" ? floor?.tables.find((t) => t.id === Number(body.table_id)) : null
      if (action === "open" && !table) throw new Error("الطاولة غير موجودة في النسخة المحفوظة")
      if (table?.order_id) return { order_id: table.order_id, order: state.orders[String(table.order_id)], offline: true as const }
      const locationId = Number(table?.location_id ?? body.location_id)
      const location = floor?.locations.find((l) => l.id === locationId)
      const id = nextId()
      order = {
        id, order_no: `OFF${-id}`, branch_id: Number(floor?.branch_id || 0), location_id: locationId, location_name: location?.name || "", status: "open",
        order_type: action === "open" ? "dine_in" : "takeaway", takeaway_name: action === "open_takeaway" ? String(body.name || "").trim() || null : null,
        guests: action === "open" ? Math.max(1, Number(body.guests) || 1) : 1, customer_id: null, customer_name: "", discount_percent: 0, note: null, revision: 0, opened_at: now,
        tables: table ? [{ table_id: table.id, is_primary: true, name: table.name, seats: table.seats, location_id: table.location_id, location_name: location?.name || "" }] : [],
        items: [], payments: [], totals: { gross: 0, remaining: 0, paid: 0 }, waiter_name: ctx.userName || null,
      }
      // اسم الطاولة يُحفظ مع العملية: إن فُتحت من جهاز آخر أثناء الانقطاع يُحفظ الطلب سفرياً باسمها
      state.ops.push({ id: `op${id}`, action, body: { ...body, local_order_id: id, location_id: locationId, table_name: table?.name || "" }, at: now, label: ACTION_LABELS[action], status: "queued" })
      state.orders[String(id)] = retotal(order)
      return { order_id: id, order, offline: true as const }
    }

    const orderId = Number(body.order_id)
    const current = state.orders[String(orderId)]
    if (!current) throw new Error("الطلب غير محفوظ على هذا الجهاز — افتحه مرة واحدة متصلاً")
    order = JSON.parse(JSON.stringify(current))
    let extra: Partial<Result> = {}
    const opBody = { ...body }
    if (action === "add_items") {
      opBody.items = (body.items || []).map((item: any) => {
        const id = nextId()
        order.items.push({
          id, product_id: Number(item.product_id), product_code: "", product_name: String(item.product_name || ""), unit_id: item.unit_id ?? null, unit_name: item.unit_name ?? null,
          price: Number(item.price || 0), quantity: Number(item.quantity || 0), paid_quantity: 0, remaining_quantity: Number(item.quantity || 0),
          discount: Number(item.discount || 0), note: item.note || null, created_at: now, addons: item.addons || [],
        })
        return { ...item, local_item_id: id }
      })
      delete opBody.queue_tickets
    } else if (action === "update_item" || action === "remove_item") {
      const item = order.items.find((row) => row.id === Number(body.item_id))
      if (!item) throw new Error("الصنف غير موجود في هذا الطلب")
      if (action === "remove_item") {
        if (item.paid_quantity > 0) item.quantity = item.paid_quantity
        else order.items = order.items.filter((row) => row !== item)
      } else {
        if (body.quantity !== undefined) {
          if (Number(body.quantity) < item.paid_quantity) throw new Error(`لا يمكن أن تقل الكمية عن المدفوع منها (${item.paid_quantity})`)
          item.quantity = Number(body.quantity)
        }
        if (body.discount !== undefined) item.discount = Number(body.discount)
        if (body.note !== undefined) item.note = String(body.note || "") || null
        if (body.addons !== undefined) item.addons = body.addons
      }
    } else if (action === "update_order") {
      if (body.guests !== undefined) order.guests = Math.max(1, Number(body.guests) || 1)
      if (body.discount_percent !== undefined) order.discount_percent = Number(body.discount_percent) || 0
      if (body.takeaway_name !== undefined) order.takeaway_name = String(body.takeaway_name || "").trim() || null
    } else if (action === "cancel") {
      order.status = "cancelled"
    } else if (action === "print") {
      // ورقة الحساب طُبعت محلياً؛ تعليم «الحساب مطلوب» على الخادم غير لازم بعد الانقطاع
      return { order_id: orderId, order, offline: true as const }
    } else if (action === "pay") {
      const requested = Array.isArray(body.lines) && body.lines.length ? new Map<number, number>(body.lines.map((line: any) => [Number(line.item_id), Number(line.quantity)])) : null
      const lines: { item_id: number; quantity: number }[] = []
      for (const item of order.items) {
        const quantity = requested ? Math.min(requested.get(item.id) ?? 0, item.remaining_quantity) : item.remaining_quantity
        if (quantity > 0) { lines.push({ item_id: item.id, quantity }); item.paid_quantity = Math.round((item.paid_quantity + quantity) * 10000) / 10000 }
      }
      if (!lines.length) throw new Error("لا توجد كميات غير مدفوعة للدفع")
      // أسطر صريحة دائماً: يُفوتر على الخادم ما طُبع إيصاله بالضبط (لا سطر خدمة طاولة أضافه الخادم عند المزامنة)
      opBody.lines = lines
      delete opBody.revision
      const paymentId = nextId()
      const amount = round2((body.pos_payments || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0))
      order.payments.push({ id: paymentId, vch_code: `OFF${-paymentId}`, amount, created_at: now })
      retotal(order)
      const closed = order.items.every((item) => item.remaining_quantity <= 0)
      if (closed) order.status = "closed"
      extra = { closed, vch_code: "" }
    }
    order.revision += 1
    state.orders[String(orderId)] = retotal(order)
    state.ops.push({ id: `op${nextId()}`, action, body: opBody, at: now, label: ACTION_LABELS[action] || action, status: "queued" })
    return { order_id: orderId, order, offline: true as const, ...extra }
  })
}

// ---------------- المزامنة ----------------
export type SyncResult = { done: number; failed: number; network: boolean; notes: string[] }
let syncing: Promise<SyncResult> | null = null

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/restaurant/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(String(data?.error || "تعذر تنفيذ العملية")), { status: response.status })
  return data
}
async function getOrder(id: number): Promise<Order> {
  const response = await fetch(`/api/restaurant/orders?id=${id}`, { cache: "no-store" })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(String(data?.error || "تعذر تحميل الطلب")), { status: response.status })
  return data
}

/** إعادة تنفيذ الطابور على الخادم بالترتيب. خطأ شبكة ⇐ يتوقف ويُعاد لاحقاً؛ رفض الخادم ⇐ تُعلَّم العملية فاشلة وتُتخطّى عمليات طلبها التالية. */
export function syncRestaurantOffline(): Promise<SyncResult> {
  if (syncing) return syncing
  syncing = (async () => {
    const result: SyncResult = { done: 0, failed: 0, network: false, notes: [] }
    const orderMap = new Map<number, number>(), itemMap = new Map<number, number>()
    const blocked = new Set<number>()
    const real = (id: number) => (id < 0 ? orderMap.get(id) ?? 0 : id)
    const realItem = (id: number) => (id < 0 ? itemMap.get(id) ?? 0 : id)
    for (const op of read().ops) {
      if (op.status === "failed") continue
      const localOrder = Number(op.body.local_order_id ?? op.body.order_id)
      if (blocked.has(localOrder)) continue
      try {
        if (op.action === "open" || op.action === "open_takeaway") {
          let data = await post(op.action === "open" ? { action: "open", table_id: op.body.table_id, guests: op.body.guests } : { action: "open_takeaway", location_id: op.body.location_id, name: op.body.name })
          if (op.action === "open" && data.existing) {
            data = await post({ action: "open_takeaway", location_id: op.body.location_id, name: `${op.body.table_name || "طاولة"} (دون اتصال)` })
            result.notes.push(`الطاولة ${op.body.table_name} فُتحت من جهاز آخر أثناء الانقطاع — حُفظ طلبها سفرياً`)
          }
          orderMap.set(localOrder, Number(data.order_id))
        } else {
          const orderId = real(Number(op.body.order_id))
          if (!orderId) throw new Error("الطلب المؤقت لم يُنشأ على الخادم")
          const body: Record<string, any> = { ...op.body, action: op.action, order_id: orderId }
          if (op.body.item_id !== undefined) body.item_id = realItem(Number(op.body.item_id))
          if (op.action === "add_items") {
            const before = new Set((await getOrder(orderId)).items.map((item) => item.id))
            body.items = op.body.items.map(({ local_item_id: _local, ...item }: any) => item)
            const data = await post(body)
            const added = ((data.order?.items || []) as OrderItem[]).filter((item) => !before.has(item.id)).sort((a, b) => a.id - b.id)
            op.body.items.forEach((item: any, index: number) => { if (added[index]) itemMap.set(Number(item.local_item_id), added[index].id) })
          } else if (op.action === "pay") {
            body.revision = (await getOrder(orderId)).revision
            body.lines = op.body.lines.map((line: any) => ({ item_id: realItem(Number(line.item_id)), quantity: line.quantity }))
            await post(body)
          } else {
            await post(body)
          }
        }
        result.done += 1
        update((state) => { state.ops = state.ops.filter((row) => row.id !== op.id) })
      } catch (error) {
        // بلا اتصال أو جلسة منتهية (يُعاد الدخول تلقائياً بعد الدخول دون اتصال) ⇐ يُعاد لاحقاً
        if (isNetworkError(error) || (error as { status?: number })?.status === 401) { result.network = true; break }
        result.failed += 1
        blocked.add(localOrder)
        update((state) => { const row = state.ops.find((item) => item.id === op.id); if (row) { row.status = "failed"; row.error = error instanceof Error ? error.message : String(error) } })
      }
    }
    // الطلبات التي اكتملت مزامنتها لا تُحفظ محلياً بعد الآن (تُقرأ من الخادم)
    update((state) => {
      const pendingOrders = new Set(state.ops.map((op) => Number(op.body.local_order_id ?? op.body.order_id)))
      for (const key of Object.keys(state.orders)) if (!pendingOrders.has(Number(key)) && (Number(key) < 0 || orderMap.size || result.done)) delete state.orders[key]
    })
    return result
  })().finally(() => { syncing = null })
  return syncing
}

/** حذف العمليات الفاشلة بعد مراجعتها (تبقى مسجّلة في رسالة التنبيه حتى الحذف) */
export function discardFailedOps() {
  update((state) => {
    const failedOrders = new Set(state.ops.filter((op) => op.status === "failed").map((op) => Number(op.body.local_order_id ?? op.body.order_id)))
    state.ops = state.ops.filter((op) => op.status !== "failed" && !failedOrders.has(Number(op.body.local_order_id ?? op.body.order_id)))
    for (const id of failedOrders) delete state.orders[String(id)]
  })
}
