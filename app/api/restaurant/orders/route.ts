import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import {
  authorizeRestaurant,
  ensureRestaurantTables,
  errorStatus,
  cleanAddons,
  lineNet,
  loadOrder,
  locationSalePoint,
  lockOpenOrder,
  logRestaurant,
  ORDER_STATUS,
  releaseOrderTables,
  remainingQuantity,
  tableWithState,
  touchOrder,
} from "@/lib/restaurant"
import type { RestaurantPermission } from "@/lib/transaction-permission-definitions"
import { savePosSaleCore } from "@/app/api/pos/_sale-core"
import { ensureRestaurantCustodyTables, getOpenRestaurantSession, recordRestaurantSaleCash } from "@/lib/restaurant-custody"
import { ensurePosTables } from "@/app/api/pos/_lib"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { ensureTables as ensureStockVoucherTables } from "@/app/api/stock-vouchers/_lib"
import { ensureDiscountCardTables } from "@/lib/pos-discount-cards"
import { loadStoredSettings } from "@/app/api/settings/system/route"
import { getSessionUser } from "@/lib/tenant-auth"

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status })
const num = (value: unknown) => Number(value) || 0
const qty = (value: unknown) => Math.round(num(value) * 10000) / 10000
const positiveId = (value: unknown) => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : 0
}

const pad = (value: number) => String(value).padStart(2, "0")
const localDateTime = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// الصلاحيات المطلوبة لكل إجراء (بالإضافة لـ"الدخول لشاشة المطعم")
const ACTION_PERMISSIONS: Record<string, RestaurantPermission[]> = {
  open: ["openTable"],
  open_takeaway: ["takeaway"],
  update_order: ["openTable"],
  add_items: ["addItems"],
  update_item: ["editItems"],
  remove_item: ["deleteItems"],
  transfer: ["transfer"],
  merge: ["merge"],
  unmerge: ["split"],
  split: ["split"],
  cancel: ["cancelOrder"],
  close: ["pay"],
  pay: ["pay"],
  print: ["printBill"],
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureRestaurantTables()
    const id = positiveId(request.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "معرف الطلب غير صالح" }, { status: 400 })
    const branch = (await sql`SELECT branch_id FROM restaurant_orders_tbl WHERE id = ${id}`)[0]
    if (!branch) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    const auth = await authorizeRestaurant(request, [], branch.branch_id)
    if (!auth.ok) return auth.response
    return NextResponse.json(await loadOrder(id))
  } catch (error) {
    console.error("restaurant order GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الطلب" }, { status: errorStatus(error) })
  }
}

type Ctx = { userId: string; branchId: number; permissions: Record<RestaurantPermission, boolean>; data: any; request: NextRequest }

async function attachTable(orderId: number, tableId: number, primary: boolean) {
  try {
    await sql`INSERT INTO restaurant_order_tables_tbl (order_id, table_id, is_primary) VALUES (${orderId}, ${tableId}, ${primary})`
  } catch (error: any) {
    if (String(error?.code) === "23505") throw fail("الطاولة أصبحت مشغولة من مستخدم آخر؛ حدّث الشاشة", 409)
    throw error
  }
}

/** طاولة هدف صالحة على نفس الفرع (نشطة وموقعها نشط) */
async function targetTable(tableId: number, branchId: number) {
  const table = tableId ? await tableWithState(tableId) : null
  if (!table || Number(table.status) !== 1 || Number(table.location_status) !== 1) throw fail("الطاولة غير صالحة أو موقوفة")
  if (Number(table.branch_id) !== branchId) throw fail("الطاولة تتبع فرعاً آخر")
  return table
}

async function createOrder(table: any, ctx: Ctx, guests: number, note: string | null) {
  const order = (await sql`
    INSERT INTO restaurant_orders_tbl (branch_id, location_id, guests, note, opened_by)
    VALUES (${Number(table.branch_id)}, ${Number(table.location_id)}, ${guests}, ${note}, ${ctx.userId})
    RETURNING id
  `)[0]
  const id = Number(order.id)
  await sql`UPDATE restaurant_orders_tbl SET order_no = ${`R${String(id).padStart(6, "0")}`} WHERE id = ${id}`
  await attachTable(id, Number(table.id), true)
  return id
}

