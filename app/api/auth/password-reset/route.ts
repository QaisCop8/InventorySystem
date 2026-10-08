import { type NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { emailIsRegistered, issuePasswordCode, setPasswordWithCode, verifyPasswordCode } from "@/lib/password-codes"

// استعادة/تعيين كلمة المرور بثلاث خطوات: request (إرسال رمز بالبريد) ← verify ← reset.
export async function POST(request: NextRequest) {
  try {
    const { email, step, code, newPassword } = await request.json()
    if (!String(email || "").trim()) return NextResponse.json({ error: "البريد الإلكتروني مطلوب" }, { status: 400 })

    if (step === "request") {
      const tenantDb = request.cookies.get("tenant_db")?.value ? await resolveCurrentDbName().catch(() => null) : null
      if (!(await emailIsRegistered(email, tenantDb))) {
        return NextResponse.json({ error: "البريد الإلكتروني غير مسجل في النظام" }, { status: 404 })
      }
      const { sent } = await issuePasswordCode({ email, purpose: "reset", tenantDb })
      if (!sent) {
        return NextResponse.json({ error: "تعذّر إرسال البريد الإلكتروني — إعدادات البريد (SMTP) غير مضبوطة على الخادم. تواصل مع مسؤول النظام." }, { status: 503 })
      }
      return NextResponse.json({ success: true, message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني" })
    }

    if (step === "verify") {
      const result = await verifyPasswordCode(email, code)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ success: true, message: "تم التحقق من الرمز بنجاح" })
    }

    if (step === "reset") {
      const result = await setPasswordWithCode(email, code, newPassword)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" })
    }

    return NextResponse.json({ error: "نوع العملية غير صحيح" }, { status: 400 })
  } catch (error) {
    console.error("[password-reset] error:", error)
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 })
  }
}
