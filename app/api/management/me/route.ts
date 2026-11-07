import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"
import managementSql, { ensureManagementTables } from "@/lib/management-db"

export async function GET() {
  const session = await getManagementSession()
  if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  await ensureManagementTables()
  const [row] = await managementSql`SELECT mobile FROM users WHERE id = ${session.id}`

  return NextResponse.json({
    id: session.id,
    fullName: session.full_name,
    email: session.email,
    mobile: String(row?.mobile || ""),
    isPlatformAdmin: session.is_platform_admin,
  })
}
