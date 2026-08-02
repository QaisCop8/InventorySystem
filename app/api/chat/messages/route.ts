import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureChatTables } from "@/lib/chat"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const withUserId = searchParams.get("with")
    if (!withUserId) {
      return NextResponse.json({ error: "معرف المستخدم الآخر مطلوب" }, { status: 400 })
    }
    const afterIdParam = searchParams.get("after_id")
    const afterId = afterIdParam ? Number.parseInt(afterIdParam, 10) : null

    await ensureChatTables(await resolveCurrentDbName())

    const messages = afterId
      ? await sql`
          SELECT id, sender_id, receiver_id, body, is_read, created_at
          FROM chat_messages
          WHERE ((sender_id = ${user.user_id} AND receiver_id = ${withUserId})
              OR (sender_id = ${withUserId} AND receiver_id = ${user.user_id}))
            AND id > ${afterId}
          ORDER BY id ASC
        `
      : await sql`
          SELECT id, sender_id, receiver_id, body, is_read, created_at
          FROM chat_messages
          WHERE (sender_id = ${user.user_id} AND receiver_id = ${withUserId})
             OR (sender_id = ${withUserId} AND receiver_id = ${user.user_id})
          ORDER BY id DESC
          LIMIT 200
        `

    if (!afterId) messages.reverse()

    // فتح/متابعة استطلاع المحادثة يعني قراءتها — يُحدَّث فوراً هنا بدل مسار PATCH منفصل.
    await sql`
      UPDATE chat_messages SET is_read = true
      WHERE receiver_id = ${user.user_id} AND sender_id = ${withUserId} AND is_read = false
    `

    return NextResponse.json({ messages })
  } catch (error) {
    console.error("[chat/messages] GET error:", error)
    return NextResponse.json({ error: "فشل في جلب الرسائل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }

    const { to, body } = await request.json()
    const text = typeof body === "string" ? body.trim() : ""
    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "المستلم مطلوب" }, { status: 400 })
    }
    if (!text) {
      return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 })
    }
    if (to === user.user_id) {
      return NextResponse.json({ error: "لا يمكن إرسال رسالة لنفسك" }, { status: 400 })
    }

    await ensureChatTables(await resolveCurrentDbName())

    const recipient = await sql`SELECT user_id FROM user_settings WHERE user_id = ${to} AND is_active = true`
    if (recipient.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 })
    }

    const inserted = await sql`
      INSERT INTO chat_messages (sender_id, receiver_id, body)
      VALUES (${user.user_id}, ${to}, ${text})
      RETURNING id, sender_id, receiver_id, body, is_read, created_at
    `

    return NextResponse.json({ message: inserted[0] })
  } catch (error) {
    console.error("[chat/messages] POST error:", error)
    return NextResponse.json({ error: "فشل في إرسال الرسالة" }, { status: 500 })
  }
}
