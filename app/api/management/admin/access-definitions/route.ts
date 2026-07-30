import { type NextRequest, NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET() {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const rows = await managementSql`
      SELECT al.id, al.name, al.category_id, ac.name AS category_name, al.created_at, al.updated_at
      FROM access_list al
      LEFT JOIN access_category ac ON ac.id = al.category_id
      ORDER BY ac.id, al.id
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[access-definitions GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الصلاحيات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذه الصفحة" }, { status: 403 })
    }

    const data = await request.json()
    const name = String(data?.name ?? "").trim()
    const categoryId = data?.category_id ? Number(data.category_id) : null
    if (!name) {
      return NextResponse.json({ error: "اسم الصلاحية مطلوب" }, { status: 400 })
    }

    const result = await managementSql`
      INSERT INTO access_list (name, category_id) VALUES (${name}, ${categoryId})
      RETURNING id, name, category_id, created_at, updated_at
    `
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("[access-definitions POST] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إضافة الصلاحية" }, { status: 500 })
  }
}
