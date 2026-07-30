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
    if (!name) {
      return NextResponse.json({ error: "اسم الفئة مطلوب" }, { status: 400 })
    }

    const result = await managementSql`
      UPDATE access_category SET name = ${name}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, created_at, updated_at
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 })
    }
    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[access-definitions/categories/[id] PUT] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تعديل الفئة" }, { status: 500 })
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

    const inUse = await managementSql`SELECT id FROM access_list WHERE category_id = ${id} LIMIT 1`
    if (inUse.length > 0) {
      return NextResponse.json({ error: "لا يمكن حذف الفئة لوجود صلاحيات مرتبطة بها" }, { status: 400 })
    }

    const result = await managementSql`DELETE FROM access_category WHERE id = ${id} RETURNING id`
    if (result.length === 0) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[access-definitions/categories/[id] DELETE] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء حذف الفئة" }, { status: 500 })
  }
}
