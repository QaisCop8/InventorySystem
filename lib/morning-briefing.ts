import sql from "@/lib/database"

// الملخص الصباحي: أرقام اليوم السابق + ما يحتاج متابعة اليوم، بعملة الأساس (أول عملة)، مقيّدة بفروع المستخدم.
// كل قسم مستقل: جدول غير موجود في شركة لا تستخدم ميزة ما (نقاط البيع/المسودات/البوابة) يُرجع قائمة فارغة بدل إسقاط الملخص.

export type BriefingSales = { day: string; branch_id: number | null; branch_name: string; sales: number; returns: number; invoices: number }
export type MorningBriefing = {
  day: string
  today: string
  currency: { id: number; code: string; name: string }
  branches: { id: number; name: string }[]
  sales: { current: BriefingSales[]; lastWeek: BriefingSales[] }
  totals: { sales: number; returns: number; net: number; invoices: number; lastWeekNet: number; changePercent: number | null; receipts: number; receiptCount: number; marginPercent: number | null }
  cashier: { point_name: string; user_name: string; expected: number; counted: number; difference: number }[]
  cheques: { dueCount: number; dueAmount: number; items: { cheq_num: string; due_date: string; amount: number; currency_code: string; base_amount: number; owner: string }[]; returned: { cheq_num: string; amount: number; currency_code: string; owner: string }[] }
  receivables: { total: number; customers: number; overLimit: number; top: { id: number; code: string; name: string; balance: number; limit: number }[] }
  stock: { atRisk: number; items: { id: number; code: string; name: string; stock: number; daily: number; days_left: number }[]; deadItems: number }
  watch: {
    cancelled: { vch_type: number; vch_code: string; amount: number }[]
    discounts: { vch_code: string; amount: number; discount_percent: number }[]
    drafts: { count: number; deposits: number }
    portalPayments: { count: number; amount: number }
  }
}

const num = (value: unknown) => Number(value || 0)
const round = (value: number) => Math.round(value * 100) / 100

