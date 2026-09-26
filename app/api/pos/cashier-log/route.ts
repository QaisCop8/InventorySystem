import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, requestBranchId, requestUserId } from "../_lib"

const ACTIONS = [
  "استلام عهدة",
  "تسليم عهدة",
  "حفظ فاتورة",
  "تعديل فاتورة",
  "حذف فاتورة",
  "حذف صنف من فاتورة",
  "جديد بدون تخزين",
  "اضافة خصم",
  "اضافة خصم صنف",
] as const
const INVOICE_MOVEMENTS = ["مبيعات", "مردودات", "هدايا"] as const
const PAYMENT_METHODS = ["نقدي", "شيكات", "بطاقات", "ذمم"] as const

const ids = (value: string | null) => String(value || "").split(",").map(Number).filter(id => Number.isInteger(id) && id > 0)

export async function POST(request: NextRequest) {
  try {
    await ensureSalesTables()
    await ensurePosTables()
    const userId = requestUserId(request)
    const data = await request.json()
    const pointId = Number(data.pos_point_id || 0)
    const sessionId = Number(data.session_id || 0)
    const movementType = String(data.movement_type || "").trim()
    if (!userId || !pointId || !ACTIONS.includes(movementType as (typeof ACTIONS)[number]))
      return NextResponse.json({ error: "بيانات سجل الكاشير غير مكتملة" }, { status: 400 })
    await sql`
      INSERT INTO pos_cashier_log_tbl(pos_point_id,session_id,user_id,movement_type,transaction_no,notes)
      VALUES(${pointId},${sessionId > 0 ? sessionId : null},${Number(userId)},${movementType},${String(data.transaction_no || "") || null},${String(data.notes || "") || null})
    `
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تسجيل حركة الكاشير" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSalesTables()
    await ensurePosTables()
    const userId = requestUserId(request)
    if (!userId) return NextResponse.json({ error: "المستخدم غير معروف" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const from = String(params.get("from_date") || "1900-01-01")
    const to = String(params.get("to_date") || "2999-12-31")
    const pointIds = ids(params.get("point_ids"))
    const cashierIds = ids(params.get("cashier_ids"))
    const sessionIds = ids(params.get("session_ids"))
    const movementTypes = String(params.get("movement_types") || "").split(",").filter(Boolean)
    const paymentMethods = String(params.get("payment_methods") || "").split(",").filter(Boolean)
    const detail = params.get("detail") === "1"
    const invoiceReport = params.get("invoice_report") === "1"
    const branchId = requestBranchId(request)
    if (invoiceReport) {
      const movementCodes = movementTypes.map((value) => value === "مبيعات" ? 12 : value === "مردودات" ? 16 : 9).filter((value, index, values) => values.indexOf(value) === index)
      const paymentCodes = paymentMethods.map((value) => value === "نقدي" ? "cash" : value === "شيكات" ? "cheque" : value === "بطاقات" ? "card" : "account")
      const invoiceCodes = movementCodes.length ? movementCodes : [12, 16, 9]
      const rows = detail ? await sql`
          SELECT CONCAT(vh.id, '-', vi.id) row_id, vh.id, vh.vch_type, vh.vch_date occurred_at,
          CASE WHEN vh.vch_type=16 THEN 'مردودات' WHEN vh.vch_type=9 THEN 'هدايا' ELSE 'مبيعات' END movement_type,
          vh.vch_code transaction_no, vh.note notes, vi.item_name, vi.qnty quantity, vi.price,
          COALESCE(vi.discount, 0) discount_percent,
          ROUND((COALESCE(vi.qnty,0) * COALESCE(vi.price,0) * COALESCE(vi.discount,0) / 100)::numeric, 2) item_discount_amount,
          COALESCE(vi.campaign_discount, 0) campaign_discount,
          ROUND((COALESCE(vi.qnty,0) * COALESCE(vi.price,0) * (1 - COALESCE(vi.discount,0)/100))::numeric, 2) line_total,
          COALESCE(NULLIF(u.full_name,''), NULLIF(u.username,''), COALESCE(ps.user_id,vh.insert_user)::text) cashier_name,
          pp.name point_name,
          CONCAT_WS(' · ', COALESCE(NULLIF(u.full_name,''), NULLIF(u.username,''), ps.user_id::text), TO_CHAR(COALESCE(ps.opened_at, ps.closed_at), 'YYYY-MM-DD')) shift_name,
          COALESCE(string_agg(DISTINCT CASE p.payment_method WHEN 'cash' THEN 'نقدي' WHEN 'cheque' THEN 'شيكات' WHEN 'card' THEN 'بطاقات' WHEN 'account' THEN 'ذمم' ELSE p.payment_method END, '، '), 'غير محدد') payment_method
        FROM voucher_header_tbl vh
        LEFT JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id
        LEFT JOIN pos_sale_payments_tbl p ON p.voucher_id=vh.id
        LEFT JOIN pos_sessions_tbl ps ON ps.id=vh.pos_session_id
        LEFT JOIN pos_points_tbl pp ON pp.id=COALESCE(vh.pos_point_id, ps.pos_point_id)
        LEFT JOIN user_settings u ON u.user_id=COALESCE(ps.user_id,vh.insert_user)
        WHERE vh.vch_date >= ${from}::date
          AND vh.vch_date < (${to}::date + INTERVAL '1 day')
          AND COALESCE(vh.status, 1) <> 3
          AND vh.vch_type = ANY(${invoiceCodes}::int[])
          AND (${branchId || 0}=0 OR vh.branch_id=${branchId || 0})
          AND (${pointIds.length === 0} OR COALESCE(vh.pos_point_id, ps.pos_point_id)=ANY(${pointIds}::int[]))
          AND (${sessionIds.length === 0} OR vh.pos_session_id=ANY(${sessionIds}::bigint[]))
          AND (${cashierIds.length === 0} OR COALESCE(ps.user_id, vh.insert_user)=ANY(${cashierIds}::int[]))
          AND (${paymentCodes.length === 0} OR EXISTS (SELECT 1 FROM pos_sale_payments_tbl fp WHERE fp.voucher_id=vh.id AND fp.payment_method=ANY(${paymentCodes}::text[])))
        GROUP BY vh.id, vh.vch_date, vh.vch_type, vh.vch_code, vh.note, vi.id, vi.item_name, vi.qnty, vi.price, vi.discount, vi.campaign_discount, u.full_name, u.username, ps.user_id, ps.opened_at, ps.closed_at, vh.insert_user, pp.name
        ORDER BY vh.vch_date DESC, vh.id DESC, vi.id
      ` : await sql`
        SELECT vh.id, vh.vch_type, vh.vch_date occurred_at,
          CASE WHEN vh.vch_type=16 THEN 'مردودات' WHEN vh.vch_type=9 THEN 'هدايا' ELSE 'مبيعات' END movement_type,
          vh.vch_code transaction_no, vh.note notes, COUNT(vi.id)::int item_count,
          ROUND(COALESCE(SUM(CASE WHEN vh.vch_type=16 THEN -1 ELSE 1 END * COALESCE(vi.qnty,0) * COALESCE(vi.price,0) * (1 - COALESCE(vi.discount,0)/100)),0)::numeric, 2) total_amount,
          COALESCE(NULLIF(u.full_name,''), NULLIF(u.username,''), COALESCE(ps.user_id,vh.insert_user)::text) cashier_name,
          pp.name point_name,
          CONCAT_WS(' · ', COALESCE(NULLIF(u.full_name,''), NULLIF(u.username,''), ps.user_id::text), TO_CHAR(COALESCE(ps.opened_at, ps.closed_at), 'YYYY-MM-DD')) shift_name,
          COALESCE(string_agg(DISTINCT CASE p.payment_method WHEN 'cash' THEN 'نقدي' WHEN 'cheque' THEN 'شيكات' WHEN 'card' THEN 'بطاقات' WHEN 'account' THEN 'ذمم' ELSE p.payment_method END, '، '), 'غير محدد') payment_method
        FROM voucher_header_tbl vh
        LEFT JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id
        LEFT JOIN pos_sale_payments_tbl p ON p.voucher_id=vh.id
        LEFT JOIN pos_sessions_tbl ps ON ps.id=vh.pos_session_id
        LEFT JOIN pos_points_tbl pp ON pp.id=COALESCE(vh.pos_point_id, ps.pos_point_id)
        LEFT JOIN user_settings u ON u.user_id=COALESCE(ps.user_id,vh.insert_user)
        WHERE vh.vch_date >= ${from}::date
          AND vh.vch_date < (${to}::date + INTERVAL '1 day')
          AND COALESCE(vh.status, 1) <> 3
          AND vh.vch_type = ANY(${invoiceCodes}::int[])
          AND (${branchId || 0}=0 OR vh.branch_id=${branchId || 0})
          AND (${pointIds.length === 0} OR COALESCE(vh.pos_point_id, ps.pos_point_id)=ANY(${pointIds}::int[]))
          AND (${sessionIds.length === 0} OR vh.pos_session_id=ANY(${sessionIds}::bigint[]))
          AND (${cashierIds.length === 0} OR COALESCE(ps.user_id, vh.insert_user)=ANY(${cashierIds}::int[]))
          AND (${paymentCodes.length === 0} OR EXISTS (SELECT 1 FROM pos_sale_payments_tbl fp WHERE fp.voucher_id=vh.id AND fp.payment_method=ANY(${paymentCodes}::text[])))
        GROUP BY vh.id, vh.vch_date, vh.vch_type, vh.vch_code, vh.note, u.full_name, u.username, ps.user_id, ps.opened_at, ps.closed_at, vh.insert_user, pp.name
        ORDER BY vh.vch_date DESC, vh.id DESC
      `
      if (params.get("lookups") !== "1") return NextResponse.json({ rows })
      const [points, cashiers, shifts] = await Promise.all([
        sql`SELECT id,name,code FROM pos_points_tbl WHERE status=1 AND (${branchId || 0}=0 OR branch_id=${branchId || 0}) ORDER BY name`,
        sql`SELECT user_id id,user_id::text code,COALESCE(NULLIF(full_name,''),NULLIF(username,''),user_id::text) name FROM user_settings ORDER BY name`,
        sql`SELECT s.id, s.shift_guid::text code, CONCAT_WS(' · ',COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),s.user_id::text),p.name,TO_CHAR(COALESCE(s.opened_at,s.closed_at),'YYYY-MM-DD')) name FROM pos_sessions_tbl s JOIN pos_points_tbl p ON p.id=s.pos_point_id LEFT JOIN user_settings u ON u.user_id=s.user_id WHERE (${branchId || 0}=0 OR p.branch_id=${branchId || 0}) ORDER BY s.id DESC`,
      ])
      return NextResponse.json({ rows, points, cashiers, shifts, movementTypes: INVOICE_MOVEMENTS, paymentMethods: PAYMENT_METHODS })
    }
    const rows = detail ? await sql`
      SELECT CONCAT(l.id, '-', COALESCE(vi.id, 0)) row_id, l.id log_id, l.occurred_at, l.movement_type,
        l.transaction_no, l.notes, vi.item_name, vi.qnty quantity, vi.price,
        ROUND((COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0) * (1 - COALESCE(vi.discount, 0) / 100))::numeric, 2) line_total,
        COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),l.user_id::text) cashier_name,
        p.name point_name, CONCAT_WS(' · ', COALESCE(NULLIF(su.full_name,''),NULLIF(su.username,''),l.user_id::text), TO_CHAR(COALESCE(s.opened_at,s.closed_at),'YYYY-MM-DD')) shift_name
      FROM pos_cashier_log_tbl l
      LEFT JOIN voucher_header_tbl vh ON vh.vch_code=l.transaction_no
      LEFT JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id
      LEFT JOIN user_settings u ON u.user_id=l.user_id
      LEFT JOIN pos_points_tbl p ON p.id=l.pos_point_id
      LEFT JOIN pos_sessions_tbl s ON s.id=l.session_id
      LEFT JOIN user_settings su ON su.user_id=s.user_id
      WHERE l.occurred_at >= ${from}::date
        AND l.occurred_at < (${to}::date + INTERVAL '1 day')
        AND (${branchId || 0}=0 OR p.branch_id=${branchId || 0})
        AND (${pointIds.length === 0} OR l.pos_point_id=ANY(${pointIds}::int[]))
        AND (${cashierIds.length === 0} OR l.user_id=ANY(${cashierIds}::int[]))
        AND (${sessionIds.length === 0} OR l.session_id=ANY(${sessionIds}::bigint[]))
        AND (${movementTypes.length === 0} OR l.movement_type=ANY(${movementTypes}::text[]))
      ORDER BY l.occurred_at DESC, l.id DESC, vi.id
    ` : await sql`
      SELECT l.id, l.occurred_at, l.movement_type, l.transaction_no, l.notes,
        COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),l.user_id::text) cashier_name,
        p.name point_name, CONCAT_WS(' · ', COALESCE(NULLIF(su.full_name,''),NULLIF(su.username,''),l.user_id::text), TO_CHAR(COALESCE(s.opened_at,s.closed_at),'YYYY-MM-DD')) shift_name
      FROM pos_cashier_log_tbl l
      LEFT JOIN user_settings u ON u.user_id=l.user_id
      LEFT JOIN pos_points_tbl p ON p.id=l.pos_point_id
      LEFT JOIN pos_sessions_tbl s ON s.id=l.session_id
      LEFT JOIN user_settings su ON su.user_id=s.user_id
      WHERE l.occurred_at >= ${from}::date
        AND l.occurred_at < (${to}::date + INTERVAL '1 day')
        AND (${branchId || 0}=0 OR p.branch_id=${branchId || 0})
        AND (${pointIds.length === 0} OR l.pos_point_id=ANY(${pointIds}::int[]))
        AND (${cashierIds.length === 0} OR l.user_id=ANY(${cashierIds}::int[]))
        AND (${sessionIds.length === 0} OR l.session_id=ANY(${sessionIds}::bigint[]))
        AND (${movementTypes.length === 0} OR l.movement_type=ANY(${movementTypes}::text[]))
      ORDER BY l.occurred_at DESC, l.id DESC
    `
    if (params.get("lookups") !== "1") return NextResponse.json({ rows })
    const [points, cashiers, shifts] = await Promise.all([
      sql`SELECT id,name,code FROM pos_points_tbl WHERE status=1 AND (${branchId || 0}=0 OR branch_id=${branchId || 0}) ORDER BY name`,
      sql`SELECT user_id id,user_id::text code,COALESCE(NULLIF(full_name,''),NULLIF(username,''),user_id::text) name FROM user_settings ORDER BY name`,
      sql`SELECT s.id, s.shift_guid::text code, CONCAT_WS(' · ',COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),s.user_id::text),p.name,TO_CHAR(COALESCE(s.opened_at,s.closed_at),'YYYY-MM-DD')) name
          FROM pos_sessions_tbl s JOIN pos_points_tbl p ON p.id=s.pos_point_id LEFT JOIN user_settings u ON u.user_id=s.user_id
          WHERE (${branchId || 0}=0 OR p.branch_id=${branchId || 0}) ORDER BY s.id DESC`,
    ])
    return NextResponse.json({ rows, points, cashiers, shifts, movementTypes: ACTIONS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل سجل الكاشير" }, { status: 500 })
  }
}
