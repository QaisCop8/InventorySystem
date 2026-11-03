import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../_auth"
import { listWorkflows, createWorkflow } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    if (!(await resolveActingUserId(request))) return unauthenticated()
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
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "create")
    if (denied) return denied
    const workflow = await createWorkflow(data)
    return NextResponse.json(workflow, { status: 201 })
  } catch (error: any) {
    console.error("Error creating task workflow:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنشاء سير العمل" }, { status: 500 })
  }
}
