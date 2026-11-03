import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { handleWebhook } from "@/lib/whatsapp-service"
import { handleCustomerMessage } from "@/lib/whatsapp-bot"

// التحقق من webhook (GET request من WhatsApp)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    console.log("[v0] WhatsApp webhook verification:", { mode, token })

    // التحقق من التوكن (يجب أن يكون مطابقاً للتوكن المحفوظ في الإعدادات)
    // بلا توكن افتراضي معروف: بدون WHATSAPP_VERIFY_TOKEN مضبوط يُرفض التحقق دائماً
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      console.log("[v0] WhatsApp webhook verified successfully")
      return new NextResponse(challenge, { status: 200 })
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 403 })
  } catch (error) {
    console.error("[v0] WhatsApp webhook verification error:", error)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}

// استقبال تحديثات من WhatsApp (POST request)
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    // مسار عام: توقيع Meta (X-Hub-Signature-256 = HMAC-SHA256 بسر التطبيق) يثبت أن الرسالة من واتساب فعلاً
    const appSecret = process.env.WHATSAPP_APP_SECRET
    if (appSecret) {
      const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
      const received = request.headers.get("x-hub-signature-256") || ""
      if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    } else {
      console.warn("[whatsapp webhook] WHATSAPP_APP_SECRET not set — signature not verified")
    }
    const body = JSON.parse(rawBody || "{}")

    // معالجة الـ webhook للتحديثات
    await handleWebhook(body)

    if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const messages = body.entry[0].changes[0].value.messages
      const contacts = body.entry[0].changes[0].value.contacts || []

      for (let i = 0; i < messages.length; i++) {
        const incomingMessage = messages[i]
        const contact = contacts[i]

        // استخراج معلومات الرسالة
        const customerPhone = incomingMessage.from
        const customerName = contact?.profile?.name
        const messageText = incomingMessage.text?.body || ""
        const messageType = incomingMessage.type

        console.log("[v0] Processing incoming message:", {
          phone: customerPhone,
          name: customerName,
          text: messageText,
          type: messageType,
        })

        // معالجة الرسائل النصية فقط
        if (messageType === "text" && messageText) {
          // معالجة رسالة العميل والرد عليها تلقائياً
          await handleCustomerMessage(customerPhone, messageText, customerName)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] WhatsApp webhook processing error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
