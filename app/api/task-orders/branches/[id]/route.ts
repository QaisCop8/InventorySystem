import { type NextRequest, NextResponse } from "next/server"
import { updateBranch, isWorkspaceAdmin } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة الفروع" }, { status: 403 })
    }
    const branch = await updateBranch(id, data)
    if (!branch) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    return NextResponse.json(branch)
  } catch (error) {
    console.error("Error updating task branch:", error)
    return NextResponse.json({ error: "فشل في تحديث الفرع" }, { status: 500 })
  }
}
