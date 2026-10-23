import { NextResponse } from "next/server"
import { adminSetManagementPassword } from "@/lib/management-auth"
import { ensureManagementTables } from "@/lib/management-db"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await ensureManagementTables()
    const body = await request.json().catch(() => ({}))
    const result = await adminSetManagementPassword(Number(params.id), String(body.new_password || ""))
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/admin/users/password] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تعيين كلمة المرور" }, { status: 500 })
  }
}
