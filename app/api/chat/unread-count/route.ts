import { type NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { chatHeartbeat, ensureChatTables } from "@/lib/chat"

// استطلاع الفقاعة: يحدّث "آخر ظهور" للمستخدم ويعيد إجمالي غير المقروء وأحدث رسالة غير مقروءة
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureChatTables(await resolveCurrentDbName())
    return NextResponse.json(await chatHeartbeat(user.user_id))
  } catch (error) {
    console.error("[chat/unread-count] Error:", error)
    return NextResponse.json({ error: "فشل في جلب عدد الرسائل غير المقروءة" }, { status: 500 })
  }
}
