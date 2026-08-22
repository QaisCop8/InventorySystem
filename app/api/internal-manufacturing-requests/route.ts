import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeInternalManufacturing, createInternalManufacturingRequest, ensureInternalManufacturingTables, listInternalManufacturingRequests, type InternalManufacturingAction } from "@/lib/internal-manufacturing-request"

export async function GET(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const status = Number(new URL(request.url).searchParams.get("status") || 0)
    const branchId = Number(request.headers.get("x-branch-id"))
    const actionByStatus: Record<number, InternalManufacturingAction> = { 2: "requestAudit", 3: "prepare", 4: "readyAudit", 5: "send", 6: "receive", 7: "receivedAudit" }
    if (!status) {
      await authorizeInternalManufacturing(user.user_id, branchId, "create")
      return NextResponse.json(await listInternalManufacturingRequests(undefined, branchId, user.user_id), { headers: { "Cache-Control": "no-store" } })
    }
    const action = actionByStatus[status]
    const rows = await listInternalManufacturingRequests(status)
    const visibleRows = []
    for (const row of rows) {
      try { await authorizeInternalManufacturing(user.user_id, Number(row.branch_id), action); visibleRows.push(row) } catch { /* hide requests outside the user's branch permissions */ }
    }
    return NextResponse.json(visibleRows, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function POST(request: NextRequest) {
  try { await ensureInternalManufacturingTables(); const user = await getSessionUser(request); if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }); const input = await request.json(); await authorizeInternalManufacturing(user.user_id, Number(input.branch_id), "create"); return NextResponse.json(await createInternalManufacturingRequest(input, Number(user.user_id)), { status: 201 }) } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}