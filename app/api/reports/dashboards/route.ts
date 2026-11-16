import { NextResponse, type NextRequest } from "next/server"
import sql, { getTenantPool, resolveCurrentDbName } from "@/lib/database"
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
// الأداء: كل لوحة تُجمَّع داخل قاعدة البيانات (لا تُحمَّل الأسطر/الحركات للذاكرة). الاستثناء الوحيد هو الربح
// (kind=sales-profit) لأنه يحتاج إعادة حركة المخزون زمنياً — يُطلب منفصلاً بعد ظهور اللوحة ويُخزَّن مؤقتاً.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SALES = 12, SALES_RETURN = 16, PURCHASE = 17, PURCHASE_RETURN = 19, RECEIPT = 4, PAYMENT = 5, CHEQUE_PAYMENT = 21
const RECEIVABLE_TYPES = [2, 3, 5]
const SECTIONS: Record<string, string> = { cash: "cash-flow-dashboard", sales: "sales-dashboard", "sales-profit": "sales-dashboard", receivables: "receivables-dashboard" }

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
    const months = monthsBetween(from, to)
    const ctx = { from, to, branchIds, months }
    if (kind === "sales-profit") return NextResponse.json(await salesProfit(ctx), { headers: { "Cache-Control": "no-store" } })

    const [currency] = (await sql`SELECT id, currency_code AS code, currency_name AS name FROM currency ORDER BY id LIMIT 1`) as any[]
    const branches = params.get("meta") === "1"
      ? await sql`SELECT id, branch_code, branch_name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND COALESCE(status, 1) <> 3
                  AND (${permitted.length === 0} OR id = ANY(${permitted}::int[])) ORDER BY branch_name`
      : undefined
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
  // الفواتير النقدية المرتبطة بسند قبض/صرف نقطة بيع تُستثنى (السند يمثّلها). الربط يُحسب مرة كمجموعة بربط تساوٍ
  // (hash join) بدل NOT EXISTS فيه OR لكل فاتورة — كان يمسح سندات القبض كلها لكل فاتورة على البيانات الكبيرة.
  const flows = (await sql`
    WITH inv AS (
      SELECT vh.id, vh.vch_type, vh.vch_date, vh.vch_code, vh.pos_receipt_voucher_id FROM voucher_header_tbl vh
      WHERE vh.vch_type IN (${SALES}, ${PURCHASE_RETURN}, ${PURCHASE}, ${SALES_RETURN}) AND vh.account_id IS NULL AND COALESCE(vh.status, 1) <> 3
        AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + 1)
        AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
    ), rc AS (
      SELECT r.id, r.pos_invoice_voucher_id, r.note FROM voucher_header_tbl r WHERE r.vch_type IN (${RECEIPT}, ${PAYMENT}) AND COALESCE(r.status, 1) <> 3
    ), linked AS (
      SELECT rc.pos_invoice_voucher_id AS id FROM rc WHERE rc.pos_invoice_voucher_id IS NOT NULL
      UNION SELECT inv.id FROM inv JOIN rc ON rc.id = inv.pos_receipt_voucher_id
      UNION SELECT inv.id FROM inv JOIN rc ON rc.note = 'قبض فاتورة نقطة البيع ' || inv.vch_code
      UNION SELECT inv.id FROM inv JOIN rc ON rc.note = 'صرف مردود نقدي لفاتورة نقطة البيع ' || inv.vch_code
    ), v AS (
      SELECT vh.id, vh.vch_type, vh.vch_date FROM voucher_header_tbl vh
      WHERE vh.vch_type IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT}) AND COALESCE(vh.status, 1) <> 3
        AND vh.vch_date >= ${from}::date AND vh.vch_date < (${to}::date + 1)
        AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
      UNION ALL
      SELECT inv.id, inv.vch_type, inv.vch_date FROM inv LEFT JOIN linked l ON l.id = inv.id WHERE l.id IS NULL
    )
    SELECT to_char(v.vch_date, 'YYYY-MM') AS month,
      CASE WHEN v.vch_type IN (${RECEIPT}, ${SALES}, ${PURCHASE_RETURN}) THEN 'in' ELSE 'out' END AS direction,
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

// ── 2) تحليل المبيعات ── صافي المبيعات مجمّعاً بقاعدة البيانات بنفس قواعد محرك الأرباح (lib/sales-profit.ts netSaleAmount):
// خصم السطر/نقطة البيع والحملة، حصة السطر من خصم السند، استبعاد الضريبة إن كانت شاملة، × سعر الصرف؛ أصناف المخزون فقط.
const columnCache = new Map<string, Set<string>>()
async function voucherColumns() {
  const db = await resolveCurrentDbName().catch(() => "")
  const cached = columnCache.get(db)
  if (cached) return cached
  const rows = await sql`SELECT table_name || '.' || column_name AS name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name IN ('voucher_items_tbl', 'voucher_header_tbl')
      AND column_name IN ('pos_discount_percent', 'campaign_discount', 'vat_included', 'vat_percent')`
  const set = new Set<string>(rows.map((row: any) => String(row.name)))
  columnCache.set(db, set)
  return set
}

async function salesDashboard({ from, to, branchIds, months }: Ctx) {
  const columns = await voucherColumns()
  const disc = (alias: string) => columns.has("voucher_items_tbl.pos_discount_percent") ? `COALESCE(${alias}.pos_discount_percent, ${alias}.discount, 0)` : `COALESCE(${alias}.discount, 0)`
  const camp = (alias: string) => columns.has("voucher_items_tbl.campaign_discount") ? `COALESCE(${alias}.campaign_discount, 0)` : "0"
  const raw = (alias: string) => `GREATEST(0, COALESCE(${alias}.qnty, 0) * COALESCE(${alias}.price, 0) * (1 - ${disc(alias)} / 100) - ${camp(alias)})`
  const vatIncluded = columns.has("voucher_header_tbl.vat_included") ? "COALESCE(vh.vat_included, false)" : "false"
  const vatPercent = columns.has("voucher_header_tbl.vat_percent") ? "COALESCE(vh.vat_percent, 0)" : "0"
  const pool = await getTenantPool()
  const rows = (await pool.query(`
    WITH l AS (
      SELECT vh.id AS vid, vh.vch_type AS t, vh.vch_date::date AS d, vh.account_id AS acc, vh.branch_id AS br, vi.item_id AS item,
        COALESCE(vi.qnty, 0) AS qnty, CASE WHEN vh.vch_type = ${SALES_RETURN} THEN -1 ELSE 1 END AS sg, ${raw("vi")} AS raw,
        COALESCE(vi.vat_ratio, 0) AS vr, COALESCE(vh.discount_type, 'percentage') AS dt, COALESCE(vh.discount_value, 0) AS dv,
        ${vatIncluded} AS inc, ${vatPercent} AS vp, COALESCE(NULLIF(vh.rate, 0), 1) AS rate
      FROM voucher_items_tbl vi
      JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      JOIN products p ON p.id = vi.item_id
      WHERE vh.vch_type IN (${SALES}, ${SALES_RETURN}) AND COALESCE(vh.status, 1) <> 3
        AND vh.vch_date >= $1::date AND vh.vch_date < ($2::date + 1) AND COALESCE(p.type, 1) = 1
        AND (cardinality($3::int[]) = 0 OR vh.branch_id = ANY($3::int[]))
    ), sub AS (
      SELECT line.voucher_id AS vid, SUM(${raw("line")}) AS subtotal
      FROM voucher_items_tbl line WHERE line.voucher_id IN (SELECT DISTINCT vid FROM l) GROUP BY 1
    ), n AS (
      SELECT l.vid, l.t, l.acc, l.br, l.item, l.sg * l.qnty AS qty, to_char(l.d, 'YYYY-MM') AS m, EXTRACT(DOW FROM l.d)::int AS dow,
        l.sg * GREATEST(0, l.raw - CASE WHEN l.dt = 'amount' THEN CASE WHEN s.subtotal > 0 THEN l.dv * l.raw / s.subtotal ELSE 0 END ELSE l.raw * l.dv / 100 END)
          / CASE WHEN l.inc THEN 1 + COALESCE(NULLIF(l.vr, 0), l.vp) / 100 ELSE 1 END * l.rate AS net
      FROM l LEFT JOIN sub s ON s.vid = l.vid
    )
    SELECT CASE WHEN GROUPING(m) = 0 THEN 'month' WHEN GROUPING(acc) = 0 THEN 'customer' WHEN GROUPING(item) = 0 THEN 'item'
                WHEN GROUPING(br) = 0 THEN 'branch' WHEN GROUPING(dow) = 0 THEN 'dow' ELSE 'total' END AS dim,
      COALESCE(m, acc::text, item::text, br::text, dow::text) AS key,
      SUM(net)::float AS sales, SUM(qty)::float AS quantity,
      COUNT(DISTINCT vid) FILTER (WHERE t = ${SALES})::int AS invoices,
      COUNT(DISTINCT vid) FILTER (WHERE t = ${SALES_RETURN})::int AS returns_count,
      COALESCE(-SUM(net) FILTER (WHERE t = ${SALES_RETURN}), 0)::float AS returns
    FROM n GROUP BY GROUPING SETS ((m), (acc), (item), (br), (dow), ())
  `, [from, to, branchIds])).rows as any[]
  const of = (dim: string) => rows.filter((row) => row.dim === dim)
  const total = of("total")[0] || {}
  const top = (dim: string) => of(dim).sort((a, b) => num(b.sales) - num(a.sales)).slice(0, 10)
  const topCustomers = top("customer"), topItems = top("item")
  const customerIds = topCustomers.map((row) => Number(row.key)).filter((id) => id > 0)
  const itemIds = topItems.map((row) => Number(row.key)).filter((id) => id > 0)
  const [customerNames, itemNames, branchNames] = await Promise.all([
    customerIds.length ? sql`SELECT id, code, name FROM account_tbl WHERE id = ANY(${customerIds}::int[])` : [],
    itemIds.length ? sql`SELECT id, product_code AS code, product_name AS name FROM products WHERE id = ANY(${itemIds}::int[])` : [],
    sql`SELECT id, branch_name AS name FROM branches`,
  ]) as any[][]
  const nameOf = (list: any[], key: string | null) => list.find((row) => String(row.id) === String(key))

  // اتجاه سنوي (هذه الفترة مقابل نفس الفترة من السنة السابقة) — صافي الفواتير من رؤوس السندات
  const prevFrom = shiftYear(from, -1), prevTo = shiftYear(to, -1)
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
  const lastYear = (month: string) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`
  const current = months.reduce((sum, month) => sum + trendOf(month), 0)
  const previous = months.reduce((sum, month) => sum + trendOf(lastYear(month)), 0)
  const sales = num(total.sales), invoices = num(total.invoices)
  return {
    kpis: {
      sales: round(sales), invoices, average_invoice: invoices ? round(sales / invoices) : 0,
      returns: round(num(total.returns)), returns_count: num(total.returns_count),
      growth: previous ? round(((current - previous) / Math.abs(previous)) * 100) : null, previous_sales: round(previous),
    },
    monthly: months.map((month) => ({
      month, sales: round(num(of("month").find((row) => row.key === month)?.sales)),
      invoiced: round(trendOf(month)), previous_year: round(trendOf(lastYear(month))),
    })),
    customers: topCustomers.map((row) => {
      const named = nameOf(customerNames, row.key)
      return { key: row.key == null ? "cash" : String(row.key), name: named?.name || "عميل نقدي", code: named?.code || "", sales: round(num(row.sales)) }
    }),
    items: topItems.map((row) => {
      const named = nameOf(itemNames, row.key)
      return { key: String(row.key), name: named?.name || "-", code: named?.code || "", sales: round(num(row.sales)), quantity: round(num(row.quantity)) }
    }),
    branches: of("branch").map((row) => ({ key: row.key == null ? "none" : String(row.key), name: nameOf(branchNames, row.key)?.name || "—", sales: round(num(row.sales)) }))
      .sort((a, b) => b.sales - a.sales),
    weekdays: Array.from({ length: 7 }, (_, day) => ({ day, sales: round(num(of("dow").find((row) => Number(row.key) === day)?.sales)) })),
  }
}

