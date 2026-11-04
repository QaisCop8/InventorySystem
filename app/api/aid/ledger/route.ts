import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { ensureAidTables } from "@/lib/aid-program"

const DATE = /^\d{4}-\d{2}-\d{2}$/

// حركات الدفاتر الثلاثة لنشاط (سجل غير قابل للتعديل) مع تصفية بالمستفيد/نقطة البيع/النوع/الفترة
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "aid_program", "view")
    if (!authorization.ok) return authorization.response
    await ensureAidTables()
    const params = request.nextUrl.searchParams
    const activityId = Number(params.get("activity_id"))
    if (!(activityId > 0)) return NextResponse.json({ error: "اختر النشاط" }, { status: 400 })
    const participantId = Number(params.get("participant_id")) || null
    const pointId = Number(params.get("point_id")) || null
    const type = String(params.get("type") || "")
    const from = DATE.test(String(params.get("from"))) ? String(params.get("from")) : null
    const to = DATE.test(String(params.get("to"))) ? String(params.get("to")) : null
    // شركة لم تُعرّف نقاط بيع بعد لا جدول pos_points_tbl لديها
    const pointName = (await sql`SELECT to_regclass('pos_points_tbl') t`)[0]?.t
      ? sql`(SELECT name FROM pos_points_tbl pp WHERE pp.id = l.pos_point_id)` : sql`NULL::text`
    const rows = await sql`
      SELECT l.id, l.entry_type, l.amount, l.program_delta, l.participant_delta, l.vendor_delta, l.participant_balance_after,
        l.created_at, l.note, l.reverses_id, l.voucher_id, v.vch_code, p.full_name participant_name, p.national_id,
        ${pointName} point_name, u.full_name user_name
      FROM aid_ledger_tbl l
      LEFT JOIN aid_participants_tbl p ON p.id = l.participant_id
      LEFT JOIN voucher_header_tbl v ON v.id = l.voucher_id
      LEFT JOIN user_settings u ON u.user_id = l.user_id
      WHERE l.activity_id = ${activityId}
        AND (${participantId}::int IS NULL OR l.participant_id = ${participantId})
        AND (${pointId}::int IS NULL OR l.pos_point_id = ${pointId})
        AND (${type} = '' OR l.entry_type = ${type})
        AND (${from}::date IS NULL OR l.created_at >= ${from}::date)
        AND (${to}::date IS NULL OR l.created_at < ${to}::date + 1)
      ORDER BY l.id DESC
      LIMIT 2000`
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("[aid ledger] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل الحركات" }, { status: 500 })
  }
}