function requireDiscountPermission(ctx: Ctx, discount: number) {
  if (discount > 0 && !ctx.permissions.discount) throw fail("لا توجد لديك صلاحية إدخال خصم - مطاعم", 403)
}

async function handleOpen(ctx: Ctx) {
  const table = await targetTable(positiveId(ctx.data.table_id), ctx.branchId)
  if (table.order_id) return { order_id: Number(table.order_id), existing: true }
  const guests = Math.min(999, Math.max(1, Math.trunc(num(ctx.data.guests)) || 1))
  const id = await createOrder(table, ctx, guests, String(ctx.data.note || "").trim().slice(0, 500) || null)
  await logRestaurant(id, "open", { table_id: Number(table.id), guests }, ctx.userId)
  return { order_id: id }
}

async function handleOpenTakeaway(ctx: Ctx) {
  const location = (await sql`SELECT id, branch_id FROM restaurant_locations_tbl WHERE id = ${positiveId(ctx.data.location_id)} AND status = 1`)[0]
  if (!location || Number(location.branch_id) !== ctx.branchId) throw fail("اختر موقعاً نشطاً في هذا الفرع")
  const name = String(ctx.data.name || "").trim().slice(0, 100) || null
  const order = (await sql`
    INSERT INTO restaurant_orders_tbl (branch_id, location_id, order_type, takeaway_name, guests, note, opened_by)
    VALUES (${ctx.branchId}, ${Number(location.id)}, 'takeaway', ${name}, 1, ${String(ctx.data.note || "").trim().slice(0, 500) || null}, ${ctx.userId})
    RETURNING id
  `)[0]
  const id = Number(order.id)
  await sql`UPDATE restaurant_orders_tbl SET order_no = ${`S${String(id).padStart(6, "0")}`} WHERE id = ${id}`
  await logRestaurant(id, "open_takeaway", { location_id: Number(location.id), name }, ctx.userId)
  return { order_id: id }
}

async function handleUpdateOrder(ctx: Ctx, order: any) {
  const guests = ctx.data.guests === undefined ? Number(order.guests) : Math.min(999, Math.max(1, Math.trunc(num(ctx.data.guests)) || 1))
  const note = ctx.data.note === undefined ? order.note : String(ctx.data.note || "").trim().slice(0, 500) || null
  let customerId = ctx.data.customer_id === undefined ? order.customer_id : positiveId(ctx.data.customer_id) || null
  if (customerId) {
    const customer = (await sql`SELECT id FROM account_tbl WHERE id = ${customerId} AND COALESCE(status, 1) <> 3 AND type IN (2,3,5)`)[0]
    if (!customer) throw fail("العميل غير صالح")
  }
  let discount = num(order.discount_percent)
  if (ctx.data.discount_percent !== undefined) {
    discount = Math.round(num(ctx.data.discount_percent) * 1000) / 1000
    if (discount < 0 || discount > 100) throw fail("نسبة الخصم غير صالحة")
    if (discount !== num(order.discount_percent)) requireDiscountPermission(ctx, discount || 1)
  }
  const takeawayName = ctx.data.takeaway_name === undefined ? order.takeaway_name : String(ctx.data.takeaway_name || "").trim().slice(0, 100) || null
  await sql`UPDATE restaurant_orders_tbl SET guests = ${guests}, note = ${note}, customer_id = ${customerId}, discount_percent = ${discount}, takeaway_name = ${takeawayName} WHERE id = ${Number(order.id)}`
  customerId = customerId || null
  await logRestaurant(Number(order.id), "update_order", { guests, customer_id: customerId, discount_percent: discount }, ctx.userId)
}