async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (["42P01", "42703"].includes(String((error as { code?: string })?.code))) return fallback
    throw error
  }
}

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** الفروع المسموحة للمستخدم (لا عضويات = كل الفروع) — نفس قاعدة كشف الحساب */
export async function briefingBranchIds(userId: string): Promise<number[]> {
  const rows = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${userId}`
  return rows.map((row: any) => Number(row.branch_id)).filter((id: number) => Number.isInteger(id) && id > 0)
}

export async function buildMorningBriefing(day: string, branchIds: number[]): Promise<MorningBriefing> {
  const today = addDays(day, 1)
  const weekAgo = addDays(day, -7)
  const all = branchIds.length === 0
  const branches = branchIds

  const [currencyRows, branchRows] = await Promise.all([
    sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active,true) ORDER BY id LIMIT 1`,
    all
      ? sql`SELECT id, branch_name FROM branches WHERE COALESCE(status,1)<>3 ORDER BY branch_name`
      : sql`SELECT id, branch_name FROM branches WHERE id = ANY(${branches}::int[]) ORDER BY branch_name`,
  ])

  const [salesRows, marginRows, receiptRows, cashier, dueCheques, returnedCheques, receivableRows, receivableTop, stockRows, deadRows, cancelled, discounts, drafts, portal] = await Promise.all([
    sql`
      SELECT vh.vch_date::date::text AS day, vh.branch_id, COALESCE(b.branch_name,'بدون فرع') branch_name,
        COALESCE(SUM(vh.amount*COALESCE(NULLIF(vh.rate,0),1)) FILTER (WHERE vh.vch_type=12),0) sales,
        COALESCE(SUM(vh.amount*COALESCE(NULLIF(vh.rate,0),1)) FILTER (WHERE vh.vch_type=16),0) returns,
        COUNT(*) FILTER (WHERE vh.vch_type=12) invoices
      FROM voucher_header_tbl vh LEFT JOIN branches b ON b.id=vh.branch_id
      WHERE vh.vch_type IN (12,16) AND vh.status<>3
        AND ((vh.vch_date>=${day}::date AND vh.vch_date<${today}::date) OR (vh.vch_date>=${weekAgo}::date AND vh.vch_date<(${weekAgo}::date+1)))
        AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
      GROUP BY 1, vh.branch_id, b.branch_name ORDER BY sales DESC`,
    // هامش تقريبي: الأسطر التي لها تكلفة فقط (خصم الفاتورة الإجمالي غير محسوب)
    sql`
      SELECT COALESCE(SUM(vi.qnty*vi.price*(1-COALESCE(vi.discount,0)/100)*COALESCE(NULLIF(vh.rate,0),1)),0) revenue,
             COALESCE(SUM(vi.qnty*vi.cost_price*COALESCE(NULLIF(vh.rate,0),1)),0) cost
      FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
      WHERE vh.vch_type=12 AND vh.status<>3 AND vh.vch_date>=${day}::date AND vh.vch_date<${today}::date
        AND COALESCE(vi.cost_price,0)>0 AND (${all} OR vh.branch_id=ANY(${branches}::int[]))`,
    sql`
      SELECT COALESCE(SUM(vh.amount*COALESCE(NULLIF(vh.rate,0),1)),0) amount, COUNT(*) count
      FROM voucher_header_tbl vh
      WHERE vh.vch_type=4 AND vh.status<>3 AND vh.vch_date>=${day}::date AND vh.vch_date<${today}::date
        AND (${all} OR vh.branch_id=ANY(${branches}::int[]))`,
    optional(() => sql`
      SELECT p.name point_name, COALESCE(NULLIF(us.full_name,''),NULLIF(us.username,''),s.user_id::text) user_name,
             s.expected_cash expected, s.counted_cash counted, s.counted_cash-s.expected_cash difference
      FROM pos_sessions_tbl s JOIN pos_points_tbl p ON p.id=s.pos_point_id
      LEFT JOIN user_settings us ON us.user_id::text=s.user_id::text
      WHERE s.closed_at>=${day}::date AND s.closed_at<${today}::date AND s.counted_cash IS NOT NULL
        AND ABS(s.counted_cash-s.expected_cash)>=1 AND (${all} OR p.branch_id=ANY(${branches}::int[]))
      ORDER BY s.counted_cash-s.expected_cash LIMIT 20`, [] as any[]),
    // شيكات واردة بالمحفظة (مستحق/غير مستحق/مؤجل) تستحق خلال 7 أيام من اليوم
    sql`
      SELECT ch.cheq_num, ch.due_date::text due_date, ch.amount, COALESCE(c.currency_code,'') currency_code,
             ch.amount*COALESCE(NULLIF(ch.rate,0),1) base_amount, COALESCE(NULLIF(ch.cheq_owner_name,''),a.name,'') owner
      FROM cheques_tbl ch LEFT JOIN currency c ON c.id=ch.currency_id LEFT JOIN account_tbl a ON a.id=ch.customer_id
      LEFT JOIN voucher_header_tbl vh ON vh.id=ch.voucher_id
      WHERE ch.cheq_type=1 AND ch.status_id IN (1,2,3) AND ch.due_date>=${today}::date AND ch.due_date<(${today}::date+7)
        AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
      ORDER BY ch.due_date, ch.id LIMIT 100`,
    sql`
      SELECT ch.cheq_num, ch.amount, COALESCE(c.currency_code,'') currency_code, COALESCE(NULLIF(ch.cheq_owner_name,''),a.name,'') owner
      FROM cheques_tbl ch LEFT JOIN currency c ON c.id=ch.currency_id LEFT JOIN account_tbl a ON a.id=ch.customer_id
      LEFT JOIN voucher_header_tbl vh ON vh.id=ch.voucher_id
      WHERE ch.cheq_type=1 AND ch.status_id=5
        AND COALESCE(ch.return_date, ch.last_update_date)>=${day}::date AND COALESCE(ch.return_date, ch.last_update_date)<${today}::date
        AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
      ORDER BY ch.id LIMIT 20`,
    sql`
      WITH bal AS (
        SELECT vjd.account_id, SUM(CASE WHEN vjd.credit_debit=1 THEN 1 ELSE -1 END * COALESCE(vjd.base_curr_amount, vjd.amount*COALESCE(NULLIF(vjd.rate,0),1))) balance
        FROM voucher_journal_detail_tbl vjd
        JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id AND vh.status<>3
        JOIN account_tbl a ON a.id=vjd.account_id AND a.type IN (2,3,5) AND COALESCE(a.status,1)<>3
        WHERE vh.vch_date<${today}::date AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
        GROUP BY vjd.account_id
      )
      SELECT COALESCE(SUM(bal.balance) FILTER (WHERE bal.balance>0.5),0) total,
             COUNT(*) FILTER (WHERE bal.balance>0.5) customers,
             COUNT(*) FILTER (WHERE COALESCE(a.max_balance_amount,0)>0 AND bal.balance>a.max_balance_amount) over_limit
      FROM bal JOIN account_tbl a ON a.id=bal.account_id`,
    sql`
      WITH bal AS (
        SELECT vjd.account_id, SUM(CASE WHEN vjd.credit_debit=1 THEN 1 ELSE -1 END * COALESCE(vjd.base_curr_amount, vjd.amount*COALESCE(NULLIF(vjd.rate,0),1))) balance
        FROM voucher_journal_detail_tbl vjd
        JOIN voucher_header_tbl vh ON vh.id=vjd.voucher_id AND vh.status<>3
        JOIN account_tbl a ON a.id=vjd.account_id AND a.type IN (2,3,5) AND COALESCE(a.status,1)<>3
        WHERE vh.vch_date<${today}::date AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
        GROUP BY vjd.account_id
      )
      SELECT a.id, a.code, a.name, bal.balance, COALESCE(a.max_balance_amount,0) credit_limit
      FROM bal JOIN account_tbl a ON a.id=bal.account_id WHERE bal.balance>0.5
      ORDER BY bal.balance DESC LIMIT 5`,
    // أصناف ستنفد خلال أقل من 7 أيام بمعدل بيع آخر 30 يوماً (الرصيد على مستوى الشركة)
    sql`
      WITH sold AS (
        SELECT vi.item_id product_id, SUM(COALESCE(NULLIF(vi.main_unit_quantity,0), vi.qnty)) qty
        FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
        WHERE vh.vch_type=12 AND vh.status<>3 AND vh.vch_date>=(${today}::date-30) AND vh.vch_date<${today}::date
          AND vi.item_id IS NOT NULL AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
        GROUP BY vi.item_id HAVING SUM(COALESCE(NULLIF(vi.main_unit_quantity,0), vi.qnty))>0
      ), stock AS (
        SELECT it.product_id, SUM(CASE WHEN it.transaction_type='in' THEN it.quantity ELSE -it.quantity END) qty
        FROM inventory_transactions it WHERE it.product_id IN (SELECT product_id FROM sold) GROUP BY it.product_id
      ), risk AS (
        SELECT p.id, p.product_code code, p.product_name name, GREATEST(COALESCE(stock.qty,0),0) stock, sold.qty/30.0 daily,
               GREATEST(COALESCE(stock.qty,0),0)/(sold.qty/30.0) days_left
        FROM sold JOIN products p ON p.id=sold.product_id LEFT JOIN stock ON stock.product_id=sold.product_id
        WHERE COALESCE(p.deleted,false)=false AND GREATEST(COALESCE(stock.qty,0),0)/(sold.qty/30.0)<7
      )
      SELECT risk.*, COUNT(*) OVER () at_risk FROM risk ORDER BY days_left, daily DESC LIMIT 10`,
    // أصناف راكدة: رصيد موجب ولا مبيعات منذ 60 يوماً
    sql`
      WITH stock AS (
        SELECT it.product_id FROM inventory_transactions it GROUP BY it.product_id
        HAVING SUM(CASE WHEN it.transaction_type='in' THEN it.quantity ELSE -it.quantity END)>0
      )
      SELECT COUNT(*) items FROM stock
      WHERE NOT EXISTS (
        SELECT 1 FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id=vi.voucher_id
        WHERE vi.item_id=stock.product_id AND vh.vch_type=12 AND vh.status<>3 AND vh.vch_date>=(${today}::date-60)
      )`,
    sql`
      SELECT vh.vch_type, vh.vch_code, vh.amount*COALESCE(NULLIF(vh.rate,0),1) amount
      FROM voucher_header_tbl vh
      WHERE vh.status=3 AND vh.vch_type IN (4,5,12,16) AND vh.last_update_date>=${day}::date AND vh.last_update_date<${today}::date
        AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
      ORDER BY vh.last_update_date DESC LIMIT 20`,
    // فواتير بخصم 20% فأكثر (أعلى خصم صنف أو خصم الفاتورة)
    sql`
      SELECT x.vch_code, x.amount, round(x.discount_percent::numeric, 1) discount_percent FROM (
        SELECT vh.vch_code, vh.amount*COALESCE(NULLIF(vh.rate,0),1) amount,
          GREATEST(
            COALESCE((SELECT MAX(COALESCE(vi.discount,0)) FROM voucher_items_tbl vi WHERE vi.voucher_id=vh.id),0),
            CASE WHEN vh.discount_type='amount' AND vh.amount+COALESCE(vh.discount_value,0)>0 THEN COALESCE(vh.discount_value,0)*100/(vh.amount+COALESCE(vh.discount_value,0))
                 WHEN vh.discount_type='percentage' THEN COALESCE(vh.discount_value,0) ELSE 0 END
          ) discount_percent
        FROM voucher_header_tbl vh
        WHERE vh.vch_type=12 AND vh.status<>3 AND vh.vch_date>=${day}::date AND vh.vch_date<${today}::date
          AND (${all} OR vh.branch_id=ANY(${branches}::int[]))
      ) x WHERE x.discount_percent>=20 ORDER BY x.discount_percent DESC LIMIT 10`,
    optional(() => sql`
      SELECT COUNT(*) count, COALESCE(SUM(deposit_amount),0) deposits FROM sales_order_drafts
      WHERE COALESCE(deposit_amount,0)>0 AND confirmed_order_id IS NULL
        AND COALESCE(status,'') NOT IN ('confirmed','cancelled','canceled','rejected','converted')
        AND created_at<(${today}::date-7) AND (${all} OR branch_id=ANY(${branches}::int[]))`, [{ count: 0, deposits: 0 }] as any[]),
    optional(() => sql`SELECT COUNT(*) count, COALESCE(SUM(amount*COALESCE(NULLIF(rate,0),1)),0) amount FROM customer_portal_payments_tbl WHERE status='pending'`, [{ count: 0, amount: 0 }] as any[]),
  ])

  const mapSales = (row: any): BriefingSales => ({ day: String(row.day), branch_id: row.branch_id === null ? null : Number(row.branch_id), branch_name: String(row.branch_name), sales: round(num(row.sales)), returns: round(num(row.returns)), invoices: num(row.invoices) })
  const current = salesRows.filter((row: any) => String(row.day) === day).map(mapSales)
  const lastWeek = salesRows.filter((row: any) => String(row.day) === weekAgo).map(mapSales)
  const sum = (rows: BriefingSales[], key: "sales" | "returns" | "invoices") => rows.reduce((total, row) => total + row[key], 0)
  const net = sum(current, "sales") - sum(current, "returns")
  const lastWeekNet = sum(lastWeek, "sales") - sum(lastWeek, "returns")
  const revenue = num(marginRows[0]?.revenue), cost = num(marginRows[0]?.cost)
  const currency = currencyRows[0] || { id: 1, currency_code: "", currency_name: "" }

  return {
    day,
    today,
    currency: { id: Number(currency.id), code: String(currency.currency_code || ""), name: String(currency.currency_name || "") },
    branches: branchRows.map((row: any) => ({ id: Number(row.id), name: String(row.branch_name || "") })),
    sales: { current, lastWeek },
    totals: {
      sales: round(sum(current, "sales")), returns: round(sum(current, "returns")), net: round(net), invoices: sum(current, "invoices"),
      lastWeekNet: round(lastWeekNet), changePercent: lastWeekNet > 0 ? round(((net - lastWeekNet) / lastWeekNet) * 100) : null,
      receipts: round(num(receiptRows[0]?.amount)), receiptCount: num(receiptRows[0]?.count),
      marginPercent: revenue > 0 ? round(((revenue - cost) / revenue) * 100) : null,
    },
    cashier: cashier.map((row: any) => ({ point_name: String(row.point_name || ""), user_name: String(row.user_name || ""), expected: round(num(row.expected)), counted: round(num(row.counted)), difference: round(num(row.difference)) })),
    cheques: {
      dueCount: dueCheques.length,
      dueAmount: round(dueCheques.reduce((total: number, row: any) => total + num(row.base_amount), 0)),
      items: dueCheques.slice(0, 8).map((row: any) => ({ cheq_num: String(row.cheq_num || ""), due_date: String(row.due_date || ""), amount: round(num(row.amount)), currency_code: String(row.currency_code || ""), base_amount: round(num(row.base_amount)), owner: String(row.owner || "") })),
      returned: returnedCheques.map((row: any) => ({ cheq_num: String(row.cheq_num || ""), amount: round(num(row.amount)), currency_code: String(row.currency_code || ""), owner: String(row.owner || "") })),
    },
    receivables: {
      total: round(num(receivableRows[0]?.total)), customers: num(receivableRows[0]?.customers), overLimit: num(receivableRows[0]?.over_limit),
      top: receivableTop.map((row: any) => ({ id: Number(row.id), code: String(row.code || ""), name: String(row.name || ""), balance: round(num(row.balance)), limit: round(num(row.credit_limit)) })),
    },
    stock: {
      atRisk: num(stockRows[0]?.at_risk),
      items: stockRows.map((row: any) => ({ id: Number(row.id), code: String(row.code || ""), name: String(row.name || ""), stock: round(num(row.stock)), daily: round(num(row.daily)), days_left: Math.round(num(row.days_left) * 10) / 10 })),
      deadItems: num(deadRows[0]?.items),
    },
    watch: {
      cancelled: cancelled.map((row: any) => ({ vch_type: Number(row.vch_type), vch_code: String(row.vch_code || ""), amount: round(num(row.amount)) })),
      discounts: discounts.map((row: any) => ({ vch_code: String(row.vch_code || ""), amount: round(num(row.amount)), discount_percent: num(row.discount_percent) })),
      drafts: { count: num(drafts[0]?.count), deposits: round(num(drafts[0]?.deposits)) },
      portalPayments: { count: num(portal[0]?.count), amount: round(num(portal[0]?.amount)) },
    },
  }
}

