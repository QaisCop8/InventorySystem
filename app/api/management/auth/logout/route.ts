import { NextResponse } from "next/server"
import { logoutManagementUser } from "@/lib/management-auth"

export async function POST() {
  try {
    await logoutManagementUser()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/auth/logout] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تسجيل الخروج" }, { status: 500 })
  }
}
