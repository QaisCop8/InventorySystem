import { type NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureChatTables, getChatContacts } from "@/lib/chat"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    await ensureChatTables(await resolveCurrentDbName())
    const contacts = await getChatContacts(user.user_id)

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error("[chat/contacts] Error:", error)
    return NextResponse.json({ error: "فشل في جلب جهات الاتصال" }, { status: 500 })
  }
}
