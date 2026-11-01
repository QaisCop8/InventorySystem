import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureRestaurantTables } from "@/lib/restaurant"
import { ensureRestaurantCustodyTables } from "@/lib/restaurant-custody"
import { RESTAURANT_MONITOR_LABEL } from "@/lib/restaurant-monitor"

// مراقبة المطعم: كل ما يفعله المستخدم في شاشة المطعم — حركات الطلبات (restaurant_order_log_tbl) وحركات العهدة
// (restaurant_cash_movements_tbl، عدا 'sale' لأن الدفع ظاهر من سجل الطلب). نوع الحركة يُشتق في JS من action + details
// (تخفيض الكمية/خصم الصنف/خصم الطلب/دفعة جزئية) ثم يُفلتر عليه.
const SECTION = "restaurant-monitor-report"
const MAX_ROWS = 20000
const CUSTODY_KEYS: Record<string, string> = {
  opening: "custody_open", receive: "custody_receive", handover: "custody_handover", cash_in: "cash_in", cash_out: "cash_out", close: "custody_close",
}

const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const num = (value: unknown) => Number(value) || 0
const qtyText = (value: unknown) => String(Math.round(num(value) * 1000) / 1000)

const userNameSql = (column: string) => `COALESCE((SELECT COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), ${column}) FROM user_settings us WHERE us.user_id::text = ${column} LIMIT 1), ${column})`

function orderActionKey(action: string, details: any) {
  if (action === "update_item") {
    const from = details?.from === undefined ? null : num(details.from)
    if (from !== null && num(details.quantity) < from) return "reduce_item"
    if (details?.discount_from !== undefined && num(details.discount_from) !== num(details.discount)) return "item_discount"
    return "update_item"
  }
  if (action === "update_order" && details?.discount_from !== undefined && num(details.discount_from) !== num(details.discount_percent)) return "order_discount"
  if (action === "pay") return details?.partial ? "pay_partial" : "pay"
  return action
}

