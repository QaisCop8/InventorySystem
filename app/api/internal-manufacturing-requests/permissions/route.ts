import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { countInternalManufacturingStages, ensureInternalManufacturingTables, getInternalManufacturingPermissions, getInternalManufacturingSettings } from "@/lib/internal-manufacturing-request"

// صلاحيات المستخدم في الفرع النشط + إعدادات المراحل + عدد الطلبات المنتظرة في كل مرحلة يملك صلاحيتها.
export async function GET(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const branchId = Number(request.headers.get("x-branch-id") || 0)
    const [permissions, settings, counts] = await Promise.all([
      getInternalManufacturingPermissions(user.user_id, branchId),
      getInternalManufacturingSettings(),
      branchId ? countInternalManufacturingStages(branchId) : Promise.resolve({} as Record<number, number>),
    ])
    return NextResponse.json({ branchId, permissions, settings, counts }, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
