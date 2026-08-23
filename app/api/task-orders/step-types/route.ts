import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureTaskOrderTables, listStepTypes, saveStepType, isWorkspaceAdmin } from "@/lib/task-orders"

export async function GET() {
  try {
    return NextResponse.json(await listStepTypes())
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل انواع الخطوات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTaskOrderTables()
    const user = await getSessionUser(request)
    if (!user || !(await isWorkspaceAdmin(String(user.user_id)))) return NextResponse.json({ error: "لا توجد صلاحية" }, { status: 403 })
    return NextResponse.json(await saveStepType(await request.json()), { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر حفظ نوع الخطوة" }, { status: 400 })
  }
}
