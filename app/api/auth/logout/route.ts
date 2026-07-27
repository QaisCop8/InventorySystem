import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { logAuditEvent } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (userId) {
      await logAuditEvent({
        userId,
        userName: "مستخدم",
        action: "logout",
        module: "authentication",
        status: "success",
        details: "User logged out successfully",
      })
    }

    // إزالة كوكي الشركة الحالية (tenant_db) عند تسجيل الخروج — حتى لا تبقى الجلسة التالية مرتبطة
    // ضمناً بآخر شركة تم اختيارها من لوحة إدارة الشركات دون اختيار صريح جديد.
    const cookieStore = await cookies()
    cookieStore.delete("tenant_db")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Logout API error:", error)
    return NextResponse.json({ success: false, error: "حدث خطأ في الخادم" }, { status: 500 })
  }
}
