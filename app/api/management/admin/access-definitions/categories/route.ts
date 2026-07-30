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

    const rows = await managementSql`SELECT id, name, created_at, updated_at FROM access_category ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("[access-definitions/categories GET] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء جلب الفئات" }, { status: 500 })
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
    if (!name) {
      return NextResponse.json({ error: "اسم الفئة مطلوب" }, { status: 400 })
    }

    const result = await managementSql`
      INSERT INTO access_category (name) VALUES (${name}) RETURNING id, name, created_at, updated_at
    `
    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("[access-definitions/categories POST] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إضافة الفئة" }, { status: 500 })
  }
}
