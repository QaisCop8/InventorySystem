import { type NextRequest, NextResponse } from "next/server"
import { authenticateUser } from "@/lib/auth"
import { createTenantSession, findActiveSessionElsewhere } from "@/lib/tenant-auth"
import { resolveCurrentDbName } from "@/lib/database"
import { recordManagementLogin } from "@/lib/management-login-audit"

export async function POST(request: NextRequest) {
  try {
    const { force, ...credentials } = await request.json()
    const replaceOtherDevices = force === true

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
    // جهاز واحد لكل مستخدم: جلسة سارية من جهاز آخر ⇐ لا دخول قبل تأكيد المستخدم (force)
    if (result.success && result.user?.id && !replaceOtherDevices) {
      const device = await findActiveSessionElsewhere(String(result.user.id))
      if (device) {
        return NextResponse.json({ success: false, error: "حسابك مسجَّل الدخول الآن من جهاز آخر", code: "active_elsewhere", device, account: { name: result.user.fullName || null, email: result.user.email || null } }, { status: 409 })
      }
    }
    if (result.success && result.user?.id) {
      try {
        await createTenantSession(String(result.user.id), { ip, userAgent, replaceOtherDevices })
      } catch (sessionError) {
        console.error("[auth/login] Failed to create tenant session:", sessionError)
      }
    }

    if (result.success && result.user) {
      try {
        await recordManagementLogin({
          email: result.user.email,
          name: result.user.fullName,
          tenantUserId: result.user.id,
          dbName: await resolveCurrentDbName(),
          loginType: "tenant",
          ipAddress: ip.split(",")[0].trim(),
          userAgent,
        })
      } catch (auditError) {
        console.error("[auth/login] Failed to write central login audit:", auditError)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Login API error:", error)
    return NextResponse.json({ success: false, error: "حدث خطأ في الخادم" }, { status: 500 })
  }
}
