import { type NextRequest, NextResponse } from "next/server"
import { authenticateUser } from "@/lib/auth"
import { createTenantSession } from "@/lib/tenant-auth"

export async function POST(request: NextRequest) {
  try {
    const credentials = await request.json()

    // Get client IP and user agent for logging
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const result = await authenticateUser({
      ...credentials,
      ip,
      userAgent,
    })

    // جلسة خادمية حقيقية (تينانت) إضافية على النمط الحالي (توكن العميل بلا تغيير) — أساس التحقق
    // من الصلاحية على الخادم، انظر lib/tenant-auth.ts. فشلها لا يُسقِط تسجيل الدخول نفسه.
    if (result.success && result.user?.id) {
      try {
        await createTenantSession(String(result.user.id))
      } catch (sessionError) {
        console.error("[auth/login] Failed to create tenant session:", sessionError)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Login API error:", error)
    return NextResponse.json({ success: false, error: "حدث خطأ في الخادم" }, { status: 500 })
  }
}
