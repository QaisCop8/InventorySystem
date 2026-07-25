import { type NextRequest, NextResponse } from "next/server"
import { listOpenTasks } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get("workflow_id")
    const sectionId = searchParams.get("section_id")
    const assigneeId = searchParams.get("assignee_id")
    const search = searchParams.get("search")
    const tasks = await listOpenTasks({
      workflowId: workflowId ? Number(workflowId) : undefined,
      sectionId: sectionId ? Number(sectionId) : undefined,
      assigneeId: assigneeId || undefined,
      search: search || undefined,
    })
    return NextResponse.json(tasks)
  } catch (error) {
    console.error("Error fetching open tasks:", error)
    return NextResponse.json({ error: "فشل في جلب المهام" }, { status: 500 })
  }
}