async function handleAddItems(ctx: Ctx, order: any) {
  const items = Array.isArray(ctx.data.items) ? ctx.data.items : []
  if (!items.length) throw fail("لا توجد أصناف للإضافة")
  if (items.length > 200) throw fail("عدد الأصناف كبير جداً")
  const ids = [...new Set(items.map((item: any) => positiveId(item.product_id)).filter(Boolean))] as number[]
  const products = ids.length ? await sql`
    SELECT id, product_code, product_name FROM products
    WHERE id = ANY(${ids}::int[]) AND COALESCE(deleted, false) = false AND COALESCE(status, 1) <> 3
  ` : []
  const byId = new Map<number, any>(products.map((row: any) => [Number(row.id), row]))
  for (const item of items) {
    const product = byId.get(positiveId(item.product_id))
    if (!product) throw fail("يوجد صنف غير صالح أو محذوف")
    const quantity = qty(item.quantity), price = Math.round(num(item.price) * 10000) / 10000, discount = Math.round(num(item.discount) * 1000) / 1000
    if (!(quantity > 0) || quantity > 100000) throw fail(`كمية الصنف ${product.product_name} غير صالحة`)
    if (price < 0) throw fail(`سعر الصنف ${product.product_name} غير صالح`)
    if (discount < 0 || discount > 100) throw fail(`خصم الصنف ${product.product_name} غير صالح`)
    requireDiscountPermission(ctx, discount)
    await sql`
      INSERT INTO restaurant_order_items_tbl (order_id, product_id, product_code, product_name, unit_id, unit_name, price, quantity, discount, note, addons, added_by)
      VALUES (${Number(order.id)}, ${Number(product.id)}, ${String(product.product_code || "")}, ${String(item.product_name || product.product_name || "").slice(0, 200)},
              ${positiveId(item.unit_id) || null}, ${String(item.unit_name || "").slice(0, 50) || null}, ${price}, ${quantity}, ${discount},
              ${String(item.note || "").trim().slice(0, 300) || null}, ${JSON.stringify(cleanAddons(item.addons))}::jsonb, ${ctx.userId})
    `
  }
  await logRestaurant(Number(order.id), "add_items", { count: items.length }, ctx.userId)
}

async function orderItem(orderId: number, itemId: number) {
  const item = itemId ? (await sql`SELECT * FROM restaurant_order_items_tbl WHERE id = ${itemId} AND order_id = ${orderId} FOR UPDATE`)[0] : null
  if (!item) throw fail("الصنف غير موجود في هذا الطلب", 404)
  return item
}

async function handleUpdateItem(ctx: Ctx, order: any) {
  const item = await orderItem(Number(order.id), positiveId(ctx.data.item_id))
  const quantity = ctx.data.quantity === undefined ? qty(item.quantity) : qty(ctx.data.quantity)
  const discount = ctx.data.discount === undefined ? num(item.discount) : Math.round(num(ctx.data.discount) * 1000) / 1000
  const note = ctx.data.note === undefined ? item.note : String(ctx.data.note || "").trim().slice(0, 300) || null
  const addons = ctx.data.addons === undefined ? cleanAddons(item.addons) : cleanAddons(ctx.data.addons)
  if (!(quantity > 0) || quantity > 100000) throw fail("الكمية غير صالحة")
  if (quantity < qty(item.paid_quantity)) throw fail(`لا يمكن أن تقل الكمية عن المدفوع منها (${qty(item.paid_quantity)})`)
  // تخفيض كمية صنف مُسجَّل = حذف جزء منه
  if (quantity < qty(item.quantity) && !ctx.permissions.deleteItems) throw fail("لا توجد لديك صلاحية حذف أصناف من الطاولة - مطاعم", 403)
  if (discount < 0 || discount > 100) throw fail("نسبة الخصم غير صالحة")
  if (discount !== num(item.discount)) {
    requireDiscountPermission(ctx, discount || 1)
    if (qty(item.paid_quantity) > 0) throw fail("لا يمكن تغيير خصم صنف دُفع جزء منه")
  }
  await sql`UPDATE restaurant_order_items_tbl SET quantity = ${quantity}, discount = ${discount}, note = ${note}, addons = ${JSON.stringify(addons)}::jsonb, updated_at = NOW() WHERE id = ${Number(item.id)}`
  await logRestaurant(Number(order.id), "update_item", { item_id: Number(item.id), from: qty(item.quantity), quantity, discount }, ctx.userId)
}

async function handleRemoveItem(ctx: Ctx, order: any) {
  const item = await orderItem(Number(order.id), positiveId(ctx.data.item_id))
  if (qty(item.paid_quantity) > 0) {
    if (remainingQuantity(item) <= 0) throw fail("الصنف مدفوع بالكامل")
    await sql`UPDATE restaurant_order_items_tbl SET quantity = paid_quantity, updated_at = NOW() WHERE id = ${Number(item.id)}`
  } else {
    await sql`DELETE FROM restaurant_order_items_tbl WHERE id = ${Number(item.id)}`
  }
  await logRestaurant(Number(order.id), "remove_item", { item_id: Number(item.id), product_id: Number(item.product_id), quantity: remainingQuantity(item) }, ctx.userId)
}

