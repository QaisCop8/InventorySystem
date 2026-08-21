import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeInternalManufacturing, createInternalManufacturingRequest, ensureInternalManufacturingTables, listInternalManufacturingRequests } from "@/lib/internal-manufacturing-request"

export async function GET(request: NextRequest) {
  try { await ensureInternalManufacturingTables(); const user = await getSessionUser(request); if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }); const branchId = Number(request.headers.get("x-branch-id")); await authorizeInternalManufacturing(user.user_id, branchId, "requestAudit"); const status = Number(new URL(request.url).searchParams.get("status") || 0); return NextResponse.json(await listInternalManufacturingRequests(status || undefined)) } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function POST(request: NextRequest) {
  try { await ensureInternalManufacturingTables(); const user = await getSessionUser(request); if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }); const input = await request.json(); await authorizeInternalManufacturing(user.user_id, Number(input.branch_id), "create"); return NextResponse.json(await createInternalManufacturingRequest(input, Number(user.user_id)), { status: 201 }) } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}