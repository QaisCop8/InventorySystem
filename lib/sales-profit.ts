import sql, { getTenantPool } from "@/lib/database"
import { getProductBalances } from "@/lib/item-inventory-reports"
import type { LineCost } from "@/lib/voucher-inventory-valuation"

// تقارير الأرباح — تسعير الإخراجات يتم داخل التقرير نفسه: تُعاد حركة المخزون زمنياً حتى نهاية الفترة
// ويُسجَّل لكل سطر مبيعات/مرتجع كلفة الوحدة لحظة خروجه حسب طريقة التسعير (متوسط/آخر شراء/FIFO).
// لا حاجة لتشغيل آلية "تسعير الإخراجات" مسبقاً كما في الشامل؛ وحفظ الكلفة على السندات اختياري.

export const SALES_INVOICE = 12
export const SALES_DELIVERY = 13
export const SALES_RETURN = 16
export type PricingWay = keyof LineCost
export type ProfitGroupBy = "item" | "line" | "invoice" | "customer" | "salesman" | "group" | "branch" | "warehouse" | "day" | "month"
export const PROFIT_GROUP_BY: ProfitGroupBy[] = ["item", "line", "invoice", "customer", "salesman", "group", "branch", "warehouse", "day", "month"]

export type ProfitFilters = {
  from: string
  to: string
  pricingWay: PricingWay
  types: number[]
  productIds: number[]
  groupIds: number[]
  warehouseIds: number[]
  branchIds: number[]
  customerIds: number[]
  salesmanIds: number[]
  voucherCode: string
}

export type ProfitLine = {
  line_id: number; voucher_id: number; vch_type: number; vch_code: string; vch_date: string
  product_id: number; product_code: string; product_name: string; unit_name: string; group_id: number | null; group_name: string
  customer_id: number | null; customer_name: string; salesman_id: number | null; salesman_name: string
  branch_id: number | null; branch_name: string; warehouse_id: number | null; warehouse_name: string
  quantity: number; bonus: number; unit_factor: number; voucher_rate: number
  sale_total: number; cost_rate: number; cost_total: number; bonus_cost: number; profit: number; priced: boolean
}

const num = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

