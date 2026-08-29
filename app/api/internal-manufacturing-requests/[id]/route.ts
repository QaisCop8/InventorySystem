import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import sql from "@/lib/database"
import { authorizeInternalManufacturing, canEditInternalManufacturingRequest, ensureInternalManufacturingTables, getInternalManufacturingSettings, updateInternalManufacturingRequest } from "@/lib/internal-manufacturing-request"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const id = Number(params.id)
    const row = (await sql`SELECT * FROM voucher_header_tbl WHERE id = ${id} AND vch_type = 20 AND status <> 3 LIMIT 1`)[0]
    if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    const settings = await getInternalManufacturingSettings()
    if (!canEditInternalManufacturingRequest(Number(row.internal_status), settings)) return NextResponse.json({ error: "لا يمكن تعديل طلب بدأ سيره" }, { status: 400 })
    await authorizeInternalManufacturing(user.user_id, Number(row.branch_id), "create")
    return NextResponse.json(await updateInternalManufacturingRequest(id, await request.json(), Number(user.user_id)))
  } catch (error: any) { return NextResponse.json({ error: error.message || "تعذر تعديل الطلب" }, { status: 400 }) }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureInternalManufacturingTables()
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const id = Number(params.id)
    const row = (await sql`SELECT branch_id, internal_status FROM voucher_header_tbl WHERE id = ${id} AND vch_type = 20 AND status <> 3 LIMIT 1`)[0]
    if (!row) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    await authorizeInternalManufacturing(user.user_id, Number(row.branch_id), "create")
    if (!canEditInternalManufacturingRequest(Number(row.internal_status), await getInternalManufacturingSettings())) return NextResponse.json({ error: "لا يمكن حذف طلب بدأ سيره" }, { status: 400 })
    const items = await sql`SELECT id,item_id,item_name,unit_id,qnty AS requested_quantity,prepared_quantity,received_quantity FROM voucher_items_tbl WHERE voucher_id=${id} ORDER BY id`
    await sql`INSERT INTO internal_manufacturing_events (voucher_id,action,from_status,to_status,user_id,before_snapshot,after_snapshot,request_snapshot) VALUES (${id},'delete',${row.internal_status},${row.internal_status},${Number(user.user_id)},${JSON.stringify(items)}::jsonb,'[]'::jsonb,${JSON.stringify({ vch_code: row.vch_code, vch_date: row.vch_date, branch_id: row.branch_id, manufacturing_branch_id: row.manufacturing_branch_id, source_warehouse_id: row.to_store_id, destination_warehouse_id: row.destination_warehouse_id })}::jsonb)`
    await sql`UPDATE voucher_header_tbl SET status = 3, update_user = ${Number(user.user_id)}, last_update_date = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر حذف الطلب" }, { status: 400 })
  }
}
