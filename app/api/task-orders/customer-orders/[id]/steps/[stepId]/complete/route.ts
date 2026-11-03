import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../../../_auth"
import { completeStepForOrder } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const denied = await requireTaskPermission(request, "task_board", "access")
    if (denied) return denied
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const item = await completeStepForOrder(Number(params.id), Number(params.stepId), actingUserId, data.note)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error completing step for order:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنهاء المرحلة" }, { status: 400 })
  }
}
