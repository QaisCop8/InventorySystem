import { type NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureChatTables, getUnreadChatCount, getLatestUnreadMessage } from "@/lib/chat"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    await ensureChatTables(await resolveCurrentDbName())
    const [count, latest] = await Promise.all([
      getUnreadChatCount(user.user_id),
      getLatestUnreadMessage(user.user_id),
    ])

    return NextResponse.json({ count, latest })
  } catch (error) {
    console.error("[chat/unread-count] Error:", error)
    return NextResponse.json({ error: "فشل في جلب عدد الرسائل غير المقروءة" }, { status: 500 })
  }
}