async function activeTables(orderId: number) {
  return sql`SELECT table_id, is_primary FROM restaurant_order_tables_tbl WHERE order_id = ${orderId} AND active ORDER BY is_primary DESC, id`
}

async function handleTransfer(ctx: Ctx, order: any) {
  const target = await targetTable(positiveId(ctx.data.to_table_id), ctx.branchId)
  if (target.order_id) throw fail("الطاولة المختارة مشغولة؛ استخدم الدمج بدلاً من النقل", 409)
  if (order.order_type === "takeaway") {
    // تحويل طلب سفري إلى طاولة (الزبون قرر الجلوس)
    await attachTable(Number(order.id), Number(target.id), true)
    await sql`UPDATE restaurant_orders_tbl SET order_type = 'dine_in', location_id = ${Number(target.location_id)} WHERE id = ${Number(order.id)}`
    await logRestaurant(Number(order.id), "transfer", { from: "takeaway", to_table_id: Number(target.id) }, ctx.userId)
    return
  }
  const tables = await activeTables(Number(order.id))
  const fromId = positiveId(ctx.data.from_table_id) || Number(tables[0]?.table_id)
  const from = tables.find((row: any) => Number(row.table_id) === fromId)
  if (!from) throw fail("الطاولة المصدر ليست على هذا الطلب")
  await sql`UPDATE restaurant_order_tables_tbl SET active = FALSE, released_at = NOW() WHERE order_id = ${Number(order.id)} AND table_id = ${fromId} AND active`
  await attachTable(Number(order.id), Number(target.id), Boolean(from.is_primary))
  if (from.is_primary) await sql`UPDATE restaurant_orders_tbl SET location_id = ${Number(target.location_id)} WHERE id = ${Number(order.id)}`
  await logRestaurant(Number(order.id), "transfer", { from_table_id: fromId, to_table_id: Number(target.id) }, ctx.userId)
}

async function handleMerge(ctx: Ctx, order: any) {
  const tableIds = [...new Set((Array.isArray(ctx.data.table_ids) ? ctx.data.table_ids : []).map(positiveId).filter(Boolean))] as number[]
  if (!tableIds.length) throw fail("اختر الطاولات المراد دمجها")
  if (order.order_type === "takeaway") throw fail("انقل الطلب السفري إلى طاولة أولاً ثم ادمج")
  const merged: number[] = []
  for (const tableId of tableIds) {
    const table = await targetTable(tableId, ctx.branchId)
    const sourceId = Number(table.order_id) || 0
    if (sourceId === Number(order.id)) continue
    if (!sourceId) {
      await attachTable(Number(order.id), tableId, false)
      continue
    }
    // طاولة مشغولة: ينتقل طلبها كاملاً (أصنافه، دفعاته وطاولاته) إلى الطلب الحالي
    const source = await lockOpenOrder(sourceId)
    const sourceTables = await activeTables(sourceId)
    await sql`UPDATE restaurant_order_items_tbl SET order_id = ${Number(order.id)}, updated_at = NOW() WHERE order_id = ${sourceId}`
    await sql`UPDATE restaurant_order_payments_tbl SET order_id = ${Number(order.id)} WHERE order_id = ${sourceId}`
    await releaseOrderTables(sourceId)
    for (const row of sourceTables) await attachTable(Number(order.id), Number(row.table_id), false)
    await sql`
      UPDATE restaurant_orders_tbl SET status = ${ORDER_STATUS.merged}, merged_into_order_id = ${Number(order.id)},
        closed_at = NOW(), closed_by = ${ctx.userId}, updated_at = NOW()
      WHERE id = ${sourceId}
    `
    await sql`UPDATE restaurant_orders_tbl SET guests = guests + ${Number(source.guests) || 0} WHERE id = ${Number(order.id)}`
    await logRestaurant(sourceId, "merged_into", { order_id: Number(order.id) }, ctx.userId)
    merged.push(sourceId)
  }
  await logRestaurant(Number(order.id), "merge", { table_ids: tableIds, merged_orders: merged }, ctx.userId)
}

