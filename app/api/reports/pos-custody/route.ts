import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { reportAccessDenied } from "@/lib/report-permissions"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables } from "@/app/api/pos/_lib"

// تقرير عهد البيع بالتجزئة: كل وردية (عهدة) في الفترة — النقطة والكاشير والأوقات والحالة، النقد (افتتاحي/متوقع/مسلَّم/فرق)،
// الاستلام من/التسليم إلى، المبيعات والدفعات حسب الطريقة، الإيداع/السحب، وعهدة الدخان (كميات) لكل صنف.
const ids = (value: string | null) => [...new Set(String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0))]
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const STATUSES = ["open", "handover_pending", "handed_over", "closed"]

export async function GET(request: NextRequest) {
  try {
    const denied = await reportAccessDenied(request, ["pos-custody-report"])
    if (denied) return denied
    await ensureSalesTables(); await ensurePosTables()
    const params = request.nextUrl.searchParams

    if (params.get("meta") === "1") {
      const [points, users] = await Promise.all([
        sql`SELECT id, code, name FROM pos_points_tbl WHERE COALESCE(status, 1) <> 3 ORDER BY code, name`,
        sql`SELECT DISTINCT s.user_id AS id, COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), s.user_id::text) AS name
            FROM pos_sessions_tbl s LEFT JOIN user_settings us ON us.user_id = s.user_id ORDER BY 2`,
      ])
      return NextResponse.json({ points, users })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = isoDate(params.get("from_date"), `${today.slice(0, 7)}-01`)
    const to = isoDate(params.get("to_date"), today)
    const pointIds = ids(params.get("point_ids"))
    const userIds = ids(params.get("user_ids"))
    const statuses = String(params.get("statuses") || "").split(",").filter((status) => STATUSES.includes(status))

    const rows = await sql`
      SELECT s.id, s.shift_guid::text AS shift_guid, s.status, s.opened_at, s.closed_at,
        p.code AS point_code, p.name AS point_name, c.currency_code,
        COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), s.user_id::text) AS user_name,
        COALESCE(s.opening_cash, 0) AS opening_cash, COALESCE(s.expected_cash, 0) AS expected_cash,
        s.counted_cash, s.handover_amount,
        CASE WHEN s.counted_cash IS NOT NULL THEN s.counted_cash - COALESCE(s.expected_cash, 0) END AS cash_difference,
        s.received_from_session_id, rf_user.name AS received_from_user,
        COALESCE(NULLIF(ht.full_name, ''), NULLIF(ht.username, ''), s.handover_to_user_id::text) AS handover_to_user,
        COALESCE(s.tobacco_opened, false) AS tobacco_opened, COALESCE(s.tobacco_handed_over, false) AS tobacco_handed_over,
        sales.invoices, sales.returns, sales.net_sales,
        mov.cash_in, mov.cash_out,
        COALESCE(pay.payments, '[]'::json) AS payments,
        COALESCE(tob.lines, '[]'::json) AS tobacco
      FROM pos_sessions_tbl s
      JOIN pos_points_tbl p ON p.id = s.pos_point_id
      LEFT JOIN currency c ON c.id = p.currency_id
      LEFT JOIN user_settings us ON us.user_id = s.user_id
      LEFT JOIN user_settings ht ON ht.user_id = s.handover_to_user_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(u2.full_name, ''), NULLIF(u2.username, ''), src.user_id::text) AS name
        FROM pos_sessions_tbl src LEFT JOIN user_settings u2 ON u2.user_id = src.user_id WHERE src.id = s.received_from_session_id
      ) rf_user ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE vh.vch_type = 12)::int AS invoices, COUNT(*) FILTER (WHERE vh.vch_type = 16)::int AS returns,
          COALESCE(SUM(CASE WHEN vh.vch_type = 16 THEN -COALESCE(vh.amount, 0) WHEN vh.vch_type = 12 THEN COALESCE(vh.amount, 0) ELSE 0 END), 0) AS net_sales
        FROM voucher_header_tbl vh WHERE vh.pos_session_id = s.id AND vh.status <> 3
      ) sales ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount) FILTER (WHERE movement_type = 'cash_in'), 0) AS cash_in,
          COALESCE(SUM(amount) FILTER (WHERE movement_type = 'cash_out'), 0) AS cash_out
        FROM pos_cash_movements_tbl WHERE session_id = s.id
      ) mov ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('method', x.payment_method, 'amount', x.amount, 'count', x.count) ORDER BY x.payment_method) AS payments
        FROM (
          SELECT sp.payment_method, SUM(CASE WHEN v.vch_type = 16 THEN -sp.amount ELSE sp.amount END) AS amount, COUNT(*)::int AS count
          FROM pos_sale_payments_tbl sp JOIN voucher_header_tbl v ON v.id = sp.voucher_id
          WHERE sp.session_id = s.id AND v.status <> 3 GROUP BY sp.payment_method
        ) x
      ) pay ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'product_code', pr.product_code, 'product_name', pr.product_name,
          'opening', t.opening_qty, 'sold', t.sold_qty, 'expected', t.expected_qty, 'counted', t.counted_qty,
          'difference', CASE WHEN t.counted_qty IS NOT NULL THEN t.counted_qty - COALESCE(t.expected_qty, 0) END
        ) ORDER BY pr.product_code) AS lines
        FROM pos_tobacco_custody_tbl t LEFT JOIN products pr ON pr.id = t.product_id WHERE t.session_id = s.id
      ) tob ON TRUE
      WHERE s.opened_at::date BETWEEN ${from}::date AND ${to}::date
        AND (${pointIds.length} = 0 OR s.pos_point_id = ANY(${pointIds}::int[]))
        AND (${userIds.length} = 0 OR s.user_id = ANY(${userIds}::int[]))
        AND (${statuses.length} = 0 OR s.status = ANY(${statuses}::text[]))
      ORDER BY s.opened_at DESC, s.id DESC
      LIMIT 2000
    `
    return NextResponse.json({ rows, from, to })
  } catch (error) {
    console.error("[reports/pos-custody] failed", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير العهد" }, { status: 500 })
  }
}
