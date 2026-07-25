import { type NextRequest, NextResponse } from "next/server"
import { listBranches, createBranch, isWorkspaceAdmin } from "@/lib/task-orders"

export async function GET() {
  try {
    const branches = await listBranches()
    return NextResponse.json(branches)
  } catch (error) {
    console.error("Error fetching task branches:", error)
    return NextResponse.json({ error: "فشل في جلب الفروع" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    if (!data.code || !data.name) return NextResponse.json({ error: "رمز الفرع واسمه مطلوبان" }, { status: 400 })
    if (!data.userId || !(await isWorkspaceAdmin(String(data.userId)))) {
      return NextResponse.json({ error: "لا تملك صلاحية إدارة الفروع" }, { status: 403 })
    }
    const branch = await createBranch(data)
    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    console.error("Error creating task branch:", error)
    return NextResponse.json({ error: "فشل في إنشاء الفرع" }, { status: 500 })
  }
}