export async function GET(request: NextRequest) {
  try {
    const denied = await reportAccessDenied(request, [SECTION])
    if (denied) return denied
    await ensureRestaurantTables(); await ensureRestaurantCustodyTables()
    const params = request.nextUrl.searchParams

    if (params.get("meta") === "1") {
      const [locations, branches, users] = await Promise.all([
        sql`SELECT id, name, code FROM restaurant_locations_tbl WHERE status <> 3 ORDER BY sort_order, id`,
        sql`SELECT DISTINCT b.id, b.branch_name AS name FROM restaurant_locations_tbl l JOIN branches b ON b.id = l.branch_id WHERE l.status <> 3 ORDER BY 2`,
        sql.unsafe(`
          SELECT u.user_id AS id, ${userNameSql("u.user_id")} AS name
          FROM (SELECT user_id FROM restaurant_order_log_tbl WHERE user_id IS NOT NULL UNION SELECT user_id FROM restaurant_cash_movements_tbl) u
          ORDER BY 2`),
      ])
      return NextResponse.json({ locations, branches, users })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), today)
    const to = isoDate(params.get("to_date"), today)
    const locationIds = ids(params.get("location_ids"))
    const branchIds = ids(params.get("branch_ids"))
    const userIds = String(params.get("user_ids") || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 200)
    const actions = new Set(String(params.get("actions") || "").split(",").filter((key) => key in RESTAURANT_MONITOR_LABEL))
    const orderNo = String(params.get("order_no") || "").trim().slice(0, 30)

    // نص واحد بمعاملات مرقّمة لكل استعلام (لا تداخل أجزاء sql`` — انظر ملاحظة إعادة الترقيم في lib/database.ts)
    const filters = (date: string, location: string, branch: string, user: string) => {
      const values: unknown[] = []
      const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
      const where = [
        `${date} >= ${bind(from)}::date AND ${date} < ${bind(to)}::date + INTERVAL '1 day'`,
        locationIds.length ? `${location} = ANY(${bind(locationIds)}::int[])` : "",
        branchIds.length ? `${branch} = ANY(${bind(branchIds)}::int[])` : "",
        userIds.length ? `${user} = ANY(${bind(userIds)}::text[])` : "",
        orderNo && date.startsWith("lg.") ? `o.order_no ILIKE ${bind(`%${orderNo}%`)}` : "",
      ].filter(Boolean).join(" AND ")
      return { where, values }
    }
    const orderFilter = filters("lg.created_at", "o.location_id", "o.branch_id", "lg.user_id")
    const custodyFilter = filters("m.created_at", "s.location_id", "l.branch_id", "m.user_id")
    const wantOrders = !actions.size || [...actions].some((key) => !Object.values(CUSTODY_KEYS).includes(key))
    const wantCustody = !orderNo && (!actions.size || [...actions].some((key) => Object.values(CUSTODY_KEYS).includes(key)))

    const sessionName = (alias: string) => `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE CONCAT('#', ${alias}.id, ' · ', ${userNameSql(`${alias}.user_id`)}, ' · ', TO_CHAR(${alias}.opened_at, 'YYYY-MM-DD')) END`
    const [orderRows, custodyRows] = await Promise.all([
      wantOrders ? sql.unsafe(`
        SELECT lg.id, lg.created_at AS occurred_at, lg.user_id, ${userNameSql("lg.user_id")} AS user_name, lg.action, lg.details,
          o.id AS order_id, o.order_no, o.order_type, o.takeaway_name, o.cancel_reason, l.name AS location_name, b.branch_name,
          (SELECT string_agg(DISTINCT t.name, ' + ') FROM restaurant_order_tables_tbl ot JOIN restaurant_tables_tbl t ON t.id = ot.table_id WHERE ot.order_id = o.id) AS tables,
          ${sessionName("ss")} AS shift_name,
          COALESCE(lg.details->>'product_name', ri.product_name, p.product_name) AS item_name,
          COALESCE(NULLIF(lg.details->>'price', '')::numeric, ri.price) AS item_price,
          COALESCE(NULLIF(lg.details->>'amount', '')::numeric, pay.amount) AS pay_amount
        FROM restaurant_order_log_tbl lg
        JOIN restaurant_orders_tbl o ON o.id = lg.order_id
        LEFT JOIN restaurant_locations_tbl l ON l.id = o.location_id
        LEFT JOIN branches b ON b.id = o.branch_id
        LEFT JOIN restaurant_order_items_tbl ri ON ri.id = NULLIF(lg.details->>'item_id', '')::int
        LEFT JOIN products p ON p.id = NULLIF(lg.details->>'product_id', '')::int
        LEFT JOIN LATERAL (
          SELECT amount FROM restaurant_order_payments_tbl WHERE lg.action = 'pay' AND voucher_id = NULLIF(lg.details->>'voucher_id', '')::int LIMIT 1
        ) pay ON TRUE
        LEFT JOIN LATERAL (
          SELECT * FROM restaurant_sessions_tbl s
          WHERE s.location_id = o.location_id AND s.user_id = lg.user_id AND s.opened_at <= lg.created_at AND (s.closed_at IS NULL OR s.closed_at >= lg.created_at)
          ORDER BY s.id DESC LIMIT 1
        ) ss ON TRUE
        WHERE ${orderFilter.where}
        ORDER BY lg.created_at DESC, lg.id DESC
        LIMIT ${MAX_ROWS}`, orderFilter.values) : Promise.resolve([]),
      wantCustody ? sql.unsafe(`
        SELECT m.id, m.created_at AS occurred_at, m.user_id, ${userNameSql("m.user_id")} AS user_name, m.movement_type, m.amount, m.currency_amount,
          c.currency_code, m.reference, m.note, l.name AS location_name, b.branch_name, ${sessionName("s")} AS shift_name,
          CASE WHEN m.movement_type = 'handover' THEN (SELECT ${userNameSql("s.handover_to_user_id")}) END AS handover_to_name,
          CASE WHEN m.movement_type = 'receive' THEN (SELECT ${userNameSql("src.user_id")} FROM restaurant_sessions_tbl src WHERE src.id = s.received_from_session_id) END AS received_from_name
        FROM restaurant_cash_movements_tbl m
        JOIN restaurant_sessions_tbl s ON s.id = m.session_id
        LEFT JOIN restaurant_locations_tbl l ON l.id = s.location_id
        LEFT JOIN branches b ON b.id = l.branch_id
        LEFT JOIN currency c ON c.id = m.currency_id
        WHERE m.movement_type <> 'sale' AND ${custodyFilter.where}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ${MAX_ROWS}`, custodyFilter.values) : Promise.resolve([]),
    ])

    const tableIds = new Set<number>()
    for (const row of orderRows as any[]) {
      const details = row.details || {}
      for (const key of ["table_id", "to_table_id", "from_table_id"]) if (num(details[key])) tableIds.add(num(details[key]))
      for (const id of Array.isArray(details.table_ids) ? details.table_ids : []) if (num(id)) tableIds.add(num(id))
    }
    const tableNames = new Map<number, string>(tableIds.size
      ? (await sql`SELECT id, name FROM restaurant_tables_tbl WHERE id = ANY(${[...tableIds]}::int[])`).map((row: any) => [Number(row.id), String(row.name)])
      : [])
    const table = (id: unknown) => tableNames.get(num(id)) || (num(id) ? `#${num(id)}` : "")

    const rows: Record<string, unknown>[] = []
    for (const row of orderRows as any[]) {
      const details = row.details || {}
      const key = orderActionKey(String(row.action), details)
      if (actions.size && !actions.has(key)) continue
      let quantity: number | null = null
      let amount: number | null = null
      let description = ""
      switch (key) {
        case "open": description = `عدد الأشخاص ${num(details.guests) || 1}`; break
        case "open_takeaway": description = details.name ? `الزبون: ${details.name}` : ""; break
        case "add_items": {
          const items = Array.isArray(details.items) ? details.items : []
          quantity = items.length ? items.reduce((sum: number, item: any) => sum + num(item.quantity), 0) : null
          description = items.length ? items.map((item: any) => `${item.name} × ${qtyText(item.quantity)}`).join("، ") : `عدد الأصناف ${num(details.count)}`
          break
        }
        case "remove_item":
          quantity = num(details.quantity)
          amount = row.item_price === null ? null : num(row.item_price) * quantity
          break
        case "reduce_item":
          quantity = num(details.from) - num(details.quantity)
          amount = row.item_price === null ? null : num(row.item_price) * quantity
          description = `من ${qtyText(details.from)} إلى ${qtyText(details.quantity)}`
          break
        case "item_discount": description = `الخصم من ${num(details.discount_from)}% إلى ${num(details.discount)}%`; break
        case "update_item": description = `الكمية ${qtyText(details.quantity)}${num(details.discount) ? ` · خصم ${num(details.discount)}%` : ""}`; break
        case "order_discount": description = `الخصم من ${num(details.discount_from)}% إلى ${num(details.discount_percent)}%`; break
        case "update_order": description = `الأشخاص ${num(details.guests)}${num(details.discount_percent) ? ` · خصم ${num(details.discount_percent)}%` : ""}`; break
        case "transfer": description = details.from === "takeaway" ? `من سفري إلى ${table(details.to_table_id)}` : `من ${table(details.from_table_id)} إلى ${table(details.to_table_id)}`; break
        case "merge": description = `الطاولات: ${(Array.isArray(details.table_ids) ? details.table_ids : []).map(table).join(" + ")}`; break
        case "merged_into": description = `إلى الطلب #${num(details.order_id)}`; break
        case "unmerge": description = `فك ${table(details.table_id)}`; break
        case "split": {
          const lines = Array.isArray(details.lines) ? details.lines : []
          quantity = lines.reduce((sum: number, line: any) => sum + num(line.quantity), 0)
          description = `إلى ${table(details.to_table_id)} (طلب #${num(details.to_order_id)})`
          break
        }
        case "cancel": description = `السبب: ${details.reason || row.cancel_reason || "—"}`; break
        case "pay": case "pay_partial":
          amount = row.pay_amount === null ? null : num(row.pay_amount)
          description = details.vch_code ? `فاتورة ${details.vch_code}` : ""
          break
      }
      rows.push({
        row_id: `o${row.id}`, occurred_at: row.occurred_at, user_id: row.user_id, user_name: row.user_name, action: key,
        location_name: row.location_name, branch_name: row.branch_name, order_id: row.order_id, order_no: row.order_no,
        place: row.order_type === "takeaway" ? `سفري${row.takeaway_name ? ` · ${row.takeaway_name}` : ""}` : row.tables || "",
        item_name: ["remove_item", "reduce_item", "item_discount", "update_item"].includes(key) ? row.item_name : null,
        quantity, amount, shift_name: row.shift_name, description,
      })
    }
    for (const row of custodyRows as any[]) {
      const key = CUSTODY_KEYS[String(row.movement_type)] || String(row.movement_type)
      if (actions.size && !actions.has(key)) continue
      const parts = [
        row.currency_code && row.currency_amount !== null ? `${num(row.currency_amount)} ${row.currency_code}` : "",
        key === "custody_handover" ? (row.handover_to_name ? `إلى ${row.handover_to_name}` : "لأي مستخدم") : "",
        key === "custody_receive" && row.received_from_name ? `من ${row.received_from_name}` : "",
        row.reference && key !== "custody_receive" ? `مرجع ${row.reference}` : "",
        row.note || "",
      ].filter(Boolean)
      rows.push({
        row_id: `c${row.id}`, occurred_at: row.occurred_at, user_id: row.user_id, user_name: row.user_name, action: key,
        location_name: row.location_name, branch_name: row.branch_name, order_id: null, order_no: null, place: "",
        item_name: null, quantity: null, amount: num(row.amount), shift_name: row.shift_name, description: parts.join(" · "),
      })
    }
    rows.sort((a, b) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime())
    return NextResponse.json({ rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS || (orderRows as any[]).length >= MAX_ROWS || (custodyRows as any[]).length >= MAX_ROWS })
  } catch (error) {
    console.error("restaurant monitor report", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل التقرير" }, { status: 500 })
  }
}
