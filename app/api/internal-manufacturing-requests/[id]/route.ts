import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import sql from "@/lib/database"
import { authorizeInternalManufacturing, ensureInternalManufacturingTables } from "@/lib/internal-manufacturing-request"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const id = Number(params.id)
    const row = (await sql`SELECT branch_id, internal_status FROM voucher_header_tbl WHERE id = ${id} AND vch_type = 20 AND status <> 3 LIMIT 1`)[0]
    if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    await authorizeInternalManufacturing(user.user_id, Number(row.branch_id), "create")
    if (Number(row.internal_status) !== 1) return NextResponse.json({ error: "لا يمكن حذف طلب بدأ سيره" }, { status: 400 })
    await sql`UPDATE voucher_header_tbl SET status = 3, update_user = ${Number(user.user_id)}, last_update_date = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر حذف الطلب" }, { status: 400 })
  }
}
