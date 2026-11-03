import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../_auth"
import { listBranches, createBranch } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    if (!(await resolveActingUserId(request))) return unauthenticated()
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
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const denied = await requireTaskPermission(request, "task_orders_admin", "create")
    if (denied) return denied
    const branch = await createBranch(data)
    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    console.error("Error creating task branch:", error)
    return NextResponse.json({ error: "فشل في إنشاء الفرع" }, { status: 500 })
  }
}