async function loadSalesLines(filters: ProfitFilters) {
  const values: unknown[] = [filters.from, filters.to, filters.types]
  const where = [
    "vh.vch_type = ANY($3::int[])", "vh.vch_status = 2", "COALESCE(vh.status, 1) <> 3",
    "vh.vch_date >= $1::date", "vh.vch_date < ($2::date + INTERVAL '1 day')", "COALESCE(p.type, 1) = 1",
  ]
  const add = (ids: number[], column: string) => { if (ids.length) { values.push(ids); where.push(`${column} = ANY($${values.length}::int[])`) } }
  add(filters.productIds, "vi.item_id"); add(filters.groupIds, "p.category_id"); add(filters.warehouseIds, "vi.store_id")
  add(filters.branchIds, "vh.branch_id"); add(filters.customerIds, "vh.account_id"); add(filters.salesmanIds, "vh.salesman_id")
  if (filters.voucherCode) { values.push(filters.voucherCode); where.push(`vh.vch_code = $${values.length}`) }
  const pool = await getTenantPool()
  return (await pool.query(`
    SELECT vi.id AS line_id, vh.id AS voucher_id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date,
      vi.item_id AS product_id, p.product_code, COALESCE(p.product_name, vi.item_name) AS product_name,
      u.unit_name, p.category_id AS group_id, g.group_name,
      vh.account_id AS customer_id, acc.name AS customer_name, vh.salesman_id, sm.name AS salesman_name,
      vh.branch_id, b.branch_name, vi.store_id AS warehouse_id, w.warehouse_name,
      COALESCE(vi.qnty, 0) AS qnty, COALESCE(vi.bonus, 0) AS bonus, COALESCE(vi.price, 0) AS price,
      COALESCE((to_jsonb(vi)->>'pos_discount_percent')::numeric, vi.discount, 0) AS discount_percent,
      COALESCE((to_jsonb(vi)->>'campaign_discount')::numeric, 0) AS campaign_discount,
      COALESCE(vi.vat_ratio, 0) AS vat_ratio, COALESCE(vi.delivery_item_id, 0) AS delivery_item_id,
      COALESCE(NULLIF(pu.to_main_qnty, 0), 1) AS unit_factor,
      COALESCE(NULLIF(vh.rate, 0), 1) AS voucher_rate,
      COALESCE((to_jsonb(vh)->>'vat_included')::boolean, false) AS vat_included,
      COALESCE((to_jsonb(vh)->>'vat_percent')::numeric, 0) AS vat_percent,
      COALESCE(vh.discount_type, 'percentage') AS discount_type, COALESCE(vh.discount_value, 0) AS discount_value,
      totals.subtotal, COALESCE(product_rate.exchange_rate, 1) AS product_rate
    FROM voucher_items_tbl vi
    JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
    JOIN products p ON p.id = vi.item_id
    LEFT JOIN units u ON u.id = vi.unit_id
    LEFT JOIN item_groups g ON g.id = p.category_id
    LEFT JOIN account_tbl acc ON acc.id = vh.account_id
    LEFT JOIN salesmen sm ON sm.id = vh.salesman_id
    LEFT JOIN branches b ON b.id = vh.branch_id
    LEFT JOIN warehouses w ON w.id = vi.store_id
    LEFT JOIN LATERAL (SELECT to_main_qnty FROM product_units WHERE product_id = vi.item_id AND unit_id = vi.unit_id ORDER BY id LIMIT 1) pu ON TRUE
    -- خصم السند يوزَّع على الأسطر بنسبة صافي كل سطر من مجموع السند كاملاً (لا الأسطر المفلترة فقط).
    LEFT JOIN LATERAL (
      SELECT SUM(GREATEST(0, COALESCE(line.qnty, 0) * COALESCE(line.price, 0)
        * (1 - COALESCE((to_jsonb(line)->>'pos_discount_percent')::numeric, line.discount, 0) / 100)
        - COALESCE((to_jsonb(line)->>'campaign_discount')::numeric, 0))) AS subtotal
      FROM voucher_items_tbl line WHERE line.voucher_id = vh.id
    ) totals ON TRUE
    LEFT JOIN LATERAL (
      SELECT er.exchange_rate FROM exchange_rates er
      WHERE er.currency_id = p.currency_id AND COALESCE(er.is_active, true) AND er.rate_date::date <= vh.vch_date::date
      ORDER BY er.rate_date DESC, er.id DESC LIMIT 1
    ) product_rate ON TRUE
    WHERE ${where.join(" AND ")}
    ORDER BY vh.vch_date, vh.id, vi.id`, values)).rows
}

/** صافي قيمة السطر بعملة الأساس بعد خصم السطر والحملة وحصته من خصم السند ودون الضريبة. */
function netSaleAmount(line: any) {
  const raw = Math.max(0, num(line.qnty) * num(line.price) * (1 - num(line.discount_percent) / 100) - num(line.campaign_discount))
  const subtotal = num(line.subtotal)
  const headerDiscount = line.discount_type === "amount" ? (subtotal > 0 ? num(line.discount_value) * raw / subtotal : 0) : raw * num(line.discount_value) / 100
  let net = Math.max(0, raw - headerDiscount)
  if (line.vat_included) net /= 1 + (num(line.vat_ratio) || num(line.vat_percent)) / 100
  return net * num(line.voucher_rate)
}

