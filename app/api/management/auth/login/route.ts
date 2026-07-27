import { type NextRequest, NextResponse } from "next/server"
import { loginManagementUser } from "@/lib/management-auth"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const result = await loginManagementUser({ email: data.email, password: data.password })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    return NextResponse.json({ success: true, user: result.user })
  } catch (error) {
    console.error("[management/auth/login] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الدخول" }, { status: 500 })
  }
}
