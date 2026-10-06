import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeInternalManufacturing, ensureInternalManufacturingTables, getInternalManufacturingSettings, saveInternalManufacturingSettings } from "@/lib/internal-manufacturing-request"

export async function GET() {
  try { await ensureInternalManufacturingTables(); return NextResponse.json(await getInternalManufacturingSettings()) } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }) }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await authorizeInternalManufacturing(user.user_id, Number(request.headers.get("x-branch-id") || 0), "settings")
    return NextResponse.json(await saveInternalManufacturingSettings(await request.json()))
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}
