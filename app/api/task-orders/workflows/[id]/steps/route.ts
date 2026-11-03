import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../../_auth"
import { saveWorkflowSteps } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "update")
    if (denied) return denied
    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      return NextResponse.json({ error: "يجب تعريف خطوة واحدة على الأقل" }, { status: 400 })
    }
    const workflow = await saveWorkflowSteps(id, data.steps, data.transitions || [])
    return NextResponse.json(workflow)
  } catch (error: any) {
    console.error("Error saving task workflow steps:", error)
    return NextResponse.json({ error: error?.message || "فشل في حفظ خطوات سير العمل" }, { status: 400 })
  }
}
