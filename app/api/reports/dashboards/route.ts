import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { deniedAccountIds } from "@/lib/account-access"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"
import { computeSalesProfitLines } from "@/lib/sales-profit"
import { runSchemaOnce } from "@/lib/schema-once"

// أعمدة ربط فاتورة نقطة البيع بسند القبض/الصرف (قواعد قديمة قد لا تحويها) — نفس كشف المقبوضات
const ensurePosLinkColumns = () => runSchemaOnce("app/api/reports/receipts-expenses#posLinks", async () => {
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_invoice_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_receipt_voucher_id INTEGER`
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// لوحات التحليل (رسوم بيانية لا جداول): التدفق النقدي والسيولة، تحليل المبيعات والربحية، الذمم والتحصيل.
// كل المبالغ بالعملة الأساسية (المبلغ × سعر الصرف)، السندات الملغاة (status 3) مستثناة.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SALES = 12, SALES_RETURN = 16, PURCHASE = 17, PURCHASE_RETURN = 19, RECEIPT = 4, PAYMENT = 5, CHEQUE_PAYMENT = 21
const RECEIVABLE_TYPES = [2, 3, 5]
const SECTIONS: Record<string, string> = { cash: "cash-flow-dashboard", sales: "sales-dashboard", receivables: "receivables-dashboard" }

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const parseIds = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const validDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const shiftYear = (date: string, years: number) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`.replace(/-02-29$/, "-02-28")
const monthsBetween = (from: string, to: string) => {
  const list: string[] = []
  let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7))
  const endYear = Number(to.slice(0, 4)), endMonth = Number(to.slice(5, 7))
  while ((year < endYear || (year === endYear && month <= endMonth)) && list.length < 36) {
    list.push(`${year}-${String(month).padStart(2, "0")}`)
    month++; if (month > 12) { month = 1; year++ }
  }
  return list
}

