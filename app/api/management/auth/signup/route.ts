import { type NextRequest, NextResponse } from "next/server"
import { signupManagementUser } from "@/lib/management-auth"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const result = await signupManagementUser({
      fullName: data.fullName,
      email: data.email,
      password: data.password,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, user: result.user })
  } catch (error) {
    console.error("[management/auth/signup] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الحساب" }, { status: 500 })
  }
}