async function handleUnmerge(ctx: Ctx, order: any) {
  const tableId = positiveId(ctx.data.table_id)
  const tables = await activeTables(Number(order.id))
  const row = tables.find((item: any) => Number(item.table_id) === tableId)
  if (!row) throw fail("الطاولة ليست على هذا الطلب")
  if (tables.length < 2) throw fail("الطلب على طاولة واحدة فقط؛ لا يوجد ما يُفك")
  await sql`UPDATE restaurant_order_tables_tbl SET active = FALSE, released_at = NOW() WHERE order_id = ${Number(order.id)} AND table_id = ${tableId} AND active`
  if (row.is_primary) {
    const next = tables.find((item: any) => Number(item.table_id) !== tableId)
    await sql`UPDATE restaurant_order_tables_tbl SET is_primary = TRUE WHERE order_id = ${Number(order.id)} AND table_id = ${Number(next.table_id)} AND active`
    const location = (await sql`SELECT location_id FROM restaurant_tables_tbl WHERE id = ${Number(next.table_id)}`)[0]
    if (location) await sql`UPDATE restaurant_orders_tbl SET location_id = ${Number(location.location_id)} WHERE id = ${Number(order.id)}`
  }
  await logRestaurant(Number(order.id), "unmerge", { table_id: tableId }, ctx.userId)
}

/** ينقل كميات (غير مدفوعة) من أصناف الطلب إلى طاولة أخرى: فارغة ⇐ طلب جديد، مشغولة ⇐ تُضاف لطلبها */
async function handleSplit(ctx: Ctx, order: any) {
  const lines = (Array.isArray(ctx.data.lines) ? ctx.data.lines : [])
    .map((line: any) => ({ itemId: positiveId(line.item_id), quantity: qty(line.quantity) }))
    .filter((line: any) => line.itemId && line.quantity > 0)
  if (!lines.length) throw fail("حدد الأصناف والكميات المراد فصلها")
  const target = await targetTable(positiveId(ctx.data.to_table_id), ctx.branchId)
  if (Number(target.order_id) === Number(order.id)) throw fail("اختر طاولة غير طاولات الطلب الحالي")
  let targetOrderId = Number(target.order_id) || 0
  if (targetOrderId) await lockOpenOrder(targetOrderId)
  else targetOrderId = await createOrder(target, ctx, 1, null)
  for (const line of lines) {
    const item = await orderItem(Number(order.id), line.itemId)
    const remaining = remainingQuantity(item)
    if (line.quantity > remaining + 0.00001) throw fail(`الكمية المفصولة من ${item.product_name} أكبر من غير المدفوع (${remaining})`)
    if (Math.abs(line.quantity - remaining) < 0.00001 && qty(item.paid_quantity) === 0) {
      await sql`UPDATE restaurant_order_items_tbl SET order_id = ${targetOrderId}, updated_at = NOW() WHERE id = ${Number(item.id)}`
      continue
    }
    await sql`UPDATE restaurant_order_items_tbl SET quantity = quantity - ${line.quantity}, updated_at = NOW() WHERE id = ${Number(item.id)}`
    await sql`
      INSERT INTO restaurant_order_items_tbl (order_id, product_id, product_code, product_name, unit_id, unit_name, price, quantity, discount, note, addons, added_by)
      SELECT ${targetOrderId}, product_id, product_code, product_name, unit_id, unit_name, price, ${line.quantity}, discount, note, addons, ${ctx.userId}
      FROM restaurant_order_items_tbl WHERE id = ${Number(item.id)}
    `
  }
  await touchOrder(targetOrderId)
  await logRestaurant(Number(order.id), "split", { to_table_id: Number(target.id), to_order_id: targetOrderId, lines }, ctx.userId)
  return { target_order_id: targetOrderId }
}

