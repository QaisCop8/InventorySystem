import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../../../_auth"
import { rejectStepForOrder } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const denied = await requireTaskPermission(request, "task_board", "access")
    if (denied) return denied
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    if (!data.reason) return NextResponse.json({ error: "سبب الرفض مطلوب" }, { status: 400 })
    const item = await rejectStepForOrder(Number(params.id), Number(params.stepId), actingUserId, String(data.reason))
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error rejecting step for order:", error)
    return NextResponse.json({ error: error?.message || "فشل في رفض المرحلة" }, { status: 400 })
  }
}
