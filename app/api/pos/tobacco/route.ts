import { NextRequest, NextResponse } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { canUsePosCashierPermission, ensurePosTables, getOpenPosSession, getPosPoint, requestUserId } from "../_lib"
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
    return { error: NextResponse.json({ error: permission === "handover" ? "لا توجد لديك صلاحية تسليم العهدة" : "لا توجد لديك صلاحية استلام العهدة" }, { status: 403 }) }
  }
  return { userId, point }
}

export async function GET(request: NextRequest) {
  try {
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const ctx = await context(request, pointId, "access")
    if ("error" in ctx) return ctx.error
    const enabled = Boolean(ctx.point.tobacco_custody)
    const session = await getOpenPosSession(pointId, ctx.userId)
    if (!enabled || !session) return NextResponse.json({ enabled, session_id: session ? Number(session.id) : null, opened: false, handed_over: false, lines: [] })
    const lines = await tobaccoLines(Number(session.id), session.tobacco_opened ? undefined : await suggestedOpeningFor(session))
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
    const ctx = await context(request, pointId, action === "handover" ? "handover" : "receiveHandover")
    if ("error" in ctx) return ctx.error
    if (!ctx.point.tobacco_custody) return NextResponse.json({ error: "عهدة الدخان غير مفعّلة لهذه النقطة" }, { status: 400 })
    const lines: any[] = Array.isArray(data.lines) ? data.lines : []
    const bad = lines.some((line) => !(Number(line.product_id) > 0) || !Number.isFinite(Number(action === "handover" ? line.counted : line.qty)) || Number(action === "handover" ? line.counted : line.qty) < 0)
    if (bad) return NextResponse.json({ error: "الكميات يجب أن تكون أرقاماً موجبة" }, { status: 400 })

    return await withTenantTransaction(async () => {
      const session = await getOpenPosSession(pointId, ctx.userId)
      if (!session) return NextResponse.json({ error: "يجب فتح أو استلام عهدة أولاً" }, { status: 400 })
      if (session.tobacco_handed_over) return NextResponse.json({ error: "تم تسليم عهدة الدخان لهذه الوردية" }, { status: 400 })
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
