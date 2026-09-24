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
    const detail = params.get("detail") === "1"
    const branchId = requestBranchId(request)
    const rows = detail ? await sql`
      SELECT CONCAT(l.id, '-', COALESCE(vi.id, 0)) row_id, l.id log_id, l.occurred_at, l.movement_type,
        l.transaction_no, l.notes, vi.item_name, vi.qnty quantity, vi.price,
        ROUND((COALESCE(vi.qnty, 0) * COALESCE(vi.price, 0) * (1 - COALESCE(vi.discount, 0) / 100))::numeric, 2) line_total,
        COALESCE(NULLIF(u.full_name,''),NULLIF(u.username,''),l.user_id::text) cashier_name,
        p.name point_name
      FROM pos_cashier_log_tbl l
      LEFT JOIN voucher_header_tbl vh ON vh.vch_code=l.transaction_no
      LEFT JOIN voucher_items_tbl vi ON vi.voucher_id=vh.id
      LEFT JOIN user_settings u ON u.user_id=l.user_id
      LEFT JOIN pos_points_tbl p ON p.id=l.pos_point_id
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
        p.name point_name
      FROM pos_cashier_log_tbl l
      LEFT JOIN user_settings u ON u.user_id=l.user_id
      LEFT JOIN pos_points_tbl p ON p.id=l.pos_point_id
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
