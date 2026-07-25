import { type NextRequest, NextResponse } from "next/server"
import { addSectionMember, removeSectionMember, isWorkspaceAdmin } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sectionId = Number(params.id)
    const data = await request.json()
    if (!data.user_id) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة أعضاء الأقسام" }, { status: 403 })
    }
    const member = await addSectionMember(sectionId, String(data.user_id), !!data.is_manager)
    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    console.error("Error adding task section member:", error)
    return NextResponse.json({ error: "فشل في إضافة العضو" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sectionId = Number(params.id)
    const { searchParams } = new URL(request.url)
    const memberUserId = searchParams.get("user_id")
    const requesterId = searchParams.get("userId")
    if (!memberUserId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    if (!requesterId || !(await isWorkspaceAdmin(requesterId))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة أعضاء الأقسام" }, { status: 403 })
    }
    await removeSectionMember(sectionId, memberUserId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing task section member:", error)
    return NextResponse.json({ error: "فشل في حذف العضو" }, { status: 500 })
  }
}