/** نص مختصر للأرقام يُرسل للنموذج — بلا أسماء حسابات حساسة إضافية عمّا يظهر في الشاشة */
export function briefingPromptData(briefing: MorningBriefing) {
  return {
    اليوم: briefing.day,
    العملة: briefing.currency.code,
    المبيعات: briefing.totals.sales, المردودات: briefing.totals.returns, الصافي: briefing.totals.net, عدد_الفواتير: briefing.totals.invoices,
    صافي_نفس_اليوم_الأسبوع_الماضي: briefing.totals.lastWeekNet, نسبة_التغير: briefing.totals.changePercent,
    هامش_تقريبي: briefing.totals.marginPercent, المقبوضات: briefing.totals.receipts,
    الفروع: briefing.sales.current.map((row) => ({ الفرع: row.branch_name, الصافي: round(row.sales - row.returns), الأسبوع_الماضي: round((briefing.sales.lastWeek.find((last) => last.branch_id === row.branch_id)?.sales || 0) - (briefing.sales.lastWeek.find((last) => last.branch_id === row.branch_id)?.returns || 0)) })),
    فروقات_الصناديق: briefing.cashier.map((row) => ({ النقطة: row.point_name, الكاشير: row.user_name, الفرق: row.difference })),
    شيكات_تستحق_خلال_أسبوع: { العدد: briefing.cheques.dueCount, المبلغ: briefing.cheques.dueAmount }, شيكات_راجعة_أمس: briefing.cheques.returned.length,
    الذمم: { الإجمالي: briefing.receivables.total, عملاء_تجاوزوا_السقف: briefing.receivables.overLimit, الأعلى: briefing.receivables.top.map((row) => ({ العميل: row.name, الرصيد: row.balance })) },
    أصناف_ستنفد: briefing.stock.items.map((row) => ({ الصنف: row.name, أيام_متبقية: row.days_left })), عدد_الأصناف_المهددة: briefing.stock.atRisk, أصناف_راكدة: briefing.stock.deadItems,
    سندات_ملغاة_أمس: briefing.watch.cancelled.length, فواتير_بخصم_كبير: briefing.watch.discounts.length,
    مسودات_بعربون_غير_محولة: briefing.watch.drafts, دفعات_بوابة_العملاء_بانتظار_الموافقة: briefing.watch.portalPayments.count,
  }
}
