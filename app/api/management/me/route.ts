import { NextResponse, type NextRequest } from "next/server"
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

// رقم جوال صاحب الحساب — يُطلب مرة من الحسابات المسجّلة قبل أن يصبح إلزامياً عند التسجيل
export async function PATCH(request: NextRequest) {
  const session = await getManagementSession()
  if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  const data = await request.json().catch(() => ({}))
  const mobile = String(data.mobile || "").replace(/[\s-]/g, "")
  if (!mobile) return NextResponse.json({ error: "رقم الجوال مطلوب" }, { status: 400 })
  if (!/^\+?\d{9,15}$/.test(mobile)) return NextResponse.json({ error: "رقم الجوال غير صحيح" }, { status: 400 })
  await ensureManagementTables()
  await managementSql`UPDATE users SET mobile = ${mobile}, updated_at = CURRENT_TIMESTAMP WHERE id = ${session.id}`
  return NextResponse.json({ success: true, mobile })
}