export async function GET(request: NextRequest) {
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const params = request.nextUrl.searchParams
    const kind = params.get("kind") || "cash"
    const section = SECTIONS[kind]
    if (!section) return NextResponse.json({ error: "لوحة غير معروفة" }, { status: 400 })
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const denied = await reportAccessDenied(request, [section])
    if (denied) return denied

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permitted = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const requested = parseIds(params.get("branch_ids"))
    const branchIds = requested.length ? requested.filter((id) => !permitted.length || permitted.includes(id)) : permitted
    if (requested.length && !branchIds.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const today = new Date().toISOString().slice(0, 10)
    const from = validDate(params.get("from_date"), `${today.slice(0, 4)}-01-01`)
    const to = validDate(params.get("to_date"), today)
    const [currency] = (await sql`SELECT id, currency_code AS code, currency_name AS name FROM currency ORDER BY id LIMIT 1`) as any[]
    const branches = params.get("meta") === "1"
      ? await sql`SELECT id, branch_code, branch_name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND COALESCE(status, 1) <> 3
                  AND (${permitted.length === 0} OR id = ANY(${permitted}::int[])) ORDER BY branch_name`
      : undefined
    const months = monthsBetween(from, to)
    const ctx = { from, to, branchIds, months }
    const data = kind === "cash" ? await cashDashboard(ctx) : kind === "sales" ? await salesDashboard(ctx) : await receivablesDashboard(ctx, [...(await deniedAccountIds(request))])
    return NextResponse.json({ ...data, currency, months, from_date: from, to_date: to, ...(branches ? { meta: { branches } } : {}) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Dashboards error:", error)
    return NextResponse.json({ error: "تعذر تحميل اللوحة" }, { status: 500 })
  }
}

type Ctx = { from: string; to: string; branchIds: number[]; months: string[] }

// ── 1) التدفق النقدي والسيولة ── (نفس قواعد كشف المقبوضات/المصروفات: سندات + فواتير نقدية غير مرتبطة بسند نقطة بيع)
async function cashDashboard({ from, to, branchIds, months }: Ctx) {
  await ensurePosLinkColumns()
  const flows = (await sql`
    WITH v AS (
      SELECT vh.id, vh.vch_type, to_char(vh.vch_date, 'YYYY-MM') AS month,
        CASE WHEN vh.vch_type IN (${RECEIPT}, ${SALES}, ${PURCHASE_RETURN}) THEN 'in' ELSE 'out' END AS direction
      FROM voucher_header_tbl vh
      WHERE COALESCE(vh.status, 1) <> 3 AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + 1)
        AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
        AND (vh.vch_type IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT})
             OR (vh.vch_type IN (${SALES}, ${PURCHASE_RETURN}, ${PURCHASE}, ${SALES_RETURN}) AND vh.account_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM voucher_header_tbl r WHERE r.vch_type IN (${RECEIPT}, ${PAYMENT}) AND COALESCE(r.status, 1) <> 3
                   AND (r.pos_invoice_voucher_id = vh.id OR r.id = vh.pos_receipt_voucher_id
                        OR r.note IN ('قبض فاتورة نقطة البيع ' || vh.vch_code, 'صرف مردود نقدي لفاتورة نقطة البيع ' || vh.vch_code)))))
    )
    SELECT v.month, v.direction,
      SUM(CASE WHEN (v.vch_type IN (${RECEIPT}, ${PAYMENT}) AND j.journal_type_id = 2) OR (v.vch_type NOT IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT}) AND j.journal_type_id = 5)
               THEN ABS(j.amount * COALESCE(NULLIF(j.rate, 0), 1)) ELSE 0 END)::float AS cash,
      SUM(CASE WHEN v.vch_type IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT}) AND j.journal_type_id = 3 THEN ABS(j.amount * COALESCE(NULLIF(j.rate, 0), 1)) ELSE 0 END)::float AS cheques,
      SUM(CASE WHEN v.vch_type IN (${RECEIPT}, ${PAYMENT}) AND j.journal_type_id = 4 THEN ABS(j.amount * COALESCE(NULLIF(j.rate, 0), 1)) ELSE 0 END)::float AS cards
    FROM v JOIN voucher_journal_detail_tbl j ON j.voucher_id = v.id AND j.journal_type_id IN (2, 3, 4, 5)
    GROUP BY 1, 2
  `) as any[]
  const monthly = months.map((month) => {
    const inRow = flows.find((row) => row.month === month && row.direction === "in")
    const outRow = flows.find((row) => row.month === month && row.direction === "out")
    const total = (row: any) => (row ? num(row.cash) + num(row.cheques) + num(row.cards) : 0)
    return { month, inflow: round(total(inRow)), outflow: round(total(outRow)), net: round(total(inRow) - total(outRow)) }
  })
  const methods = (["cash", "cheques", "cards"] as const).map((key) => ({
    key,
    inflow: round(flows.filter((row) => row.direction === "in").reduce((sum, row) => sum + num(row[key]), 0)),
    outflow: round(flows.filter((row) => row.direction === "out").reduce((sum, row) => sum + num(row[key]), 0)),
  }))

  // الشيكات المستحقة خلال 12 أسبوعاً القادمة: واردة (بالصندوق/برسم التحصيل) وصادرة (لم تُصرف بعد)
  const chequeRows = (await sql`
    SELECT c.cheq_type, FLOOR((c.due_date::date - CURRENT_DATE) / 7)::int AS week,
      SUM(ABS(c.amount * COALESCE(NULLIF(c.rate, 0), 1)))::float AS amount, COUNT(*)::int AS count
    FROM cheques_tbl c LEFT JOIN voucher_header_tbl vh ON vh.id = c.voucher_id
    WHERE COALESCE(vh.status, 1) <> 3 AND c.due_date::date >= CURRENT_DATE AND c.due_date::date < CURRENT_DATE + 84
      AND ((c.cheq_type = 1 AND c.status_id IN (1, 2, 3, 8)) OR (c.cheq_type = 2 AND c.status_id IN (1, 2, 3)))
      AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    GROUP BY 1, 2
  `.catch(() => [])) as any[]
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  const cheques = Array.from({ length: 12 }, (_, week) => {
    const weekStart = new Date(start.getTime() + week * 7 * 86_400_000).toISOString().slice(0, 10)
    const incoming = chequeRows.find((row) => Number(row.cheq_type) === 1 && Number(row.week) === week)
    const outgoing = chequeRows.find((row) => Number(row.cheq_type) === 2 && Number(row.week) === week)
    return { week: weekStart, incoming: round(num(incoming?.amount)), outgoing: round(num(outgoing?.amount)), incoming_count: num(incoming?.count), outgoing_count: num(outgoing?.count) }
  })

  // أرصدة النقدية والبنوك حتى نهاية الفترة: الحسابات الجارية للبنوك + حسابات الصناديق المستخدمة بالقبض/الصرف النقدي
  const balances = (await sql`
    WITH cash_accounts AS (
      SELECT DISTINCT j.account_id, 'cash' AS kind FROM voucher_journal_detail_tbl j JOIN voucher_header_tbl vh ON vh.id = j.voucher_id
      WHERE vh.vch_type IN (${RECEIPT}, ${PAYMENT}) AND j.journal_type_id = 2 AND j.account_id IS NOT NULL
      UNION
      SELECT DISTINCT ba.jary_account_id, 'bank' FROM bank_accounts ba WHERE ba.jary_account_id IS NOT NULL AND COALESCE(ba.status, 1) <> 3
    ), picked AS (SELECT account_id, MAX(kind) AS kind FROM cash_accounts GROUP BY account_id)
    SELECT a.id, a.code, a.name, p.kind,
      COALESCE(SUM(CASE WHEN j.credit_debit = 1 THEN 1 ELSE -1 END * ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1)))), 0)::float AS balance
    FROM picked p JOIN account_tbl a ON a.id = p.account_id
    LEFT JOIN voucher_journal_detail_tbl j ON j.account_id = a.id
      AND EXISTS (SELECT 1 FROM voucher_header_tbl vh WHERE vh.id = j.voucher_id AND COALESCE(vh.status, 1) <> 3 AND vh.vch_date < (${to}::date + 1))
    GROUP BY a.id, a.code, a.name, p.kind
    HAVING ABS(COALESCE(SUM(CASE WHEN j.credit_debit = 1 THEN 1 ELSE -1 END * ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1)))), 0)) >= 0.01
    ORDER BY balance DESC
  `.catch(() => [])) as any[]

  const inflow = monthly.reduce((sum, row) => sum + row.inflow, 0), outflow = monthly.reduce((sum, row) => sum + row.outflow, 0)
  return {
    kpis: {
      inflow: round(inflow), outflow: round(outflow), net: round(inflow - outflow),
      liquidity: round(balances.reduce((sum, row) => sum + num(row.balance), 0)),
      cheques_in_12w: round(cheques.reduce((sum, row) => sum + row.incoming, 0)),
      cheques_out_12w: round(cheques.reduce((sum, row) => sum + row.outgoing, 0)),
    },
    monthly, methods, cheques,
    balances: balances.map((row) => ({ id: Number(row.id), code: row.code, name: row.name, kind: row.kind, balance: round(num(row.balance)) })),
  }
}

// ── 2) تحليل المبيعات والربحية ── (الربح من محرك أرباح المبيعات بكلفة المعدل، كتقرير "أرباح فترة معينة")
async function salesDashboard({ from, to, branchIds, months }: Ctx) {
  const lines = await computeSalesProfitLines({
    from, to, pricingWay: "average", types: [SALES, SALES_RETURN], productIds: [], groupIds: [], warehouseIds: [],
    branchIds, customerIds: [], salesmanIds: [], voucherCode: "",
  })
  const prevFrom = shiftYear(from, -1), prevTo = shiftYear(to, -1)
  // اتجاه سنوي (هذه الفترة مقابل نفس الفترة من السنة السابقة) — صافي الفواتير من رؤوس السندات
  const trend = (await sql`
    SELECT to_char(vh.vch_date, 'YYYY-MM') AS month,
      SUM(CASE WHEN vh.vch_type = ${SALES} THEN 1 ELSE -1 END * vh.amount * COALESCE(NULLIF(vh.rate, 0), 1))::float AS sales
    FROM voucher_header_tbl vh
    WHERE vh.vch_type IN (${SALES}, ${SALES_RETURN}) AND COALESCE(vh.status, 1) <> 3
      AND ((vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + 1)) OR (vh.vch_date >= ${prevFrom}::date AND vh.vch_date < (${prevTo}::date + 1)))
      AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    GROUP BY 1
  `) as any[]
  const trendOf = (month: string) => num(trend.find((row) => row.month === month)?.sales)

  type Acc = { sales: number; profit: number; cost: number }
  const bucket = () => ({ sales: 0, profit: 0, cost: 0 }) as Acc
  const add = (target: Acc, line: any) => { target.sales += num(line.sale_total); target.profit += num(line.profit); target.cost += num(line.cost_total) + num(line.bonus_cost) }
  const byMonth = new Map<string, Acc>(), byCustomer = new Map<string, Acc & { name: string; code: string }>(), byItem = new Map<string, Acc & { name: string; code: string; quantity: number }>()
  const byBranch = new Map<string, Acc>(), byWeekday = Array.from({ length: 7 }, bucket)
  const invoices = new Set<number>(), returns = { amount: 0, count: new Set<number>() }
  let unpriced = 0
  for (const line of lines as any[]) {
    const month = String(line.vch_date).slice(0, 7)
    add(byMonth.get(month) || (byMonth.set(month, bucket()), byMonth.get(month)!), line)
    const customerKey = String(line.customer_id || line.customer_name || "cash")
    if (!byCustomer.has(customerKey)) byCustomer.set(customerKey, { ...bucket(), name: line.customer_name || "عميل نقدي", code: "" })
    add(byCustomer.get(customerKey)!, line)
    const itemKey = String(line.product_id)
    if (!byItem.has(itemKey)) byItem.set(itemKey, { ...bucket(), name: line.product_name, code: line.product_code, quantity: 0 })
    const item = byItem.get(itemKey)!; add(item, line); item.quantity += num(line.quantity)
    const branchKey = line.branch_name || "—"
    add(byBranch.get(branchKey) || (byBranch.set(branchKey, bucket()), byBranch.get(branchKey)!), line)
    add(byWeekday[new Date(`${String(line.vch_date).slice(0, 10)}T00:00:00Z`).getUTCDay()], line)
    if (Number(line.vch_type) === SALES) invoices.add(Number(line.voucher_id))
    else { returns.amount += -num(line.sale_total); returns.count.add(Number(line.voucher_id)) }
    if (!line.priced) unpriced++
  }
  const totals = [...byMonth.values()].reduce((sum, row) => ({ sales: sum.sales + row.sales, profit: sum.profit + row.profit, cost: sum.cost + row.cost }), bucket())
  const current = months.reduce((sum, month) => sum + trendOf(month), 0)
  const previous = months.reduce((sum, month) => sum + trendOf(`${Number(month.slice(0, 4)) - 1}${month.slice(4)}`), 0)
  const top = <T extends Acc>(map: Map<string, T>, size: number) => [...map.values()].sort((a, b) => b.sales - a.sales).slice(0, size)
    .map((row) => ({ ...row, sales: round(row.sales), profit: round(row.profit), cost: round(row.cost), margin: row.sales ? round((row.profit / row.sales) * 100) : 0 }))
  return {
    kpis: {
      sales: round(totals.sales), profit: round(totals.profit), margin: totals.sales ? round((totals.profit / totals.sales) * 100) : 0,
      invoices: invoices.size, average_invoice: invoices.size ? round(totals.sales / invoices.size) : 0,
      returns: round(returns.amount), returns_count: returns.count.size,
      growth: previous ? round(((current - previous) / Math.abs(previous)) * 100) : null, previous_sales: round(previous), unpriced_lines: unpriced,
    },
    monthly: months.map((month) => {
      const row = byMonth.get(month) || bucket()
      return { month, sales: round(row.sales), profit: round(row.profit), invoiced: round(trendOf(month)), previous_year: round(trendOf(`${Number(month.slice(0, 4)) - 1}${month.slice(4)}`)) }
    }),
    customers: top(byCustomer, 10), items: top(byItem, 10),
    branches: [...byBranch.entries()].map(([name, row]) => ({ name, sales: round(row.sales), profit: round(row.profit) })).sort((a, b) => b.sales - a.sales),
    weekdays: byWeekday.map((row, day) => ({ day, sales: round(row.sales), profit: round(row.profit) })),
  }
}

// ── 3) الذمم والتحصيل ── (أرصدة حتى نهاية الفترة، تعمير الأرصدة المدينة على أحدث حركات المدين كتقرير تعمير الذمم)
async function receivablesDashboard({ from, to, branchIds, months }: Ctx, denied: number[]) {
  const accounts = (await sql`
    SELECT a.id, a.code, a.name, NULLIF(a.max_balance_amount, 0)::float AS credit_limit,
      SUM(CASE WHEN j.credit_debit = 1 THEN 1 ELSE -1 END * ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1))))::float AS balance,
      COALESCE(SUM(CASE WHEN j.credit_debit = 1 THEN 1 ELSE -1 END * ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1))))
        FILTER (WHERE vh.vch_date < ${from}::date), 0)::float AS opening,
      COALESCE(SUM(ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1))))
        FILTER (WHERE vh.vch_date >= ${from}::date AND j.credit_debit = 1), 0)::float AS charges,
      COALESCE(SUM(ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1))))
        FILTER (WHERE vh.vch_date >= ${from}::date AND j.credit_debit = 2 AND vh.vch_type = ${RECEIPT}), 0)::float AS collected
    FROM account_tbl a
    JOIN voucher_journal_detail_tbl j ON j.account_id = a.id
    JOIN voucher_header_tbl vh ON vh.id = j.voucher_id AND COALESCE(vh.status, 1) <> 3 AND vh.vch_date < (${to}::date + 1)
      AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    WHERE a.type = ANY(${RECEIVABLE_TYPES}::int[]) AND COALESCE(a.status, 1) <> 3
      AND (${denied.length === 0} OR NOT (a.id = ANY(${denied}::int[])))
    GROUP BY a.id, a.code, a.name, a.max_balance_amount
  `) as any[]
  const debtors = accounts.filter((row) => num(row.balance) >= 0.01)
  const creditors = accounts.filter((row) => num(row.balance) <= -0.01)
  const debtorIds = debtors.map((row) => Number(row.id))

  // تعمير: يوزَّع رصيد كل مدين على أحدث حركاته المدينة
  const movements = debtorIds.length ? ((await sql`
    SELECT j.account_id, vh.vch_date::date::text AS d, ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1)))::float AS amount
    FROM voucher_journal_detail_tbl j JOIN voucher_header_tbl vh ON vh.id = j.voucher_id
    WHERE j.account_id = ANY(${debtorIds}::int[]) AND j.credit_debit = 1 AND COALESCE(vh.status, 1) <> 3 AND vh.vch_date < (${to}::date + 1)
      AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    ORDER BY j.account_id, vh.vch_date DESC
  `) as any[]) : []
  const periods = [30, 60, 90, 120]
  const aging = new Array(periods.length + 1).fill(0)
  const overdueBy = new Map<number, number>()
  const end = Date.parse(to)
  const byAccount = new Map<number, any[]>()
  for (const row of movements) (byAccount.get(Number(row.account_id)) || byAccount.set(Number(row.account_id), []).get(Number(row.account_id))!).push(row)
  for (const debtor of debtors) {
    let remaining = num(debtor.balance)
    let overdue = 0
    for (const row of byAccount.get(Number(debtor.id)) || []) {
      if (remaining <= 0.005) break
      const take = Math.min(remaining, num(row.amount))
      const age = Math.round((end - Date.parse(row.d)) / 86_400_000) + 1
      const index = periods.findIndex((days) => age <= days)
      aging[index === -1 ? periods.length : index] += take
      if (age > 60) overdue += take
      remaining -= take
    }
    if (remaining > 0.005) { aging[periods.length] += remaining; overdue += remaining }
    overdueBy.set(Number(debtor.id), overdue)
  }

  const flows = (await sql`
    SELECT to_char(vh.vch_date, 'YYYY-MM') AS month,
      SUM(CASE WHEN vh.vch_type = ${SALES} THEN vh.amount * COALESCE(NULLIF(vh.rate, 0), 1) WHEN vh.vch_type = ${SALES_RETURN} THEN -vh.amount * COALESCE(NULLIF(vh.rate, 0), 1) ELSE 0 END)::float AS credit_sales,
      SUM(CASE WHEN vh.vch_type = ${RECEIPT} THEN vh.amount * COALESCE(NULLIF(vh.rate, 0), 1) ELSE 0 END)::float AS collections
    FROM voucher_header_tbl vh JOIN account_tbl a ON a.id = vh.account_id AND a.type = ANY(${RECEIVABLE_TYPES}::int[])
    WHERE vh.vch_type IN (${SALES}, ${SALES_RETURN}, ${RECEIPT}) AND COALESCE(vh.status, 1) <> 3
      AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + 1)
      AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    GROUP BY 1
  `) as any[]
  const monthly = months.map((month) => {
    const row = flows.find((item) => item.month === month)
    return { month, credit_sales: round(num(row?.credit_sales)), collections: round(num(row?.collections)) }
  })
  const receivables = debtors.reduce((sum, row) => sum + num(row.balance), 0)
  // المؤشرات من قيود حسابات الذمم نفسها (لا من رؤوس الفواتير): الذمم تُحمَّل أيضاً بسندات قيد وصرف وشيكات.
  //   نسبة التحصيل = مقبوضات سندات القبض ÷ (الرصيد المدين أول الفترة + كل الحركات المدينة بالفترة)
  //   فترة التحصيل DSO = الذمم المدينة ÷ متوسط الحركات المدينة اليومية
  const openingReceivables = accounts.reduce((sum, row) => sum + Math.max(num(row.opening), 0), 0)
  const charges = accounts.reduce((sum, row) => sum + num(row.charges), 0)
  const collected = accounts.reduce((sum, row) => sum + num(row.collected), 0)
  const collectible = openingReceivables + charges
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)
  const overdueTotal = aging.slice(2).reduce((sum, value) => sum + value, 0)
  return {
    kpis: {
      receivables: round(receivables), payables: round(-creditors.reduce((sum, row) => sum + num(row.balance), 0)),
      debtors: debtors.length, overdue: round(overdueTotal), overdue_share: receivables ? round((overdueTotal / receivables) * 100) : 0,
      dso: charges > 0 ? Math.round(receivables / (charges / days)) : null,
      collection_rate: collectible > 0 ? round((collected / collectible) * 100) : null,
      opening_receivables: round(openingReceivables), charges: round(charges), collections: round(collected),
      over_limit: debtors.filter((row) => row.credit_limit && num(row.balance) > num(row.credit_limit)).length,
    },
    aging: aging.map((value, index) => ({ label: index < periods.length ? `${index === 0 ? 1 : periods[index - 1] + 1}-${periods[index]}` : `${periods[periods.length - 1] + 1}+`, amount: round(value) })),
    top_debtors: debtors.sort((a, b) => num(b.balance) - num(a.balance)).slice(0, 10).map((row) => ({
      id: Number(row.id), code: row.code, name: row.name, balance: round(num(row.balance)), credit_limit: row.credit_limit == null ? null : round(num(row.credit_limit)),
      overdue: round(overdueBy.get(Number(row.id)) || 0),
    })),
    monthly,
  }
}
