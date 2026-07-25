import { type NextRequest, NextResponse } from "next/server"
import { updateSection, isWorkspaceAdmin } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة الأقسام" }, { status: 403 })
    }
    const section = await updateSection(id, data)
    if (!section) return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 })
    return NextResponse.json(section)
  } catch (error) {
    console.error("Error updating task section:", error)
    return NextResponse.json({ error: "فشل في تحديث القسم" }, { status: 500 })
  }
}
