import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeInternalManufacturing, ensureInternalManufacturingTables, listInternalManufacturingArchive } from "@/lib/internal-manufacturing-request"

export async function GET(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = new URL(request.url).searchParams
    const branchId = Number(params.get("branch_id") || 0)
    if (!branchId) return NextResponse.json({ error: "يجب تحديد الفرع" }, { status: 400 })
    await authorizeInternalManufacturing(user.user_id, branchId, "create")
    return NextResponse.json(await listInternalManufacturingArchive({
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      search: params.get("search") || undefined,
      branchId,
    }), { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر تحميل أرشيف الطلبات الداخلية" }, { status: 400 })
  }
}
