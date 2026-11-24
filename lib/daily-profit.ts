import sql from "@/lib/database"
import { INTERNAL_VOUCHER } from "@/lib/auto-journals"
import { SALES_INVOICE, SALES_RETURN, computeSalesProfitLines, soldItemsInPeriod } from "@/lib/sales-profit"

/**
 * «ربحك اليومي بضغطة» (2026-11-24) — زر في رأس الصفحة يعرض ربح يوم واحد:
 * - مجمل الربح من محرك تقرير الأرباح (lib/sales-profit.ts: فواتير المبيعات − المردودات، الكلفة بالمتوسط المرجح) بعملة الأساس.
 * - المصاريف/الإيرادات الأخرى من القيود اليدوية وسندات الصرف (أنواع 3/5/21) على حسابات «قائمة الدخل» (finanical_list_id = 2
 *   على الحساب أو أحد آبائه). سندات البضاعة مستثناة لأن مبيعاتها وكلفتها محسوبة في مجمل الربح؛ قيود الإقفال/الافتتاح/تكاليف
 *   الشحن مستثناة لأنها ليست مصروف اليوم.
 */
export type DailyProfit = {
  date: string
  currency: string
  sales: number
  returns: number
  net_sales: number
  cost: number
  gross_profit: number
  margin: number
  invoices: number
  unpriced_lines: number
  expenses: number
  other_income: number
  net_profit: number
  expense_accounts: { name: string; amount: number }[]
  top_items: { name: string; profit: number; sales: number }[]
}

const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100
const num = (value: unknown) => Number(value) || 0

const EXPENSE_VCH_TYPES = [3, 5, 21]
const EXCLUDED_INTERNAL = [INTERNAL_VOUCHER.YEAR_CLOSING, INTERNAL_VOUCHER.OPENING_BALANCE, INTERNAL_VOUCHER.LANDED_COST]

async function journalProfitItems(day: string, branchIds: number[]) {
  const all = branchIds.length === 0
  const rows = await sql`
    WITH RECURSIVE income_accounts AS (
      SELECT a.id FROM account_tbl a WHERE a.finanical_list_id = 2
      UNION
      SELECT c.id FROM account_tbl c JOIN income_accounts p ON c.father_id = p.id
    )
    SELECT a.id, a.name,
           SUM(CASE WHEN vjd.credit_debit = 1 THEN 1 ELSE -1 END * ABS(vjd.amount * COALESCE(NULLIF(vjd.rate, 0), 1))) AS balance
    FROM voucher_journal_detail_tbl vjd
    JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
    JOIN account_tbl a ON a.id = vjd.account_id
    WHERE vjd.account_id IN (SELECT id FROM income_accounts)
      AND vh.vch_type = ANY(${EXPENSE_VCH_TYPES}::int[]) AND vh.status IS DISTINCT FROM 3
      AND COALESCE(vh.internal_voucher_id, 0) <> ALL(${EXCLUDED_INTERNAL}::int[])
      AND vh.vch_date >= ${day}::date AND vh.vch_date < (${day}::date + INTERVAL '1 day')
      AND (${all} OR vh.branch_id = ANY(${branchIds}::int[]))
    GROUP BY a.id, a.name
  `.catch((error: unknown) => { console.error("daily profit journals", error); return [] as any[] })
  const expenses = rows.filter((row: any) => num(row.balance) > 0)
  const income = rows.filter((row: any) => num(row.balance) < 0)
  return {
    expenses: round(expenses.reduce((sum: number, row: any) => sum + num(row.balance), 0)),
    otherIncome: round(-income.reduce((sum: number, row: any) => sum + num(row.balance), 0)),
    accounts: expenses
      .map((row: any) => ({ name: String(row.name || ""), amount: round(num(row.balance)) }))
      .sort((a: any, b: any) => b.amount - a.amount)
      .slice(0, 6),
  }
}

export async function buildDailyProfit(day: string, branchIds: number[]): Promise<DailyProfit> {
  // الأصناف المباعة في اليوم فقط ⇐ إعادة حركة مخزونها وحدها (لا كل الأصناف) لحساب الكلفة
  const sold = (await soldItemsInPeriod(day, day)) as any[]
  const productIds = sold.map((row) => Number(row.id)).filter(Boolean)
  const [lines, journals, currencyRows, invoiceRows] = await Promise.all([
    productIds.length
      ? computeSalesProfitLines({
          from: day, to: day, pricingWay: "average", types: [SALES_INVOICE, SALES_RETURN],
          productIds, groupIds: [], warehouseIds: [], branchIds, customerIds: [], salesmanIds: [], voucherCode: "",
        })
      : Promise.resolve([]),
    journalProfitItems(day, branchIds),
    sql`SELECT currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id LIMIT 1`,
    sql`SELECT COUNT(*) AS count FROM voucher_header_tbl vh
        WHERE vh.vch_type = ${SALES_INVOICE} AND vh.status IS DISTINCT FROM 3
          AND vh.vch_date >= ${day}::date AND vh.vch_date < (${day}::date + INTERVAL '1 day')
          AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))`,
  ])
  let sales = 0, returns = 0, cost = 0, unpriced = 0
  const byItem = new Map<number, { name: string; profit: number; sales: number }>()
  for (const line of lines) {
    if (line.vch_type === SALES_RETURN) returns -= line.sale_total
    else sales += line.sale_total
    cost += line.cost_total + line.bonus_cost
    if (!line.priced) unpriced++
    const item = byItem.get(line.product_id) || { name: line.product_name, profit: 0, sales: 0 }
    item.profit += line.profit
    item.sales += line.sale_total
    byItem.set(line.product_id, item)
  }
  const netSales = sales - returns
  const gross = netSales - cost
  const currency = currencyRows[0] ? String(currencyRows[0].currency_code || currencyRows[0].currency_name || "") : ""
  return {
    date: day,
    currency,
    sales: round(sales),
    returns: round(returns),
    net_sales: round(netSales),
    cost: round(cost),
    gross_profit: round(gross),
    margin: netSales ? round((gross / netSales) * 100) : 0,
    invoices: num(invoiceRows[0]?.count),
    unpriced_lines: unpriced,
    expenses: journals.expenses,
    other_income: journals.otherIncome,
    net_profit: round(gross + journals.otherIncome - journals.expenses),
    expense_accounts: journals.accounts,
    top_items: [...byItem.values()]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
      .map((item) => ({ name: item.name, profit: round(item.profit), sales: round(item.sales) })),
  }
}
