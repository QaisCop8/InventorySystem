import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../../_auth"
import { updateSection, isWorkspaceAdmin } from "@/lib/task-orders"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    if (!(await isWorkspaceAdmin(actingUserId))) {
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