export async function computeSalesProfitLines(filters: ProfitFilters): Promise<ProfitLine[]> {
  const sales = await loadSalesLines(filters)
  if (!sales.length) return []
  // كلفة كل سطر حركة لحظة خروجه — تُحسب على كل المستودعات والفروع (كلفة الصنف على مستوى الشركة).
  const lineCosts = new Map<number, LineCost>()
  const productIds = [...new Set(sales.map((line: any) => Number(line.product_id)))]
  const balances = await getProductBalances(0, filters.to, 0, "", { productIds }, (line, cost) => { lineCosts.set(Number(line.id), cost) })
  const finalCosts = new Map<number, LineCost>(balances.map((row: any) => [Number(row.id), { average: num(row.average_cost), last: num(row.last_incoming_cost), fifo: num(row.fifo_cost) }]))
  return sales.map((line: any) => {
    const type = Number(line.vch_type)
    const sign = type === SALES_RETURN ? -1 : 1
    // سطر فاتورة مرتبط بإرسالية: البضاعة خرجت مع الإرسالية، فكلفته هي كلفة سطر الإرسالية.
    const cost = lineCosts.get(Number(line.delivery_item_id) || Number(line.line_id)) || lineCosts.get(Number(line.line_id)) || finalCosts.get(Number(line.product_id))
    const factor = num(line.unit_factor) || 1
    const mainUnitCost = Math.max(0, num(cost?.[filters.pricingWay])) * num(line.product_rate || 1)
    const quantity = sign * num(line.qnty), bonus = sign * num(line.bonus)
    const costRate = mainUnitCost * factor
    const saleTotal = sign * netSaleAmount(line)
    const costTotal = quantity * costRate, bonusCost = bonus * costRate
    return {
      line_id: Number(line.line_id), voucher_id: Number(line.voucher_id), vch_type: type, vch_code: line.vch_code, vch_date: line.vch_date,
      product_id: Number(line.product_id), product_code: line.product_code || "", product_name: line.product_name || "", unit_name: line.unit_name || "",
      group_id: line.group_id == null ? null : Number(line.group_id), group_name: line.group_name || "بدون مجموعة",
      customer_id: line.customer_id == null ? null : Number(line.customer_id), customer_name: line.customer_name || "بدون عميل",
      salesman_id: line.salesman_id == null ? null : Number(line.salesman_id), salesman_name: line.salesman_name || "بدون مندوب",
      branch_id: line.branch_id == null ? null : Number(line.branch_id), branch_name: line.branch_name || "-",
      warehouse_id: line.warehouse_id == null ? null : Number(line.warehouse_id), warehouse_name: line.warehouse_name || "-",
      quantity, bonus, unit_factor: factor, voucher_rate: num(line.voucher_rate) || 1,
      sale_total: saleTotal, cost_rate: costRate, cost_total: costTotal, bonus_cost: bonusCost,
      profit: saleTotal - costTotal - bonusCost, priced: costRate > 0,
    }
  })
}

const GROUP_KEYS: Record<ProfitGroupBy, (line: ProfitLine) => { key: string; label: string; code?: string; extra?: Record<string, unknown> }> = {
  item: (line) => ({ key: `p${line.product_id}`, label: line.product_name, code: line.product_code, extra: { unit_name: line.unit_name, group_name: line.group_name } }),
  line: (line) => ({ key: `l${line.line_id}`, label: line.product_name, code: line.product_code, extra: { vch_code: line.vch_code, vch_date: line.vch_date, vch_type: line.vch_type, voucher_id: line.voucher_id, customer_name: line.customer_name, warehouse_name: line.warehouse_name, unit_name: line.unit_name } }),
  invoice: (line) => ({ key: `v${line.voucher_id}`, label: line.vch_code, extra: { vch_date: line.vch_date, vch_type: line.vch_type, voucher_id: line.voucher_id, customer_name: line.customer_name, salesman_name: line.salesman_name } }),
  customer: (line) => ({ key: `c${line.customer_id ?? 0}`, label: line.customer_name }),
  salesman: (line) => ({ key: `s${line.salesman_id ?? 0}`, label: line.salesman_name }),
  group: (line) => ({ key: `g${line.group_id ?? 0}`, label: line.group_name }),
  branch: (line) => ({ key: `b${line.branch_id ?? 0}`, label: line.branch_name }),
  warehouse: (line) => ({ key: `w${line.warehouse_id ?? 0}`, label: line.warehouse_name }),
  day: (line) => ({ key: line.vch_date, label: line.vch_date }),
  month: (line) => ({ key: line.vch_date.slice(0, 7), label: line.vch_date.slice(0, 7) }),
}

