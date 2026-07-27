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
    if (userId === session.id) {
      return NextResponse.json({ error: "لا يمكنك إيقاف حسابك الخاص" }, { status: 400 })
    }

    await managementSql`UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`
    await managementSql`DELETE FROM management_sessions WHERE user_id = ${userId}`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/admin/users/deactivate] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إيقاف المستخدم" }, { status: 500 })
  }
}
