import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../_auth"
import { completeTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireTaskPermission(request, "task_board", "access")
    if (denied) return denied
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const item = await completeTask(Number(params.id), actingUserId, data.note, !!data.force)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error completing task:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنهاء المهمة" }, { status: 400 })
  }
}