async function handleCancel(ctx: Ctx, order: any) {
  const paid = (await sql`SELECT COUNT(*)::int AS n FROM restaurant_order_payments_tbl WHERE order_id = ${Number(order.id)}`)[0]
  if (Number(paid?.n) > 0) throw fail("الطلب عليه دفعات جزئية؛ احذف الأصناف غير المدفوعة ثم أغلق الطاولة", 409)
  const reason = String(ctx.data.reason || "").trim().slice(0, 300)
  if (!reason) throw fail("سبب الإلغاء مطلوب")
  await sql`UPDATE restaurant_orders_tbl SET status = ${ORDER_STATUS.cancelled}, cancel_reason = ${reason}, closed_at = NOW(), closed_by = ${ctx.userId} WHERE id = ${Number(order.id)}`
  await releaseOrderTables(Number(order.id))
  await logRestaurant(Number(order.id), "cancel", { reason }, ctx.userId)
}

/** إغلاق الطلب كمدفوع إن لم يبقَ عليه شيء غير مدفوع */
async function closeIfSettled(orderId: number, userId: string) {
  const left = (await sql`SELECT COALESCE(SUM(GREATEST(quantity - paid_quantity, 0)), 0) AS q FROM restaurant_order_items_tbl WHERE order_id = ${orderId}`)[0]
  if (num(left?.q) > 0.00001) return false
  await sql`UPDATE restaurant_orders_tbl SET status = ${ORDER_STATUS.paid}, closed_at = NOW(), closed_by = ${userId} WHERE id = ${orderId}`
  await releaseOrderTables(orderId)
  return true
}

async function handleClose(ctx: Ctx, order: any) {
  const payments = (await sql`SELECT COUNT(*)::int AS n FROM restaurant_order_payments_tbl WHERE order_id = ${Number(order.id)}`)[0]
  if (!Number(payments?.n)) throw fail("لا توجد دفعات على الطلب؛ استخدم إلغاء الطلب")
  if (!(await closeIfSettled(Number(order.id), ctx.userId))) throw fail("ما زالت هناك أصناف غير مدفوعة")
  await logRestaurant(Number(order.id), "close", {}, ctx.userId)
}

async function handlePrint(ctx: Ctx, order: any) {
  await logRestaurant(Number(order.id), "print", {}, ctx.userId)
}

/**
 * دفع كامل أو جزئي: يُصدر فاتورة كاشير (api/pos/sales) على نقطة بيع الموقع لجزء الكميات المختار، ثم يزيد paid_quantity.
 * الطلب يُغلق تلقائياً عند دفع كل الكميات. revision يمنع الدفع على نسخة قديمة من الطلب (ويجعل رقم العملية فريداً).
 */
