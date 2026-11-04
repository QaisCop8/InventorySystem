import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { AidInputError, AID_STATUS, checkAidCode, ensureAidTables } from "@/lib/aid-program"
import { canUsePosCashierPermission, getPosPoint, posPermissionDenied, requestUserId } from "@/app/api/pos/_lib"

const localDate = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function cashierPoint(request: NextRequest, pointId: number) {
  const userId = requestUserId(request)
  if (!userId || !(pointId > 0)) return { error: NextResponse.json({ error: "نقطة البيع مطلوبة" }, { status: 400 }) }
  const point = await getPosPoint(pointId, userId)
  if (!point) return { error: NextResponse.json({ error: "نقطة البيع غير متاحة لهذا المستخدم" }, { status: 403 }) }
  if (!(await canUsePosCashierPermission(userId, Number(point.branch_id), "sale"))) return { error: posPermissionDenied("sale", "لا توجد لديك صلاحية البيع من الكاشير") }
  return { point }
}

// كاشير نقطة البيع: GET ?point_id ⇐ هل يوجد نشاط مساعدة فعّال لهذه النقطة اليوم (لإظهار طريقة الدفع)،
// POST ⇐ التحقق من رمز الصرف + الرقم السري وإرجاع الرصيد والمبلغ المتاح لأصناف السلة المسموحة.
export async function GET(request: NextRequest) {
  try {
    const result = await cashierPoint(request, Number(request.nextUrl.searchParams.get("point_id")))
    if (result.error) return result.error
    await ensureAidTables()
    const today = localDate()
    const rows = await sql`
      SELECT 1 FROM aid_activities_tbl a
      WHERE a.status = ${AID_STATUS.active} AND a.start_date <= ${today}::date AND a.end_date >= ${today}::date
        AND a.currency_id = ${Number(result.point.currency_id)}
        AND (a.all_points OR EXISTS (SELECT 1 FROM aid_activity_points_tbl p WHERE p.activity_id = a.id AND p.pos_point_id = ${Number(result.point.id)}))
      LIMIT 1`
    return NextResponse.json({ enabled: rows.length > 0 })
  } catch (error) {
    console.error("[aid verify] GET failed", error)
    return NextResponse.json({ enabled: false })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(() => ({}))
    const result = await cashierPoint(request, Number(data?.point_id))
    if (result.error) return result.error
    await ensureAidTables()
    const lines = (Array.isArray(data?.lines) ? data.lines : []).map((line: any) => ({ product_id: Number(line?.product_id), amount: Number(line?.amount) }))
    const checked = await checkAidCode({ code: data?.code, pin: data?.pin, point: result.point, lines, lock: false, today: localDate() })
    return NextResponse.json({
      participant_name: checked.participant.full_name,
      activity_name: checked.activity.name,
      currency_code: checked.activity.currency_code,
      balance: Number(checked.participant.balance),
      eligible: checked.eligible,
      available: checked.available,
    })
  } catch (error) {
    if (error instanceof AidInputError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error("[aid verify] POST failed", error)
    return NextResponse.json({ error: "تعذر التحقق من الرمز" }, { status: 500 })
  }
}