// ── 2ب) الربح ── من محرك أرباح المبيعات بكلفة المعدل (كتقرير "أرباح فترة معينة"). ثقيل (إعادة حركة المخزون):
// يُطلب بعد ظهور اللوحة، طلب واحد لكل (قاعدة، فترة، فروع) في نفس الوقت، والنتيجة تُخزَّن 10 دقائق.
const PROFIT_TTL = 10 * 60_000
const profitCache = new Map<string, { at: number; value: Promise<any> }>()
async function salesProfit(ctx: Ctx) {
  const key = `${await resolveCurrentDbName().catch(() => "")}|${ctx.from}|${ctx.to}|${ctx.branchIds.join(",")}`
  const hit = profitCache.get(key)
  if (hit && Date.now() - hit.at < PROFIT_TTL) return hit.value
  for (const [cachedKey, entry] of profitCache) if (Date.now() - entry.at >= PROFIT_TTL) profitCache.delete(cachedKey)
  const value = computeProfit(ctx)
  profitCache.set(key, { at: Date.now(), value })
  value.catch(() => profitCache.delete(key))
  return value
}

async function computeProfit({ from, to, branchIds, months }: Ctx) {
  const lines = await computeSalesProfitLines({
    from, to, pricingWay: "average", types: [SALES, SALES_RETURN], productIds: [], groupIds: [], warehouseIds: [],
    branchIds, customerIds: [], salesmanIds: [], voucherCode: "",
  })
  type Acc = { sales: number; profit: number }
  const maps = { month: new Map<string, Acc>(), customer: new Map<string, Acc>(), item: new Map<string, Acc>(), branch: new Map<string, Acc>(), dow: new Map<string, Acc>() }
  const add = (map: Map<string, Acc>, key: string, line: any) => {
    const row = map.get(key) || { sales: 0, profit: 0 }
    row.sales += num(line.sale_total); row.profit += num(line.profit); map.set(key, row)
  }
  let sales = 0, profit = 0, unpriced = 0
  for (const line of lines as any[]) {
    const date = String(line.vch_date).slice(0, 10)
    add(maps.month, date.slice(0, 7), line)
    add(maps.customer, line.customer_id == null ? "cash" : String(line.customer_id), line)
    add(maps.item, String(line.product_id), line)
    add(maps.branch, line.branch_id == null ? "none" : String(line.branch_id), line)
    add(maps.dow, String(new Date(`${date}T00:00:00Z`).getUTCDay()), line)
    sales += num(line.sale_total); profit += num(line.profit)
    if (!line.priced) unpriced++
  }
  const flat = (map: Map<string, Acc>) => Object.fromEntries([...map].map(([key, row]) => [key, round(row.profit)]))
  return {
    profit: round(profit), margin: sales ? round((profit / sales) * 100) : 0, unpriced_lines: unpriced,
    by_month: Object.fromEntries(months.map((month) => [month, round(maps.month.get(month)?.profit || 0)])),
    by_customer: flat(maps.customer), by_item: flat(maps.item), by_branch: flat(maps.branch), by_dow: flat(maps.dow),
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

  // تعمير: يوزَّع رصيد كل مدين على أحدث حركاته المدينة — بمجموع تراكمي داخل قاعدة البيانات (تعود الشرائح فقط، لا الحركات)
  const periods = [30, 60, 90, 120]
  const aging = new Array(periods.length + 1).fill(0)
  const overdueBy = new Map<number, number>()
  const takenBy = new Map<number, number>()
  if (debtors.length) {
    const buckets = (await sql`
      WITH bal AS (SELECT * FROM unnest(${debtors.map((row) => Number(row.id))}::int[], ${debtors.map((row) => num(row.balance))}::float8[]) AS b(id, balance)),
      mv AS (
        SELECT j.account_id, j.id AS jid, vh.vch_date::date AS d, ABS(COALESCE(j.base_curr_amount, j.amount * COALESCE(NULLIF(j.rate, 0), 1)))::float8 AS amount
        FROM voucher_journal_detail_tbl j JOIN voucher_header_tbl vh ON vh.id = j.voucher_id
        WHERE j.account_id IN (SELECT id FROM bal) AND j.credit_debit = 1 AND COALESCE(vh.status, 1) <> 3 AND vh.vch_date < (${to}::date + 1)
          AND (${branchIds.length === 0} OR vh.branch_id = ANY(${branchIds}::int[]))
      ), run AS (
        SELECT mv.account_id, mv.d, mv.amount, bal.balance,
          SUM(mv.amount) OVER (PARTITION BY mv.account_id ORDER BY mv.d DESC, mv.jid DESC) - mv.amount AS before
        FROM mv JOIN bal ON bal.id = mv.account_id
      )
      SELECT account_id, (${to}::date - d) + 1 AS age_days, SUM(LEAST(amount, balance - before))::float AS amount
      FROM run WHERE before < balance GROUP BY 1, 2
    `) as any[]
    for (const row of buckets) {
      const age = Number(row.age_days), amount = num(row.amount), id = Number(row.account_id)
      const index = periods.findIndex((days) => age <= days)
      aging[index === -1 ? periods.length : index] += amount
      if (age > 60) overdueBy.set(id, (overdueBy.get(id) || 0) + amount)
      takenBy.set(id, (takenBy.get(id) || 0) + amount)
    }
    // ما يتبقى من الرصيد بلا حركات مدينة كافية (أرصدة افتتاحية/دائنة سابقة) يُعدّ أقدم شريحة
    for (const debtor of debtors) {
      const rest = num(debtor.balance) - (takenBy.get(Number(debtor.id)) || 0)
      if (rest > 0.005) { aging[periods.length] += rest; overdueBy.set(Number(debtor.id), (overdueBy.get(Number(debtor.id)) || 0) + rest) }
    }
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
