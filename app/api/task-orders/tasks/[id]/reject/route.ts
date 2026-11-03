import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../_auth"
import { rejectTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const denied = await requireTaskPermission(request, "task_board", "access")
    if (denied) return denied
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    if (!data.reason) {
      return NextResponse.json({ error: "سبب الرفض مطلوب" }, { status: 400 })
    }
    const item = await rejectTask(Number(params.id), actingUserId, data.reason, !!data.force)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error rejecting task:", error)
    return NextResponse.json({ error: error?.message || "فشل في رفض المهمة" }, { status: 400 })
  }
}
