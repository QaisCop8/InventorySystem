import sql from "@/lib/database"

// Home dashboard: real figures from voucher_header_tbl / voucher_items_tbl, in base currency
// (amount × rate), excluding deleted vouchers (status 3). Sales = فاتورة مبيعات (12) net of
// مرتجع مبيعات (16); purchases = فاتورة مشتريات (17) net of مرتجع مشتريات (19); cash in = سند قبض (4);
// cash out = سند صرف (5) + سند صرف شيكات (21).
const SALES = 12, SALES_RETURN = 16, PURCHASE = 17, PURCHASE_RETURN = 19, RECEIPT = 4, PAYMENT = 5, CHEQUE_PAYMENT = 21

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export async function loadOverview(branchIds: number[], all: boolean, canSwitch: boolean) {
    const [currency, kpiRows, daily, monthly, topProducts, topCustomers, byBranch, hours, recent, pending] = await Promise.all([
      sql`SELECT id, currency_code AS code, currency_name AS name FROM currency ORDER BY id LIMIT 1`,
      sql`
        WITH v AS (
          SELECT vch_type, vch_date::date AS d, amount * COALESCE(NULLIF(rate, 0), 1) AS amt
          FROM voucher_header_tbl
          WHERE COALESCE(status, 1) <> 3 AND branch_id = ANY(${branchIds}::int[])
            AND vch_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
        ),
        bounds AS (
          SELECT date_trunc('month', CURRENT_DATE)::date AS month_start,
                 (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date AS prev_start,
                 -- same number of elapsed days in the previous month, for a fair comparison
                 LEAST((date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date,
                       ((date_trunc('month', CURRENT_DATE) - INTERVAL '1 month') + (CURRENT_DATE - date_trunc('month', CURRENT_DATE)::date) * INTERVAL '1 day')::date) AS prev_end
        )
        SELECT
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES} AND d = CURRENT_DATE), 0) AS sales_today,
          COUNT(*) FILTER (WHERE vch_type = ${SALES} AND d = CURRENT_DATE) AS invoices_today,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES} AND d = CURRENT_DATE - 1), 0) AS sales_yesterday,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES} AND d >= b.month_start), 0) AS sales_month,
          COUNT(*) FILTER (WHERE vch_type = ${SALES} AND d >= b.month_start) AS invoices_month,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES_RETURN} AND d >= b.month_start), 0) AS returns_month,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES} AND d BETWEEN b.prev_start AND b.prev_end), 0) AS sales_prev,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${SALES_RETURN} AND d BETWEEN b.prev_start AND b.prev_end), 0) AS returns_prev,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${PURCHASE} AND d >= b.month_start), 0) - COALESCE(SUM(amt) FILTER (WHERE vch_type = ${PURCHASE_RETURN} AND d >= b.month_start), 0) AS purchases_month,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${PURCHASE} AND d BETWEEN b.prev_start AND b.prev_end), 0) - COALESCE(SUM(amt) FILTER (WHERE vch_type = ${PURCHASE_RETURN} AND d BETWEEN b.prev_start AND b.prev_end), 0) AS purchases_prev,
          COALESCE(SUM(amt) FILTER (WHERE vch_type = ${RECEIPT} AND d >= b.month_start), 0) AS receipts_month,
          COALESCE(SUM(amt) FILTER (WHERE vch_type IN (${PAYMENT}, ${CHEQUE_PAYMENT}) AND d >= b.month_start), 0) AS payments_month
        FROM v CROSS JOIN bounds b
      `,
      sql`
        WITH days AS (SELECT generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day')::date AS d)
        SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${SALES}), 0)
            - COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${SALES_RETURN}), 0) AS sales,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${PURCHASE}), 0)
            - COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${PURCHASE_RETURN}), 0) AS purchases,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${RECEIPT}), 0) AS receipts,
          COUNT(vh.id) FILTER (WHERE vh.vch_type = ${SALES}) AS invoices
        FROM days
        LEFT JOIN voucher_header_tbl vh ON vh.vch_date::date = days.d AND COALESCE(vh.status, 1) <> 3 AND vh.branch_id = ANY(${branchIds}::int[])
          AND vh.vch_type IN (${SALES}, ${SALES_RETURN}, ${PURCHASE}, ${PURCHASE_RETURN}, ${RECEIPT})
        GROUP BY days.d ORDER BY days.d
      `,
      sql`
        WITH months AS (SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month')::date AS m)
        SELECT to_char(months.m, 'YYYY-MM') AS month,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${SALES}), 0)
            - COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${SALES_RETURN}), 0) AS sales,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${PURCHASE}), 0)
            - COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${PURCHASE_RETURN}), 0) AS purchases,
          COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) FILTER (WHERE vh.vch_type = ${RECEIPT}), 0) AS receipts
        FROM months
        LEFT JOIN voucher_header_tbl vh ON date_trunc('month', vh.vch_date)::date = months.m AND COALESCE(vh.status, 1) <> 3
          AND vh.branch_id = ANY(${branchIds}::int[]) AND vh.vch_type IN (${SALES}, ${SALES_RETURN}, ${PURCHASE}, ${PURCHASE_RETURN}, ${RECEIPT})
        GROUP BY months.m ORDER BY months.m
      `,
      sql`
        SELECT COALESCE(p.product_name, MAX(vi.item_name), 'صنف') AS name, p.product_code AS code,
          SUM(COALESCE(vi.qnty, 0)) AS quantity,
          SUM(COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0) * (1 - COALESCE(vi.discount, 0) / 100) * COALESCE(NULLIF(vh.rate, 0), 1)) AS revenue
        FROM voucher_items_tbl vi
        JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
        LEFT JOIN products p ON p.id = vi.item_id
        WHERE vh.vch_type = ${SALES} AND COALESCE(vh.status, 1) <> 3 AND vh.branch_id = ANY(${branchIds}::int[])
          AND vh.vch_date >= date_trunc('month', CURRENT_DATE)
        GROUP BY vi.item_id, p.product_name, p.product_code
        ORDER BY revenue DESC LIMIT 6
      `,
      sql`
        SELECT COALESCE(a.name, NULLIF(TRIM(vh.customer_name), ''), 'عميل نقدي') AS name, a.code,
          COUNT(*) AS invoices, SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)) AS revenue
        FROM voucher_header_tbl vh
        LEFT JOIN account_tbl a ON a.id = vh.account_id
        WHERE vh.vch_type = ${SALES} AND COALESCE(vh.status, 1) <> 3 AND vh.branch_id = ANY(${branchIds}::int[])
          AND vh.vch_date >= date_trunc('month', CURRENT_DATE)
        GROUP BY 1, 2 ORDER BY revenue DESC LIMIT 6
      `,
      sql`
        SELECT b.branch_name AS name, COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)), 0) AS sales, COUNT(vh.id) AS invoices
        FROM branches b
        LEFT JOIN voucher_header_tbl vh ON vh.branch_id = b.id AND vh.vch_type = ${SALES} AND COALESCE(vh.status, 1) <> 3
          AND vh.vch_date >= date_trunc('month', CURRENT_DATE)
        WHERE b.id = ANY(${branchIds}::int[])
        GROUP BY b.id, b.branch_name ORDER BY sales DESC
      `,
      // Only vouchers carrying a real time (date-only vouchers are stored at 00:00:00).
      sql`
        SELECT EXTRACT(HOUR FROM vch_date)::int AS hour, COUNT(*) AS invoices, SUM(amount * COALESCE(NULLIF(rate, 0), 1)) AS sales
        FROM voucher_header_tbl
        WHERE vch_type = ${SALES} AND COALESCE(status, 1) <> 3 AND branch_id = ANY(${branchIds}::int[])
          AND vch_date >= CURRENT_DATE - 29 AND vch_date::time <> '00:00:00'
        GROUP BY 1 ORDER BY 1
      `,
      sql`
        SELECT vh.id, vh.vch_type, vt.name AS type_name, vh.vch_code AS code, vh.vch_date AS date, vh.status,
          vh.amount * COALESCE(NULLIF(vh.rate, 0), 1) AS amount,
          COALESCE(a.name, NULLIF(TRIM(vh.customer_name), '')) AS party
        FROM voucher_header_tbl vh
        LEFT JOIN voucher_types_tbl vt ON vt.id = vh.vch_type
        LEFT JOIN account_tbl a ON a.id = vh.account_id
        WHERE COALESCE(vh.status, 1) <> 3 AND vh.branch_id = ANY(${branchIds}::int[])
        ORDER BY COALESCE(vh.insert_date, vh.vch_date) DESC, vh.id DESC LIMIT 9
      `,
      sql`
        SELECT vh.vch_type, vt.name AS type_name, COUNT(*) AS count, COALESCE(SUM(vh.amount * COALESCE(NULLIF(vh.rate, 0), 1)), 0) AS amount
        FROM voucher_header_tbl vh LEFT JOIN voucher_types_tbl vt ON vt.id = vh.vch_type
        WHERE vh.status = 1 AND vh.branch_id = ANY(${branchIds}::int[])
        GROUP BY vh.vch_type, vt.name ORDER BY count DESC
      `,
    ])

    const k = kpiRows[0] ?? {}
    const branches = await sql`SELECT id, branch_name AS name FROM branches WHERE id = ANY(${branchIds}::int[]) ORDER BY id`
    const mapNumbers = (rows: any[], keys: string[]) => rows.map(row => ({ ...row, ...Object.fromEntries(keys.map(key => [key, round2(num(row[key]))])) }))

    return {
      generatedAt: new Date().toISOString(),
      scope: { all, branches, canSwitch },
      currency: currency[0] ?? null,
      kpis: {
        salesToday: round2(num(k.sales_today)),
        invoicesToday: num(k.invoices_today),
        salesYesterday: round2(num(k.sales_yesterday)),
        salesMonth: round2(num(k.sales_month) - num(k.returns_month)),
        grossSalesMonth: round2(num(k.sales_month)),
        returnsMonth: round2(num(k.returns_month)),
        salesPrevPeriod: round2(num(k.sales_prev) - num(k.returns_prev)),
        invoicesMonth: num(k.invoices_month),
        purchasesMonth: round2(num(k.purchases_month)),
        purchasesPrevPeriod: round2(num(k.purchases_prev)),
        receiptsMonth: round2(num(k.receipts_month)),
        paymentsMonth: round2(num(k.payments_month)),
      },
      daily: mapNumbers(daily, ["sales", "purchases", "receipts", "invoices"]),
      monthly: mapNumbers(monthly, ["sales", "purchases", "receipts"]),
      topProducts: mapNumbers(topProducts, ["quantity", "revenue"]),
      topCustomers: mapNumbers(topCustomers, ["invoices", "revenue"]),
      byBranch: mapNumbers(byBranch, ["sales", "invoices"]),
      hours: mapNumbers(hours, ["invoices", "sales"]),
      recent: mapNumbers(recent, ["amount"]),
      pending: mapNumbers(pending, ["count", "amount"]),
    }
}
