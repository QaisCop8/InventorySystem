import { type NextRequest, NextResponse } from "next/server"
import { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureChatTables, getConversation, getLastReadOwnMessageId, sendChatMessage } from "@/lib/chat"

// GET ?with=<user_id>&after_id=<id>: رسائل المحادثة (وفتحها يعلّمها مقروءة) + آخر رسالة لي قرأها الطرف الآخر
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const withUserId = searchParams.get("with")
    if (!withUserId) return NextResponse.json({ error: "معرف المستخدم الآخر مطلوب" }, { status: 400 })
    const afterId = Number.parseInt(searchParams.get("after_id") || "", 10) || null

    await ensureChatTables(await resolveCurrentDbName())
    const messages = await getConversation(user.user_id, withUserId, afterId)
    const lastReadId = await getLastReadOwnMessageId(user.user_id, withUserId)
    return NextResponse.json({ messages, lastReadId })
  } catch (error) {
    console.error("[chat/messages] GET error:", error)
    return NextResponse.json({ error: "فشل في جلب الرسائل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const { to, body } = await request.json().catch(() => ({}))
    const text = typeof body === "string" ? body.trim().slice(0, 4000) : ""
    const recipient = to == null ? "" : String(to)
    if (!recipient) return NextResponse.json({ error: "المستلم مطلوب" }, { status: 400 })
    if (!text) return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 })
    if (recipient === String(user.user_id)) return NextResponse.json({ error: "لا يمكن إرسال رسالة لنفسك" }, { status: 400 })

    await ensureChatTables(await resolveCurrentDbName())
    const message = await sendChatMessage(user.user_id, recipient, text)
    if (!message) return NextResponse.json({ error: "المستخدم غير موجود أو موقوف" }, { status: 404 })
    return NextResponse.json({ message })
  } catch (error) {
    console.error("[chat/messages] POST error:", error)
    return NextResponse.json({ error: "فشل في إرسال الرسالة" }, { status: 500 })
  }
}