async function handlePay(ctx: Ctx, order: any) {
  if (Number(ctx.data.revision) !== Number(order.revision)) throw fail("تغيّر الطلب من مستخدم آخر؛ تمت إعادة تحميله، راجع المبلغ وأعد الدفع", 409)
  // إعدادات البيع من الموقع نفسه (مستقلة عن نقاط بيع الكاشير وعهدته)
  const location = (await sql`SELECT * FROM restaurant_locations_tbl WHERE id = ${Number(order.location_id)}`)[0]
  if (!location) throw fail("موقع الطلب غير موجود")
  const point = await locationSalePoint(location, ctx.userId)
  if (Number(point.branch_id) !== Number(order.branch_id)) throw fail("موقع الطلب يتبع فرعاً آخر")
  // مثل الكاشير: الدفع يتطلب عهدة مفتوحة للمستخدم على موقع الطلب
  const session = await getOpenRestaurantSession(Number(location.id), ctx.userId)
  if (!session) throw fail(`يجب فتح أو استلام عهدة على الموقع "${location.name}" قبل الدفع`)

  const items = await sql`SELECT * FROM restaurant_order_items_tbl WHERE order_id = ${Number(order.id)} ORDER BY id FOR UPDATE`
  const requested = Array.isArray(ctx.data.lines) && ctx.data.lines.length
    ? new Map<number, number>(ctx.data.lines.map((line: any) => [positiveId(line.item_id), qty(line.quantity)] as [number, number]))
    : null
  const selected: { item: any; quantity: number }[] = []
  for (const item of items) {
    const remaining = remainingQuantity(item)
    const quantity = requested ? Math.min(requested.get(Number(item.id)) ?? 0, remaining) : remaining
    if (requested && (requested.get(Number(item.id)) ?? 0) > remaining + 0.00001) throw fail(`الكمية المطلوب دفعها من ${item.product_name} أكبر من غير المدفوع (${remaining})`)
    if (quantity > 0) selected.push({ item, quantity: qty(quantity) })
  }
  if (!selected.length) throw fail("لا توجد كميات غير مدفوعة للدفع")

  const discountPercent = num(order.discount_percent)
  if (discountPercent > 0 && !ctx.permissions.discount) throw fail("لا توجد لديك صلاحية إدخال خصم - مطاعم", 403)
  const productIds = [...new Set(selected.map(({ item }) => Number(item.product_id)))]
  const accounts = new Map<number, number>((await sql`SELECT id, selling_account_id FROM products WHERE id = ANY(${productIds}::int[])`)
    .map((row: any) => [Number(row.id), Number(row.selling_account_id) || 0] as [number, number]))
  const customerId = positiveId(ctx.data.customer_id) || positiveId(order.customer_id) || null
  const customer = customerId ? (await sql`SELECT id, name FROM account_tbl WHERE id = ${customerId} AND COALESCE(status, 1) <> 3`)[0] : null
  const tables = await sql`
    SELECT t.name FROM restaurant_order_tables_tbl ot JOIN restaurant_tables_tbl t ON t.id = ot.table_id
    WHERE ot.order_id = ${Number(order.id)} AND ot.active ORDER BY ot.is_primary DESC, t.sort_order, t.id
  `
  const tableNames = tables.map((row: any) => row.name).join(" + ")
  const settings = await loadStoredSettings()
  const now = localDateTime()
  const body = {
    pos_client_sale_id: `restaurant-${Number(order.id)}-r${Number(order.revision)}`,
    pos_customer_id: customer ? Number(customer.id) : null,
    pos_mode: "sale",
    cashier_action: "حفظ فاتورة",
    vch_date: now,
    manual_date: now.slice(0, 10),
    due_date: now.slice(0, 10),
    account_id: customer ? Number(customer.id) : null,
    customer_name: customer ? String(customer.name) : "عميل نقدي",
    rate: 1,
    discount_type: "percentage",
    discount_value: discountPercent,
    vat_percent: Math.max(0, Number(settings.tax_rate || 0)),
    vat_classification_id: 1,
    invoice_type: 1,
    vat_included: false,
    is_maqasa: false,
    status: 2,
    note: `${location.name} - ${order.order_type === "takeaway" ? `سفري${order.takeaway_name ? ` ${order.takeaway_name}` : ""}` : `طاولة ${tableNames}`} - طلب ${order.order_no}${requested ? " (دفعة جزئية)" : ""}`,
    insert_user: Number(ctx.userId) || null,
    pos_payments: Array.isArray(ctx.data.pos_payments) ? ctx.data.pos_payments : [],
    cash_change_amount: num(ctx.data.cash_change_amount),
    cash_currency_amounts: Array.isArray(ctx.data.cash_currency_amounts) ? ctx.data.cash_currency_amounts : undefined,
    items: selected.map(({ item, quantity }) => ({
      product_id: Number(item.product_id), item_id: Number(item.product_id), product_code: item.product_code, product_name: item.product_name,
      item_name: item.product_name, unit_id: Number(item.unit_id) || null, unit_name: item.unit_name, unit: item.unit_name,
      quantity, qnty: quantity, unit_price: num(item.price), price: num(item.price), discount_percent: num(item.discount), discount: num(item.discount),
      total_price: lineNet(num(item.price), quantity, num(item.discount)), line_amount: lineNet(num(item.price), quantity, num(item.discount)),
      account_id: accounts.get(Number(item.product_id)) || null,
    })),
  }
  // نفس محرك فاتورة الكاشير (فاتورة + سند قبض + شيكات) بلا عهدة كاشير
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`pos-sale:${body.pos_client_sale_id}`}))`
  const response = await savePosSaleCore(ctx.request, body, { userId: ctx.userId, point, session: null, clientSaleId: body.pos_client_sale_id })
  const saved = await response.json().catch(() => ({}))
  if (!response.ok) throw fail(String(saved?.error || "تعذر حفظ فاتورة الطاولة"), response.status)
  if (saved?.duplicate) throw fail("هذه الدفعة سُجّلت مسبقاً؛ حدّث الشاشة", 409)
  const voucher = (await sql`SELECT id, vch_code, amount FROM voucher_header_tbl WHERE id = ${Number(saved.id)}`)[0]
  await recordRestaurantSaleCash(session, point, body, String(voucher?.vch_code || ""), ctx.userId)
  for (const { item, quantity } of selected) {
    await sql`UPDATE restaurant_order_items_tbl SET paid_quantity = paid_quantity + ${quantity}, updated_at = NOW() WHERE id = ${Number(item.id)}`
  }
  await sql`
    INSERT INTO restaurant_order_payments_tbl (order_id, session_id, voucher_id, vch_code, amount, lines, user_id)
    VALUES (${Number(order.id)}, ${Number(session.id)}, ${Number(voucher?.id) || null}, ${String(voucher?.vch_code || saved.vch_code || "")}, ${num(voucher?.amount)},
            ${JSON.stringify(selected.map(({ item, quantity }) => ({ item_id: Number(item.id), product_id: Number(item.product_id), quantity })))}::jsonb, ${ctx.userId})
  `
  if (customer) await sql`UPDATE restaurant_orders_tbl SET customer_id = ${Number(customer.id)} WHERE id = ${Number(order.id)}`
  const closed = await closeIfSettled(Number(order.id), ctx.userId)
  await logRestaurant(Number(order.id), "pay", { voucher_id: Number(voucher?.id), vch_code: voucher?.vch_code, partial: !closed }, ctx.userId)
  return {
    voucher_id: Number(voucher?.id) || null,
    vch_code: String(voucher?.vch_code || saved.vch_code || ""),
    amount: num(voucher?.amount),
    closed,
    receipt_vch_code: saved.receipt_vch_code || null,
  }
}

const HANDLERS: Record<string, (ctx: Ctx, order: any) => Promise<any>> = {
  update_order: handleUpdateOrder,
  add_items: handleAddItems,
  update_item: handleUpdateItem,
  remove_item: handleRemoveItem,
  transfer: handleTransfer,
  merge: handleMerge,
  unmerge: handleUnmerge,
  split: handleSplit,
  cancel: handleCancel,
  close: handleClose,
  pay: handlePay,
  print: handlePrint,
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureRestaurantTables()
    const data = await request.json()
    const action = String(data?.action || "")
    const required = ACTION_PERMISSIONS[action]
    if (!required) return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })

    let branchId: number
    if (action === "open_takeaway") {
      const location = (await sql`SELECT branch_id FROM restaurant_locations_tbl WHERE id = ${positiveId(data.location_id)} AND status <> 3`)[0]
      if (!location) return NextResponse.json({ error: "الموقع غير موجود" }, { status: 404 })
      branchId = Number(location.branch_id)
    } else if (action === "open") {
      const table = await tableWithState(positiveId(data.table_id))
      if (!table) return NextResponse.json({ error: "الطاولة غير موجودة" }, { status: 404 })
      branchId = Number(table.branch_id)
    } else {
      const row = (await sql`SELECT branch_id FROM restaurant_orders_tbl WHERE id = ${positiveId(data.order_id)}`)[0]
      if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
      branchId = Number(row.branch_id)
    }
    const auth = await authorizeRestaurant(request, required, branchId)
    if (!auth.ok) return auth.response
    const ctx: Ctx = { userId: auth.userId, branchId, permissions: auth.permissions, data, request }

    if (action === "pay") {
      // تهيئة جداول الفاتورة قبل فتح المعاملة (كما في api/pos/sales) حتى لا تحجز أوامر DDL أقفالاً طوال الحفظ
      await ensureSalesTables(); await ensurePosTables(); await ensureVoucherTables(); await ensureStockVoucherTables(); await ensureDiscountCardTables(); await ensureRestaurantCustodyTables()
      await loadStoredSettings()
    }

    const result = await withTenantTransaction(async () => {
      if (action === "open") return handleOpen(ctx)
      if (action === "open_takeaway") return handleOpenTakeaway(ctx)
      const order = await lockOpenOrder(positiveId(data.order_id))
      const extra = await HANDLERS[action](ctx, order)
      if (action !== "print") await touchOrder(Number(order.id))
      return { order_id: Number(order.id), ...(extra || {}) }
    })
    const order = await loadOrder(Number(result.order_id))
    return NextResponse.json({ ...result, order })
  } catch (error) {
    const status = errorStatus(error)
    if (status >= 500) console.error("restaurant order POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status })
  }
}
