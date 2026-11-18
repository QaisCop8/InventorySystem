import { NextResponse, type NextRequest } from "next/server"
import { withTenantTransaction } from "@/lib/database"
import { authorizeUserAdmin } from "@/lib/user-admin-access"
import { setWarehouseDenials, warehouseUsers } from "@/lib/warehouse-access"

export const dynamic = "force-dynamic"

// صلاحيات المستخدمين على مستودع (lib/warehouse-access.ts) — لمدير المستخدمين والصلاحيات فقط
//   GET  ⇐ كل المستخدمين مع allowed
//   PUT {denied_user_ids: string[]} ⇐ الممنوعون (الباقي مسموح)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  const warehouseId = Number(params.id)
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) return NextResponse.json({ error: "معرف المستودع غير صالح" }, { status: 400 })
  try {
    return NextResponse.json({ users: await warehouseUsers(warehouseId) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("warehouse users GET", error)
    return NextResponse.json({ error: "تعذر تحميل المستخدمين" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await authorizeUserAdmin(request)
  if (!admin.ok) return admin.response
  const warehouseId = Number(params.id)
  if (!Number.isInteger(warehouseId) || warehouseId <= 0) return NextResponse.json({ error: "معرف المستودع غير صالح" }, { status: 400 })
  try {
    const body = await request.json().catch(() => ({}))
    const denied = Array.isArray(body?.denied_user_ids) ? body.denied_user_ids.map(String) : []
    await withTenantTransaction(() => setWarehouseDenials(warehouseId, denied, admin.userId))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("warehouse users PUT", error)
    return NextResponse.json({ error: "تعذر حفظ صلاحيات المستودع" }, { status: 500 })
  }
}
