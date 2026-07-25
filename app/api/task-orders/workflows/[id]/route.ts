import { type NextRequest, NextResponse } from "next/server"
import { updateWorkflowMeta, updateWorkflowDefinition, deleteWorkflow, isWorkspaceAdmin } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة سير العمل" }, { status: 403 })
    }
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
    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) return NextResponse.json({ error: "لا تملك صلاحية إدارة سير العمل" }, { status: 403 })
    await deleteWorkflow(id, userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting task workflow:", error)
    return NextResponse.json({ error: error?.message || "فشل في حذف سير العمل" }, { status: 500 })
  }
}
