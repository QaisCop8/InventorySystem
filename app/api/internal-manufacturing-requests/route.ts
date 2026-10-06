import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { STATUS_ACTIONS, authorizeInternalManufacturing, createInternalManufacturingRequest, ensureInternalManufacturingTables, internalManufacturingActingSide, listInternalManufacturingRequests } from "@/lib/internal-manufacturing-request"

// كل قائمة مُقيَّدة بالفرع النشط (x-branch-id): بدون status = طلبات الفرع نفسه، ومع status = طلبات
// المرحلة التي يُنفِّذها هذا الفرع (طلباته هو، أو الطلبات الواردة إليه في مراحل التجهيز والإرسال).
export async function GET(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const status = Number(new URL(request.url).searchParams.get("status") || 0)
    const branchId = Number(request.headers.get("x-branch-id") || 0)
    if (!branchId) return NextResponse.json({ error: "يجب اختيار الفرع" }, { status: 400 })
    if (!status) {
      await authorizeInternalManufacturing(user.user_id, branchId, "create")
      return NextResponse.json(await listInternalManufacturingRequests({ branchId, side: "requester" }), { headers: { "Cache-Control": "no-store" } })
    }
    const action = STATUS_ACTIONS[status]
    if (!action) return NextResponse.json({ error: "المرحلة غير صالحة" }, { status: 400 })
    try {
      await authorizeInternalManufacturing(user.user_id, branchId, action)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    const rows = await listInternalManufacturingRequests({ status, branchId, side: internalManufacturingActingSide(action) })
    return NextResponse.json(rows, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const input = await request.json()
    const activeBranchId = Number(request.headers.get("x-branch-id") || 0)
    if (activeBranchId && Number(input.branch_id) !== activeBranchId) return NextResponse.json({ error: "فرع مقدم الطلب يجب أن يكون الفرع النشط" }, { status: 400 })
    await authorizeInternalManufacturing(user.user_id, Number(input.branch_id), "create")
    return NextResponse.json(await createInternalManufacturingRequest(input, Number(user.user_id)), { status: 201 })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
