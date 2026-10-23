import { NextResponse, type NextRequest } from "next/server"
import { changeManagementPassword } from "@/lib/management-auth"

// تغيير كلمة المرور من بوابة الإدارة (المستخدم المسجّل دخوله) — يتطلب كلمة المرور الحالية
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const result = await changeManagementPassword(String(body?.current_password || ""), String(body?.new_password || ""))
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 400 })
    return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" })
  } catch (error) {
    console.error("[management change-password]", error)
    return NextResponse.json({ error: "تعذّر تغيير كلمة المرور" }, { status: 500 })
  }
}
