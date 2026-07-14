import { type NextRequest, NextResponse } from "next/server"
import { sendNotification } from "@/lib/notification-service"

// POST - اختبار إرسال إشعار
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phoneNumber, message, method } = body

    console.log("[v0] Testing notification send:", { phoneNumber, method })

    if (!phoneNumber || !message || !method) {
      return NextResponse.json({ error: "البيانات المطلوبة غير مكتملة" }, { status: 400 })
    }

    const results = await sendNotification({
      phoneNumber,
      message,
      method,
    })

    const allSuccess = results.every((result) => result.success)

    return NextResponse.json({
      success: allSuccess,
      results,
      message: allSuccess ? "تم إرسال الإشعار التجريبي بنجاح" : "فشل في إرسال الإشعار التجريبي",
    })
  } catch (error) {
    console.error("[v0] Error testing notification:", error)
    return NextResponse.json({ error: "فشل في اختبار الإشعار" }, { status: 500 })
  }
}

