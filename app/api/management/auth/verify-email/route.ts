import { type NextRequest, NextResponse } from "next/server"
import { verifyManagementEmail } from "@/lib/management-auth"

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") || ""
    const result = await verifyManagementEmail(token)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[management/auth/verify-email] error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تأكيد البريد الإلكتروني" }, { status: 500 })
  }
}
