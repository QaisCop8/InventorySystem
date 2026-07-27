import { NextResponse } from "next/server"
import { getManagementSession } from "@/lib/management-auth"

export async function GET() {
  const session = await getManagementSession()
  if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  return NextResponse.json({
    id: session.id,
    fullName: session.full_name,
    email: session.email,
    isPlatformAdmin: session.is_platform_admin,
  })
}
