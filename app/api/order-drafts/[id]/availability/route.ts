import { NextRequest, NextResponse } from "next/server"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { checkDraftProductionAvailability } from "@/lib/inventory-availability"
import sql from "@/lib/database"
import { getSessionUser, requirePermissionByName } from "@/lib/tenant-auth"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permission = await requirePermissionByName(_request, "استعلام مسودة طلبية مبيعات")
    if (!permission.ok) {
      const confirm = await requirePermissionByName(_request, "تأكيد مسودة الطلبية وتحويلها لطلبية مبيعات")
      if (!confirm.ok) return permission.response
    }
    await ensureOrderDraftTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رقم المسودة غير صالح" }, { status: 400 })
    const result = await checkDraftProductionAvailability(id)
    const user = await getSessionUser(_request)
    await sql`INSERT INTO sales_order_draft_events (draft_id,event_type,user_id,details) VALUES (${id}, 'production_availability_checked', ${user?.user_id || null}, ${JSON.stringify(result)}::jsonb)`
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر فحص توفر مواد الانتاج" }, { status: 500 })
  }
}
