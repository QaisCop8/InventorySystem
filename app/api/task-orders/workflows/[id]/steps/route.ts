import { type NextRequest, NextResponse } from "next/server"
import { saveWorkflowSteps, isWorkspaceAdmin } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة سير العمل" }, { status: 403 })
    }
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
