import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeInternalManufacturing, ensureInternalManufacturingTables, getInternalManufacturingDashboard } from "@/lib/internal-manufacturing-request"

export async function GET(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const branchId = Number(request.headers.get("x-branch-id") || 0)
    try {
      await authorizeInternalManufacturing(user.user_id, branchId, "dashboard")
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const overdueDays = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("overdue_days") || 2)))
    return NextResponse.json(await getInternalManufacturingDashboard(branchId, overdueDays), { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) { return NextResponse.json({ error: error.message || "تعذر تحميل لوحة المتابعة" }, { status: 400 }) }
}