export function groupSalesProfit(lines: ProfitLine[], groupBy: ProfitGroupBy) {
  const groups = new Map<string, any>()
  const keyOf = GROUP_KEYS[groupBy]
  for (const line of lines) {
    const { key, label, code, extra } = keyOf(line)
    const row = groups.get(key) || { key, label, code: code || "", ...extra, quantity: 0, bonus: 0, sale_total: 0, cost_total: 0, bonus_cost: 0, profit: 0, unpriced_lines: 0, lines: 0 }
    // الكميات تُجمع بالوحدة الرئيسية عند تجميع أكثر من وحدة للصنف نفسه.
    const toMain = groupBy === "line" ? 1 : line.unit_factor
    row.quantity += line.quantity * toMain; row.bonus += line.bonus * toMain
    row.sale_total += line.sale_total; row.cost_total += line.cost_total; row.bonus_cost += line.bonus_cost; row.profit += line.profit
    row.lines += 1; if (!line.priced) row.unpriced_lines += 1
    groups.set(key, row)
  }
  const totals = lines.reduce((sum, line) => ({ sale_total: sum.sale_total + line.sale_total, cost_total: sum.cost_total + line.cost_total, bonus_cost: sum.bonus_cost + line.bonus_cost, profit: sum.profit + line.profit }), { sale_total: 0, cost_total: 0, bonus_cost: 0, profit: 0 })
  const rows = [...groups.values()].map((row) => {
    const cost = row.cost_total + row.bonus_cost
    return {
      ...row,
      sale_rate: row.quantity ? row.sale_total / row.quantity : 0,
      cost_rate: row.quantity + row.bonus ? cost / (row.quantity + row.bonus) : 0,
      profit_margin: row.sale_total ? (row.profit / row.sale_total) * 100 : 0,
      markup: cost ? (row.profit / cost) * 100 : 0,
      sale_share: totals.sale_total ? (row.sale_total / totals.sale_total) * 100 : 0,
      profit_share: totals.profit ? (row.profit / totals.profit) * 100 : 0,
    }
  })
  if (groupBy === "day" || groupBy === "month" || groupBy === "line") rows.sort((left, right) => String(left.key).localeCompare(String(right.key)) || 0)
  else rows.sort((left, right) => right.profit - left.profit)
  return { rows, totals: { ...totals, lines: lines.length, unpriced_lines: lines.filter((line) => !line.priced).length, profit_margin: totals.sale_total ? (totals.profit / totals.sale_total) * 100 : 0 } }
}

/** حفظ الكلفة المحسوبة على أسطر السندات (cost_price بعملة السند ولوحدة السطر) — تستخدمها عمولات المندوبين. */
export async function saveSalesCostPrices(lines: ProfitLine[]) {
  const priced = lines.filter((line) => line.priced)
  if (!priced.length) return 0
  const pool = await getTenantPool()
  const result = await pool.query(
    `UPDATE voucher_items_tbl vi SET cost_price = u.cost FROM unnest($1::int[], $2::float8[]) AS u(id, cost) WHERE vi.id = u.id`,
    [priced.map((line) => line.line_id), priced.map((line) => line.cost_rate / (line.voucher_rate || 1))],
  )
  return result.rowCount || 0
}

/** الأصناف التي لها مبيعات أو مرتجعات مرحَّلة خلال الفترة — لتقرير تكلفة مبيعات صنف. */
export async function soldItemsInPeriod(from: string, to: string) {
  return sql`
    SELECT p.id, p.product_code AS code, p.product_name AS name
    FROM products p
    WHERE COALESCE(p.type, 1) = 1 AND EXISTS (
      SELECT 1 FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      WHERE vi.item_id = p.id AND vh.vch_type IN (12, 16) AND vh.vch_status = 2 AND COALESCE(vh.status, 1) <> 3
        AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + INTERVAL '1 day'))
    ORDER BY p.product_code, p.product_name`
}

export async function salesProfitMeta() {
  const [products, groups, warehouses, branches, customers, salesmen] = await Promise.all([
    sql`SELECT id, product_code AS code, product_name AS name FROM products WHERE COALESCE(deleted,false)=false AND COALESCE(status,1)<>3 AND COALESCE(type,1)=1 ORDER BY product_code, product_name`,
    sql`SELECT id, group_code AS code, group_name AS name FROM item_groups WHERE COALESCE(status,1)<>3 ORDER BY group_code, group_name`,
    sql`SELECT id, warehouse_code AS code, warehouse_name AS name FROM warehouses WHERE COALESCE(status,1)<>3 ORDER BY warehouse_code`,
    sql`SELECT id, branch_code AS code, branch_name AS name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_code`,
    sql`SELECT a.id, a.code, a.name FROM account_tbl a WHERE a.id IN (SELECT DISTINCT account_id FROM voucher_header_tbl WHERE vch_type IN (12,16) AND account_id IS NOT NULL) ORDER BY a.code`,
    sql`SELECT id, code, name FROM salesmen ORDER BY code, name`,
  ])
  return { products, groups, warehouses, branches, customers, salesmen }
}
