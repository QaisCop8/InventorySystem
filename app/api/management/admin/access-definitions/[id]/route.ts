import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }
    const data = await request.json()
    const name = String(data?.name ?? "").trim()
    const categoryId = data?.category_id ? Number(data.category_id) : null
    if (!name) {
      return NextResponse.json({ error: "اسم الصلاحية مطلوب" }, { status: 400 })
    }

    const result = await managementSql`
      UPDATE access_list SET name = ${name}, category_id = ${categoryId}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, category_id, created_at, updated_at
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "الصلاحية غير موجودة" }, { status: 404 })
    }
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[access-definitions/[id] PUT] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تعديل الصلاحية" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await managementSql`DELETE FROM access_list WHERE id = ${id} RETURNING id`
    if (result.length === 0) {
      return NextResponse.json({ error: "الصلاحية غير موجودة" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[access-definitions/[id] DELETE] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء حذف الصلاحية" }, { status: 500 })
  }
}
