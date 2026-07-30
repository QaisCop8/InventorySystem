import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data?.name ?? "").trim()
    const status = Number(data?.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم الدور الوظيفي مطلوب" }, { status: 400 })
    }
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM job_roles WHERE LOWER(name) = LOWER(${name}) AND id != ${id}
    `
    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم الدور الوظيفي موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      UPDATE job_roles
      SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الدور الوظيفي غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating job role:", error)
    return NextResponse.json({ error: "Failed to update job role" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const inUse = await sql`SELECT id FROM user_settings WHERE job_role_id = ${id} LIMIT 1`
    if (inUse.length > 0) {
      return NextResponse.json({ error: "لا يمكن حذف الدور الوظيفي لارتباطه بمستخدمين" }, { status: 400 })
    }

    // role_permissions.role_id لها ON DELETE CASCADE فعلية (انظر lib/permissions.ts)، فلا حاجة لحذفها يدوياً هنا.
    const result = await sql`DELETE FROM job_roles WHERE id = ${id} RETURNING id`
    if (result.length === 0) {
      return NextResponse.json({ error: "الدور الوظيفي غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting job role:", error)
    return NextResponse.json({ error: "Failed to delete job role" }, { status: 500 })
  }
}
