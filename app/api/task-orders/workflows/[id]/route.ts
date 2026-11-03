import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../../_auth"
import { updateWorkflowMeta, updateWorkflowDefinition, deleteWorkflow } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "update")
    if (denied) return denied
    // تعديل التعريف الكامل (اسم/نوع/فرع/مجموعة/أصناف) يصل مع name — أي شيء آخر (تفعيل/تعطيل
    // فقط مثلاً) يمر عبر updateWorkflowMeta الأبسط.
    const workflow = data.name ? await updateWorkflowDefinition(id, data) : await updateWorkflowMeta(id, data)
    if (!workflow) return NextResponse.json({ error: "سير العمل غير موجود" }, { status: 404 })
    return NextResponse.json(workflow)
  } catch (error: any) {
    console.error("Error updating task workflow:", error)
    return NextResponse.json({ error: error?.message || "فشل في تحديث سير العمل" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const userId = await resolveActingUserId(request)
    if (!userId) return unauthenticated()
    await deleteWorkflow(id, userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting task workflow:", error)
    return NextResponse.json({ error: error?.message || "فشل في حذف سير العمل" }, { status: 500 })
  }
}
