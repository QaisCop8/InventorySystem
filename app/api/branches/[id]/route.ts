import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

type RouteContext = { params: Promise<{ id: string }> }

async function resolveBranchId(context: RouteContext) {
  const { id } = await context.params
  const branchId = Number(id)
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const branchId = await resolveBranchId(context)
    if (!branchId) return NextResponse.json({ error: "معرف الفرع غير صالح" }, { status: 400 })
    const rows = await sql`
      SELECT id, branch_code, branch_name, bank_id, address, manager, phone, status
      FROM branches WHERE id = ${branchId} AND status != 3 LIMIT 1
    `
    if (rows.length === 0) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error fetching branch:", error)
    return NextResponse.json({ error: "فشل في جلب بيانات الفرع" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const branchId = await resolveBranchId(context)
    if (!branchId) return NextResponse.json({ error: "معرف الفرع غير صالح" }, { status: 400 })
    const data = await request.json()
    if (!String(data.branch_name || "").trim()) {
      return NextResponse.json({ error: "اسم الفرع مطلوب" }, { status: 400 })
    }
    const rows = await sql`
      UPDATE branches SET
        branch_name = ${String(data.branch_name).trim()},
        bank_id = ${data.bank_id ? Number(data.bank_id) : null},
        address = ${data.address || ""},
        manager = ${data.manager || ""},
        phone = ${data.phone || ""},
        status = ${Number(data.status ?? 1)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${branchId}
      RETURNING id, branch_code, branch_name, bank_id, address, manager, phone, status
    `
    if (rows.length === 0) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error updating branch:", error)
    return NextResponse.json({ error: "فشل في تعديل الفرع" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const branchId = await resolveBranchId(context)
    if (!branchId) return NextResponse.json({ error: "معرف الفرع غير صالح" }, { status: 400 })
    const rows = await sql`
      UPDATE branches SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${branchId} RETURNING id
    `
    if (rows.length === 0) return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting branch:", error)
    return NextResponse.json({ error: "فشل في حذف الفرع" }, { status: 500 })
  }
}
