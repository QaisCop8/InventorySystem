import sql, { withTenantTransaction } from "@/lib/database"
import { MigrationRun, StepContext, date, forgetTableColumns, insertRow, mapGet, mapSet, num, text, toCode10 } from "@/lib/shamel-migration/core"
import { stageRows } from "@/lib/shamel-migration/balances"
import { ensureOrderReadColumns } from "@/lib/order-schema"

// الطلبيات (orders + ordtran بالشامل) — نفس MigrateOrdersF بالشامل API: رقم يبدأ بـ O ⇐ طلبية مبيعات، وغير ذلك (T…)
// طلبية مشتريات. أسطر الطلبية تُحفظ بخريطة order_item (رقم الطلبية|موقع السطر) لتُربط بها أسطر الفواتير/الإرساليات
// (resolveMigratedLinks). الطلبية لا تحرك المخزون.

type Row = Record<string, unknown>

/** بادئات الطلبيات المختارة (O مبيعات، T مشتريات) من أنواع التشغيل */
export const SHAMEL_ORDER_TYPES = [
  { prefix: "O", title: "طلبيات المبيعات", kind: "orders" as const },
  { prefix: "T", title: "طلبيات المشتريات", kind: "orders" as const },
]
const ORDER_PREFIXES = new Set(SHAMEL_ORDER_TYPES.map((type) => type.prefix))
export const runOrderPrefixes = (run: MigrationRun) => run.voucher_types.filter((prefix) => ORDER_PREFIXES.has(prefix))

export const ordersSql = (run: MigrationRun) => {
  const prefixes = runOrderPrefixes(run)
  const filter = prefixes.length ? `left(o."Order ID",1) in (${prefixes.map((prefix) => `'${prefix}'`).join(",")})` : "1=0"
  return `select o."Order ID" as order_code, o."Date" as order_date, o."Cust. Code" as customer_code, o."From Code" as salesman_code,
  o."Curr" as currency_code, o."Order status" as order_status, o."Value" as total, o."Stores" as store_pos,
  case when o."Req. date">'1990-01-01' then o."Req. date" else o."Date" end as req_date,
  o."Remark 1" as note1, o."Remark 2" as note2, o."Remark 3" as note3, o."Remark 4" as note4, o."Manual_vch" as manual_vch, o."Printed" as printed,
  t."Pos" as pos, t."S_code" as item_code, t."Unitnum" as unit_pos, t."Stat" as line_status, t."Store" as store, t."Qnty" as qnty,
  t."Price" as price, t."Sold_qnty" as sold_qnty, t."Bonus" as bonus, t."Discount" as discount, t."Note" as note,
  case when t."Expiry_date">'1990-01-01' then t."Expiry_date" else '1990-01-01' end as expiry_date
  from "orders" o left join "ordtran" t on t."Voucher"=o."Order ID" and t."Pos">=0
  where ${filter}
  order by o."Order ID", t."Pos"`
}

/**
 * رقم الطلبية 10 خانات (toCode10: T0000012 ⇐ T000000012). قواعد قديمة فيها orders.order_number أقصر (8) فكان
 * insertRow يقصّ الرقم على طول العمود فيبقى برقم الشامل الأصلي (T0000000) — يُوسَّع العمود أولاً.
 */
async function ensureOrderNumberWidth() {
  await sql.unsafe(`DO $$ BEGIN
    IF (SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'order_number') < 30 THEN
      ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(30);
    END IF;
  END $$`, [])
  await forgetTableColumns("orders")
}

/** يصحّح أرقام الطلبيات المرحّلة سابقاً إلى 10 خانات (إن لم يكن الرقم الجديد مستخدماً لطلبية أخرى) */
export async function repairMigratedOrderNumbers() {
  await ensureOrderNumberWidth()
  const rows = (await sql`
    SELECT m.shamel_key, o.id, o.order_number FROM shamel_migration_map m JOIN orders o ON o.id = m.web_id
    WHERE m.kind = 'order'`.catch(() => [])) as any[]
  let fixed = 0
  for (const row of rows) {
    const target = toCode10(row.shamel_key)
    if (!target || target === String(row.order_number || "")) continue
    const taken = (await sql`SELECT 1 FROM orders WHERE order_number = ${target} AND id <> ${Number(row.id)} LIMIT 1`)[0]
    if (taken) continue
    await sql`UPDATE orders SET order_number = ${target} WHERE id = ${Number(row.id)}`
    fixed++
  }
  return fixed
}

