import twilio from "twilio"

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER

if (!accountSid || !authToken || !whatsappNumber) {
  console.warn("[v0] Twilio credentials not configured. WhatsApp notifications will not work.")
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null

export interface WhatsAppMessage {
  to: string
  body: string
}

export async function sendSMS(phone: string, message: string): Promise<{
  success: boolean
  sid?: string
  error?: string
}> {
  if (!client) {
    return {
      success: false,
      error: "Twilio client not initialized. Check environment variables.",
    }
  }

  try {
    const twilioMessage = await client.messages.create({
      from: whatsappNumber || "",
      to: phone,
      body: message,
    })

    return {
      success: true,
      sid: twilioMessage.sid,
    }
  } catch (error) {
    console.error("[v0] Error sending SMS:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function sendWhatsApp(phone: string, message: string): Promise<{
  success: boolean
  sid?: string
  error?: string
}> {
  return sendWhatsAppMessage({ to: phone, body: message })
}

export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  if (!client) {
    return {
      success: false,
      error: "Twilio client not initialized. Check environment variables.",
    }
  }

  try {
    // Ensure the 'to' number is in WhatsApp format
    const toNumber = message.to.startsWith("whatsapp:") ? message.to : `whatsapp:${message.to}`
    const fromNumber = whatsappNumber!.startsWith("whatsapp:") ? whatsappNumber! : `whatsapp:${whatsappNumber}`

    const twilioMessage = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: message.body,
    })

    console.log("[v0] WhatsApp message sent successfully:", twilioMessage.sid)

    return {
      success: true,
      messageId: twilioMessage.sid,
    }
  } catch (error) {
    console.error("[v0] Error sending WhatsApp message:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    }
  }
}

export async function sendBulkWhatsAppMessages(messages: WhatsAppMessage[]): Promise<{
  success: boolean
  sent: number
  failed: number
  results: Array<{ to: string; success: boolean; messageId?: string; error?: string }>
}> {
  const results = await Promise.all(messages.map((msg) => sendWhatsAppMessage(msg)))

  const sent = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  return {
    success: sent > 0,
    sent,
    failed,
    results: messages.map((msg, index) => ({
      to: msg.to,
      ...results[index],
    })),
  }
}

export function formatReorderNotificationMessage(data: {
  product_name: string
  product_code: string
  current_stock: number
  reorder_point: number
  supplier_name?: string
}): string {
  const { product_name, product_code, current_stock, reorder_point, supplier_name } = data

  let message = `🔔 *تنبيه إعادة طلب*\n\n`
  message += `📦 *المنتج:* ${product_name}\n`
  message += `🔢 *الكود:* ${product_code}\n`
  message += `📊 *المخزون الحالي:* ${current_stock}\n`
  message += `⚠️ *نقطة إعادة الطلب:* ${reorder_point}\n`

  if (supplier_name) {
    message += `🏢 *المورد:* ${supplier_name}\n`
  }

  message += `\n⏰ *الوقت:* ${new Date().toLocaleString("ar-SA")}\n`
  message += `\n✅ يرجى اتخاذ الإجراء اللازم لإعادة طلب هذا المنتج.`

  return message
}
