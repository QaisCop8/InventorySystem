import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import bcrypt from "bcryptjs"

// Request password reset
export async function POST(request: NextRequest) {
  try {
    const { email, step, code, newPassword } = await request.json()

    if (step === "request") {
      // Check if user exists
      const users = await sql`
        SELECT user_id, email, full_name 
        FROM user_settings 
        WHERE email = ${email} AND is_active = true
      `

      if (users.length === 0) {
        return NextResponse.json({ error: "البريد الإلكتروني غير مسجل في النظام" }, { status: 404 })
      }

      // Generate reset code (6 digits)
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

      // Store reset code in database
      await sql`
        INSERT INTO password_reset_requests (email, reset_code, expires_at, created_at)
        VALUES (${email}, ${resetCode}, ${expiresAt}, NOW())
        ON CONFLICT (email) 
        DO UPDATE SET 
          reset_code = ${resetCode},
          expires_at = ${expiresAt},
          created_at = NOW(),
          used = false
      `

      // TODO: Send email with reset code
      console.log(`[v0] Password reset code for ${email}: ${resetCode}`)

      return NextResponse.json({
        message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني",
        success: true,
      })
    }

    if (step === "verify") {
      // Verify reset code
      const resetRequests = await sql`
        SELECT * FROM password_reset_requests 
        WHERE email = ${email} 
          AND reset_code = ${code} 
          AND expires_at > NOW() 
          AND used = false
      `

      if (resetRequests.length === 0) {
        return NextResponse.json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" }, { status: 400 })
      }

      return NextResponse.json({
        message: "تم التحقق من الرمز بنجاح",
        success: true,
      })
    }

    if (step === "reset") {
      // Verify code again and reset password
      const resetRequests = await sql`
        SELECT * FROM password_reset_requests 
        WHERE email = ${email} 
          AND reset_code = ${code} 
          AND expires_at > NOW() 
          AND used = false
      `

      if (resetRequests.length === 0) {
        return NextResponse.json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" }, { status: 400 })
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12)

      // Update user password
      await sql`
        UPDATE user_settings 
        SET password_hash = ${hashedPassword}, updated_at = NOW()
        WHERE email = ${email}
      `

      // Mark reset request as used
      await sql`
        UPDATE password_reset_requests 
        SET used = true 
        WHERE email = ${email} AND reset_code = ${code}
      `

      // Log password change
      await sql`
        INSERT INTO audit_logs (user_id, action, module, details, ip_address, created_at)
        VALUES (
          (SELECT user_id FROM user_settings WHERE email = ${email}),
          'password_reset',
          'auth',
          'تم تغيير كلمة المرور عبر نظام الاستعادة',
          ${request.headers.get("x-forwarded-for") || "unknown"},
          NOW()
        )
      `

      return NextResponse.json({
        message: "تم تغيير كلمة المرور بنجاح",
        success: true,
      })
    }

    return NextResponse.json({ error: "نوع العملية غير صحيح" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Password reset error:", error)
    return NextResponse.json({ error: "حدث خطأ في النظام" }, { status: 500 })
  }
}