export async function processOrders(rows: Row[], ctx: StepContext, last: boolean) {
  await ensureOrderReadColumns().catch(() => undefined)
  await ensureOrderNumberWidth()
  await stageRows(ctx.run.id, "orders_carry", []) // ينشئ جدول التخزين المؤقت إن لم يوجد
  // الطلبية الأخيرة بالدفعة قد تكمل بالدفعة التالية ⇐ تؤجَّل لها (نفس السندات)
  const carried = (await sql`SELECT payload FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step = 'orders_carry' ORDER BY id`) as any[]
  await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step = 'orders_carry'`
  const groups = new Map<string, Row[]>()
  for (const row of [...carried.map((entry) => entry.payload as Row), ...rows]) {
    const code = text(row.order_code)
    if (code) groups.set(code, [...(groups.get(code) || []), row])
  }
  const codes = [...groups.keys()]
  if (!last && codes.length) {
    const tail = codes.pop()!
    await stageRows(ctx.run.id, "orders_carry", groups.get(tail)!)
    groups.delete(tail)
  }
  const existing = await mapGet("order", codes)
  const all = [...groups.values()].flat()
  const headers = [...groups.values()].map((lines) => lines[0])
  const accounts = await mapGet("account", headers.map((row) => text(row.customer_code)))
  const salesmen = await mapGet("salesman", headers.map((row) => text(row.salesman_code)))
  const currencies = await mapGet("currency", headers.map((row) => text(row.currency_code).toUpperCase()))
  const items = await mapGet("item", all.map((row) => text(row.item_code)))
  const units = await mapGet("item_unit", all.map((row) => `${text(row.item_code)}|${num(row.unit_pos)}`))
  const stores = await mapGet("store", all.map((row) => String(num(row.store))))
  const accountNames = new Map<number, string>(
    accounts.size ? ((await sql`SELECT id, name FROM account_tbl WHERE id = ANY(${[...accounts.values()]}::int[])`) as any[]).map((row) => [Number(row.id), String(row.name || "")]) : [],
  )
  const productNames = new Map<number, string>(
    items.size ? ((await sql`SELECT id, product_name FROM products WHERE id = ANY(${[...items.values()]}::int[])`) as any[]).map((row) => [Number(row.id), String(row.product_name || "")]) : [],
  )

  for (const [code, lines] of groups) {
    ctx.stats.received++
    if (existing.has(code)) { ctx.stats.skipped++; continue }
    const header = lines[0]
    // طلبية بنفس الرقم موجودة لكن غير مربوطة بالخريطة (ترحيل سابق انقطع/خريطة مفقودة): رقم الشامل بعد toCode10
    // فريد، فهي نفس الطلبية ⇐ تُتبنّى وتُربط أسطرها بالترتيب بدل الإدراج (كان: duplicate key sales_orders_order_number_key)
    const adopted = (await sql`SELECT o.id FROM orders o WHERE o.order_number = ${toCode10(code)}
      AND NOT EXISTS (SELECT 1 FROM shamel_migration_map m WHERE m.kind = 'order' AND m.web_id = o.id) LIMIT 1`)[0] as any
    if (adopted) {
      const orderId = Number(adopted.id)
      const itemIds = ((await sql`SELECT id FROM order_items WHERE order_id = ${orderId} ORDER BY id`) as any[]).map((row) => Number(row.id))
      const linePositions = lines.filter((line) => line.pos != null && items.get(text(line.item_code))).map((line) => `${code}|${num(line.pos)}`)
      if (itemIds.length === linePositions.length && itemIds.length) {
        await sql`
          INSERT INTO shamel_migration_map (kind, shamel_key, web_id)
          SELECT 'order_item', k, id FROM unnest(${linePositions}::text[], ${itemIds}::int[]) AS s(k, id)
          ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id`
      } else if (linePositions.length) ctx.warn(code, "الطلبية موجودة مسبقاً بعدد أسطر مختلف — رُبطت دون أسطرها")
      await mapSet("order", code, orderId)
      ctx.stats.updated++
      continue
    }
    try {
      await withTenantTransaction(async () => {
      const customerId = accounts.get(text(header.customer_code)) ?? null
      const orderId = await insertRow("orders", {
        order_number: toCode10(code), order_date: date(header.order_date), customer_id: customerId,
        customer_name: (customerId ? accountNames.get(customerId) : "") || text(header.customer_code),
        salesman_id: salesmen.get(text(header.salesman_code)) ?? null, currency_id: currencies.get(text(header.currency_code).toUpperCase()) ?? null,
        exchange_rate: 1, total_amount: num(header.total), order_type: code.charAt(0).toUpperCase() === "O" ? 1 : 2,
        // حالة الطلبية بالشامل 0.. ⇐ 1 غير جاهزة، 2 جاهزة، 3 مرسلة جزئياً، 4 مرسلة كلياً (نفس +1 بالشامل API)
        order_status: num(header.order_status) + 1, order_decision: 0, reference_number: text(header.manual_vch).slice(0, 50),
        delivery_date: date(header.req_date) || date(header.order_date),
        general_notes: [header.note1, header.note2, header.note3, header.note4].map(text).filter(Boolean).join(" - ").slice(0, 1000),
        user_id: Number(ctx.run.created_by) || null, branch_id: ctx.run.branch_id, deleted: false, printed: "0", printed_count: "0",
        // نفس القيم الافتراضية لـ createOrder (أعمدة NOT NULL في الجدول)
        customer_phone: null, discount_amount: 0, discount_type: null, vat_amount: 0, vat_percent: 0, delivery_address: "", shipping_cost: 0, other_charges: 0,
        internal_notes: "", delivery_notes: "", received_by: "", customer_order_no: "", order_status2: 0, created_at: new Date(), updated_at: new Date(),
      })
      const itemKeys: string[] = [], itemIds: number[] = []
      for (const line of lines) {
        if (line.pos == null) continue
        const productId = items.get(text(line.item_code))
        if (!productId) { ctx.warn(code, `الصنف ${text(line.item_code)} غير موجود — سطر الطلبية لم يُرحَّل`); continue }
        const itemId = await insertRow("order_items", {
          order_id: orderId, product_id: productId, product_name: productNames.get(productId) || text(line.note).slice(0, 200),
          quantity: num(line.qnty), bonus: num(line.bonus), price: num(line.price), discount: num(line.discount),
          unit_id: units.get(`${text(line.item_code)}|${num(line.unit_pos)}`) ?? null, store_id: stores.get(String(num(line.store))) ?? null,
          delivered_quantity: num(line.sold_qnty), item_status: num(line.line_status) + 1,
          expiry_date: date(line.expiry_date) && date(line.expiry_date)! > "1990-01-01" ? date(line.expiry_date) : null,
        })
        itemKeys.push(`${code}|${num(line.pos)}`); itemIds.push(itemId)
      }
      if (itemKeys.length) {
        await sql`
          INSERT INTO shamel_migration_map (kind, shamel_key, web_id)
          SELECT 'order_item', k, id FROM unnest(${itemKeys}::text[], ${itemIds}::int[]) AS s(k, id)
          ON CONFLICT (kind, shamel_key) DO UPDATE SET web_id = EXCLUDED.web_id`
      }
      await mapSet("order", code, orderId)
      })
      ctx.stats.created++
    } catch (error) {
      ctx.error(code, error instanceof Error ? error.message : String(error))
    }
  }
  if (last) await sql`DELETE FROM shamel_migration_stage WHERE run_id = ${ctx.run.id} AND step = 'orders_carry'`.catch(() => undefined)
}
