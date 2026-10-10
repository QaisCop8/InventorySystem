import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../_auth"
import { listSections, createSection, isWorkspaceAdmin } from "@/lib/task-orders"

export async function GET() {
  try {
    const sections = await listSections()
    return NextResponse.json(sections)
  } catch (error) {
    console.error("Error fetching task sections:", error)
    return NextResponse.json({ error: "فشل في جلب الأقسام" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    if (!data.name) return NextResponse.json({ error: "اسم القسم مطلوب" }, { status: 400 })
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    if (!(await isWorkspaceAdmin(actingUserId))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة الأقسام" }, { status: 403 })
    }
    const section = await createSection(data)
    return NextResponse.json(section, { status: 201 })
  } catch (error) {
    console.error("Error creating task section:", error)
    return NextResponse.json({ error: "فشل في إنشاء القسم" }, { status: 500 })
  }
}
