import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../_auth"
import { updateBranch } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "update")
    if (denied) return denied
    const branch = await updateBranch(id, data)
    if (!branch) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    return NextResponse.json(branch)
  } catch (error) {
    console.error("Error updating task branch:", error)
    return NextResponse.json({ error: "فشل في تحديث الفرع" }, { status: 500 })
  }
}
