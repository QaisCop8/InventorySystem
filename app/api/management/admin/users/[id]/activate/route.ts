import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const session = await getManagementSession()
    if (!session || !session.is_platform_admin) {
      return NextResponse.json({ error: "لا تملك صلاحية القيام بهذا الإجراء" }, { status: 403 })
    }

    const userId = Number(params.id)
    await managementSql`UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/admin/users/activate] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تفعيل المستخدم" }, { status: 500 })
  }
}
