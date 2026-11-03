import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../_auth"
import { updateSection } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "update")
    if (denied) return denied
    const section = await updateSection(id, data)
    if (!section) return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 })
    return NextResponse.json(section)
  } catch (error) {
    console.error("Error updating task section:", error)
    return NextResponse.json({ error: "فشل في تحديث القسم" }, { status: 500 })
  }
}
