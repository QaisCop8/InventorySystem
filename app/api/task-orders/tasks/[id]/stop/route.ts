import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../_auth"
import { stopTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireTaskPermission(request, "task_board", "access")
    if (denied) return denied
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const item = await stopTask(Number(params.id), actingUserId, data.note)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error stopping task:", error)
    return NextResponse.json({ error: error?.message || "فشل في إيقاف المهمة" }, { status: 400 })
  }
}
