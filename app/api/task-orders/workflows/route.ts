import { type NextRequest, NextResponse } from "next/server"
import { listWorkflows, createWorkflow, isWorkspaceAdmin } from "@/lib/task-orders"

export async function GET() {
  try {
    const workflows = await listWorkflows()
    return NextResponse.json(workflows)
  } catch (error) {
    console.error("Error fetching task workflows:", error)
    return NextResponse.json({ error: "فشل في جلب سير العمل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    if (!data.name) return NextResponse.json({ error: "اسم سير العمل مطلوب" }, { status: 400 })
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة سير العمل" }, { status: 403 })
    }
    const workflow = await createWorkflow(data)
    return NextResponse.json(workflow, { status: 201 })
  } catch (error: any) {
    console.error("Error creating task workflow:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنشاء سير العمل" }, { status: 500 })
  }
}
