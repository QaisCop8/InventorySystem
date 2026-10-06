import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import sql from "@/lib/database"
import { STATUS_ACTIONS, authorizeInternalManufacturing, ensureInternalManufacturingTables, internalManufacturingActingBranch, internalManufacturingActingSide, processInternalManufacturingAction, type InternalManufacturingAction } from "@/lib/internal-manufacturing-request"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const input = await request.json()
    const action = String(input.action) as Exclude<InternalManufacturingAction, "create">
    if (!Object.values(STATUS_ACTIONS).includes(action)) return NextResponse.json({ error: "المرحلة غير صالحة" }, { status: 400 })
    const id = Number((await params).id)
    const row = (await sql`SELECT branch_id, manufacturing_branch_id FROM voucher_header_tbl WHERE id = ${id} AND vch_type = 20 AND status <> 3 LIMIT 1`)[0]
    if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    // المرحلة تُنفَّذ من الفرع المسؤول عنها فقط، وبصلاحية ممنوحة على ذلك الفرع.
    const actingBranchId = internalManufacturingActingBranch(row, action)
    const activeBranchId = Number(request.headers.get("x-branch-id") || 0)
    if (activeBranchId && activeBranchId !== actingBranchId) {
      const side = internalManufacturingActingSide(action) === "supplier" ? "الفرع المطلوب منه البضاعة" : "فرع مقدم الطلب"
      return NextResponse.json({ error: `هذه المرحلة تُنفَّذ من ${side} فقط — غيّر الفرع النشط` }, { status: 403 })
    }
    await authorizeInternalManufacturing(user.user_id, actingBranchId, action)
    return NextResponse.json(await processInternalManufacturingAction(id, action, Number(user.user_id), input))
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 409 }) }
}
