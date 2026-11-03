import { NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated, requireTaskPermission } from "../_auth"
import { ensureTaskOrderTables, listStepTypes, saveStepType } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    if (!(await resolveActingUserId(request))) return unauthenticated()
    return NextResponse.json(await listStepTypes())
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل انواع الخطوات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTaskOrderTables()
    const denied = await requireTaskPermission(request, "task_orders_admin", "update")
    if (denied) return denied
    return NextResponse.json(await saveStepType(await request.json()), { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر حفظ نوع الخطوة" }, { status: 400 })
  }
}
