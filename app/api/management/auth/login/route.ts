import { type NextRequest, NextResponse } from "next/server"
import { loginManagementUser } from "@/lib/management-auth"
import { recordManagementLogin } from "@/lib/management-login-audit"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const result = await loginManagementUser({ email: data.email, password: data.password })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    if (result.user) {
      try {
        await recordManagementLogin({
          managementUserId: result.user.id,
          email: result.user.email,
          name: result.user.full_name,
          loginType: "management",
          ipAddress: (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim(),
          userAgent: request.headers.get("user-agent") || "unknown",
        })
      } catch (auditError) {
        console.error("[management/auth/login] Failed to write central login audit:", auditError)
      }
    }

    return NextResponse.json({ success: true, user: result.user })
  } catch (error) {
    console.error("[management/auth/login] error:", error)
    if ((error as { code?: string })?.code === "28P01") {
      return NextResponse.json(
        { error: "تعذّر الاتصال بقاعدة الإدارة: اسم مستخدم أو كلمة مرور PostgreSQL في DATABASE_URL غير صحيحة" },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الدخول" }, { status: 500 })
  }
}
