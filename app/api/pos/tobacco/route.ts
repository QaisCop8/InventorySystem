import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { canUsePosCashierPermission, posPermissionDenied, ensurePosTables, getOpenPosSession, getPosPoint, requestUserId } from "../_lib"
import { saveTobaccoHandover, saveTobaccoOpening, suggestedOpeningFor, tobaccoLines } from "@/lib/pos-tobacco"

// عهدة الدخان للكاشير (lib/pos-tobacco.ts) — GET ?point_id: حالة العهدة وأسطرها للوردية المفتوحة.
// POST {action:"open", lines:[{product_id, qty}]} استلام الكميات الافتتاحية،
// POST {action:"handover", lines:[{product_id, counted}]} تسليم الكميات (قبل تسليم النقد).
async function context(request: NextRequest, pointId: number, permission: "access" | "handover" | "receiveHandover") {
  await ensureSalesTables(); await ensurePosTables()
  const userId = requestUserId(request)
  if (!pointId || !userId) return { error: NextResponse.json({ error: "بيانات نقطة البيع غير مكتملة" }, { status: 400 }) }
  const point = await getPosPoint(pointId, userId)
  if (!point) return { error: NextResponse.json({ error: "نقطة البيع غير متاحة" }, { status: 403 }) }
  if (!await canUsePosCashierPermission(userId, Number(point.branch_id), permission)) {
    return { error: posPermissionDenied(permission, permission === "handover" ? "لا توجد لديك صلاحية تسليم العهدة" : "لا توجد لديك صلاحية استلام العهدة") }
  }
  return { userId, point }
}

export async function GET(request: NextRequest) {
  try {
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const ctx = await context(request, pointId, "access")
    if ("error" in ctx) return ctx.error
    const session = await getOpenPosSession(pointId, ctx.userId)
    if (!ctx.point.tobacco_custody || !session) return NextResponse.json({ enabled: false, session_id: session ? Number(session.id) : null, opened: false, handed_over: false, lines: [] })
    const lines = await tobaccoLines(Number(session.id), session.tobacco_opened ? undefined : await suggestedOpeningFor(session))
    // لا أصناف دخان معرّفة ولا أسطر لهذه الوردية ← العهدة غير فعّالة عملياً: لا نافذة استلام ولا تسليم
    const enabled = lines.length > 0 && !session.tobacco_skipped
    return NextResponse.json({ enabled, session_id: Number(session.id), opened: Boolean(session.tobacco_opened), handed_over: Boolean(session.tobacco_handed_over), received: Boolean(session.received_from_session_id), lines })
  } catch (error) {
    console.error("[pos/tobacco] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل عهدة الدخان" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(() => ({}))
    const pointId = Number(data.point_id || 0)
    const action = String(data.action || "")
    const ctx = await context(request, pointId, action === "handover" ? "handover" : action === "skip" ? "access" : "receiveHandover")
    if ("error" in ctx) return ctx.error
    if (!ctx.point.tobacco_custody) return NextResponse.json({ error: "عهدة الدخان غير مفعّلة لهذه النقطة" }, { status: 400 })
    const lines: any[] = Array.isArray(data.lines) ? data.lines : []
    const bad = lines.some((line) => !(Number(line.product_id) > 0) || !Number.isFinite(Number(action === "handover" ? line.counted : line.qty)) || Number(action === "handover" ? line.counted : line.qty) < 0)
    if (bad) return NextResponse.json({ error: "الكميات يجب أن تكون أرقاماً موجبة" }, { status: 400 })

    return await withTenantTransaction(async () => {
      const session = await getOpenPosSession(pointId, ctx.userId)
      if (!session) return NextResponse.json({ error: "يجب فتح أو استلام عهدة أولاً" }, { status: 400 })
      if (session.tobacco_handed_over) return NextResponse.json({ error: "تم تسليم عهدة الدخان لهذه الوردية" }, { status: 400 })
      if (action === "skip") {
        // وردية بلا عهدة دخان: تُعلَّم كمستلمة دون أسطر حتى لا تظهر النافذة مجدداً ولا يُطلب تسليمها
        if (session.tobacco_opened) return NextResponse.json({ error: "تم استلام عهدة الدخان لهذه الوردية" }, { status: 400 })
        await sql`UPDATE pos_sessions_tbl SET tobacco_opened = true, tobacco_skipped = true, updated_at = NOW() WHERE id = ${Number(session.id)}`
        return NextResponse.json({ success: true, lines: [] })
      }
      if (action === "open") {
        await saveTobaccoOpening(Number(session.id), lines.map((line) => ({ product_id: Number(line.product_id), qty: Number(line.qty) })))
      } else if (action === "handover") {
        if (!session.tobacco_opened) return NextResponse.json({ error: "لم تُستلم عهدة الدخان لهذه الوردية" }, { status: 400 })
        await saveTobaccoHandover(Number(session.id), new Map(lines.map((line) => [Number(line.product_id), Number(line.counted)])))
      } else {
        return NextResponse.json({ error: "عملية غير معروفة" }, { status: 400 })
      }
      return NextResponse.json({ success: true, lines: await tobaccoLines(Number(session.id)) })
    })
  } catch (error) {
    console.error("[pos/tobacco] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ عهدة الدخان" }, { status: 500 })
  }
}
