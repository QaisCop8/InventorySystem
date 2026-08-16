import { NextResponse } from "next/server"
import sql, { getTenantPool } from "@/lib/database"
import { ensureTables as ensureReceiptTables, RECEIPT_VCH_TYPE, PAYMENT_VCH_TYPE } from "@/app/api/receipts/_lib"

const SALES_VCH_TYPE = 5

// إيراد وتكلفة البضاعة المباعة شهرياً (آخر 3 أشهر، لضمان وجود شهرين فيهما مبيعات فعلياً للمقارنة)
// لحساب هامش الربح الإجمالي — التكلفة مبنية على last_purchase_price المخزّن على المنتج حالياً
// (لا يوجد عمود تكلفة مخصَّص في جدول products الفعلي؛ هذا تقدير، وليس تكلفة تاريخية دقيقة وقت البيع).
async function getMarginByMonth() {
  const pool = await getTenantPool()
  const tables = await pool.query(`
    SELECT to_regclass('public.vouchers') AS vouchers,
           to_regclass('public.voucher_items') AS voucher_items
  `)
  const hasLegacyVoucherTables = Boolean(tables.rows[0]?.vouchers && tables.rows[0]?.voucher_items)

  const result = hasLegacyVoucherTables ? await pool.query(`
    WITH sales AS (
      SELECT id, voucher_date, total_amount
      FROM vouchers
      WHERE vch_type = $1 AND deleted = false
        AND voucher_date >= (CURRENT_DATE - INTERVAL '3 months')
    ),
    cogs AS (
      SELECT vi.voucher_id, SUM(vi.quantity * COALESCE(p.last_purchase_price, 0)) AS cogs
      FROM voucher_items vi
      JOIN sales s ON s.id = vi.voucher_id
      LEFT JOIN products p ON p.id = vi.product_id
      GROUP BY vi.voucher_id
    )
    SELECT
      to_char(s.voucher_date, 'YYYY-MM') AS month_key,
      SUM(s.total_amount) AS revenue,
      SUM(COALESCE(c.cogs, 0)) AS cogs
    FROM sales s
    LEFT JOIN cogs c ON c.voucher_id = s.id
    GROUP BY 1
    ORDER BY 1
  `, [SALES_VCH_TYPE]) : await pool.query(`
    WITH order_costs AS (
      SELECT
        o.id,
        o.order_date,
        o.total_amount,
        SUM(COALESCE(oi.quantity, 0) * COALESCE(p.last_purchase_price, 0)) AS cogs
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE COALESCE(o.deleted, false) = false
        AND o.order_date >= (CURRENT_DATE - INTERVAL '3 months')
      GROUP BY o.id, o.order_date, o.total_amount
    )
    SELECT
      to_char(order_date, 'YYYY-MM') AS month_key,
      SUM(total_amount) AS revenue,
      SUM(cogs) AS cogs
    FROM order_costs
    GROUP BY 1
    ORDER BY 1
  `)

  return result.rows.map((row) => ({
    monthKey: row.month_key as string,
    revenue: Number(row.revenue) || 0,
    cogs: Number(row.cogs) || 0,
  }))
}

// رصيد نقدي تقديري = صافي تدفق سندات القبض/الصرف تاريخياً (لا يوجد رصيد فعلي محفوظ للحسابات حالياً)،
// ومعدل الاستهلاك اليومي = إجمالي سندات الصرف خلال آخر 30 يوماً / 30.
async function getCashPosition() {
  await ensureReceiptTables()

  const totalsRows = await sql`
    SELECT vch_type, COALESCE(SUM(amount), 0) AS total
    FROM voucher_header_tbl
    WHERE status != 3 AND vch_type IN (${RECEIPT_VCH_TYPE}, ${PAYMENT_VCH_TYPE})
    GROUP BY vch_type
  `

  let cashIn = 0
  let cashOut = 0
  for (const row of totalsRows as any[]) {
    if (Number(row.vch_type) === RECEIPT_VCH_TYPE) cashIn = Number(row.total) || 0
    if (Number(row.vch_type) === PAYMENT_VCH_TYPE) cashOut = Number(row.total) || 0
  }

  const burnRows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM voucher_header_tbl
    WHERE status != 3 AND vch_type = ${PAYMENT_VCH_TYPE}
      AND vch_date >= (CURRENT_DATE - INTERVAL '30 days')
  `
  const burn30 = Number((burnRows as any[])[0]?.total) || 0

  return { cashBalance: cashIn - cashOut, dailyBurn: burn30 / 30 }
}

export async function GET() {
  const [months, cashPosition] = await Promise.all([
    getMarginByMonth().catch((error) => {
      console.error("[dashboard/insights] margin query failed:", error)
      return []
    }),
    getCashPosition().catch((error) => {
      console.error("[dashboard/insights] cash query failed:", error)
      return { cashBalance: 0, dailyBurn: 0 }
    }),
  ])

  return NextResponse.json({ months, ...cashPosition })
}
