import sql from "@/lib/database"
// أنواع الرسائل
export type MessageType = "text" | "template" | "media" | "document" | "interactive"
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed"

// واجهة الرسالة
export interface WhatsAppMessage {
  id?: number
  recipient_phone: string
  recipient_name?: string
  message_type: MessageType
  message_content: string
  template_name?: string
  template_params?: Record<string, any>
  media_url?: string
  status: MessageStatus
  whatsapp_message_id?: string
  error_message?: string
  sent_at?: Date
  delivered_at?: Date
  read_at?: Date
  created_at?: Date
  updated_at?: Date
}

// واجهة القالب
export interface WhatsAppTemplate {
  id?: number
  template_code: string
  template_name: string
  template_category: string
  message_template: string
  language: string
  has_media: boolean
  media_type?: string
  button_type?: string
  is_active: boolean
}

// إعدادات الواتساب
interface WhatsAppConfig {
  apiUrl: string
  apiToken: string
  phoneNumberId: string
  businessAccountId: string
}

// الحصول على إعدادات الواتساب من قاعدة البيانات
async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  try {
    const settings = await sql`
      SELECT api_url, api_key, api_secret 
      FROM api_settings 
      WHERE api_name = 'WhatsApp Business' AND is_enabled = true
    `

    if (!settings.length) {
      console.error("[WhatsApp] WhatsApp integration is not configured or disabled")
      return null
    }

    const config = settings[0]
    return {
      apiUrl: config.api_url || "https://graph.facebook.com/v18.0",
      apiToken: config.api_key || "",
      phoneNumberId: config.api_secret || "",
      businessAccountId: "",
    }
  } catch (error) {
    console.error("[WhatsApp] Error fetching config:", error)
    return null
  }
}

// تنسيق رقم الهاتف (إزالة الرموز والمسافات)
export function formatPhoneNumber(phone: string): string {
  // إزالة جميع الرموز والمسافات
  let formatted = phone.replace(/[^\d+]/g, "")

  // إذا كان الرقم يبدأ بـ 0، استبدله برمز الدولة
  if (formatted.startsWith("0")) {
    formatted = "+970" + formatted.substring(1)
  }

  // إذا لم يبدأ بـ +، أضف رمز الدولة الافتراضي
  if (!formatted.startsWith("+")) {
    formatted = "+970" + formatted
  }

  return formatted
}

// التحقق من صحة رقم الهاتف
export function validatePhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone)
  // يجب أن يبدأ بـ + ويحتوي على 10-15 رقم
  return /^\+\d{10,15}$/.test(formatted)
}

// إرسال رسالة نصية بسيطة
export async function sendTextMessage(
  phone: string,
  message: string,
  recipientName?: string,
): Promise<WhatsAppMessage> {
  try {
    const config = await getWhatsAppConfig()

    if (!config || !config.apiToken) {
      throw new Error("WhatsApp is not configured. Please configure it in Settings.")
    }

    const formattedPhone = formatPhoneNumber(phone)

    if (!validatePhoneNumber(formattedPhone)) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    // حفظ الرسالة في قاعدة البيانات أولاً
    const messageRecord = await saveMessage({
      recipient_phone: formattedPhone,
      recipient_name: recipientName,
      message_type: "text",
      message_content: message,
      status: "pending",
    })

    // إرسال الرسالة عبر WhatsApp Business API
    const response = await fetch(`${config.apiUrl}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || "Failed to send WhatsApp message")
    }

    // تحديث حالة الرسالة
    const updatedMessage = await updateMessageStatus(messageRecord.id!, "sent", result.messages?.[0]?.id)

    return updatedMessage
  } catch (error) {
    console.error("[WhatsApp] Error sending text message:", error)
    throw error
  }
}

// إرسال رسالة من قالب
export async function sendTemplateMessage(
  phone: string,
  templateCode: string,
  variables: Record<string, any>,
  recipientName?: string,
): Promise<WhatsAppMessage> {
  try {
    const config = await getWhatsAppConfig()

    if (!config || !config.apiToken) {
      throw new Error("WhatsApp is not configured")
    }

    const formattedPhone = formatPhoneNumber(phone)

    if (!validatePhoneNumber(formattedPhone)) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    // الحصول على القالب
    const template = await getTemplate(templateCode)

    if (!template) {
      throw new Error(`Template ${templateCode} not found`)
    }

    // استبدال المتغيرات في القالب
    let message = template.message_template
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`
      message = message.replace(new RegExp(placeholder, "g"), String(value))
    })

    // حفظ الرسالة
    const messageRecord = await saveMessage({
      recipient_phone: formattedPhone,
      recipient_name: recipientName,
      message_type: "template",
      message_content: message,
      template_name: templateCode,
      template_params: variables,
      status: "pending",
    })

    // إرسال الرسالة
    const response = await fetch(`${config.apiUrl}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
          name: templateCode,
          language: {
            code: template.language || "ar",
          },
          components: [
            {
              type: "body",
              parameters: Object.values(variables).map((value) => ({
                type: "text",
                text: String(value),
              })),
            },
          ],
        },
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || "Failed to send template message")
    }

    const updatedMessage = await updateMessageStatus(messageRecord.id!, "sent", result.messages?.[0]?.id)

    return updatedMessage
  } catch (error) {
    console.error("[WhatsApp] Error sending template message:", error)
    throw error
  }
}

// إرسال رسالة مع ملف مرفق
export async function sendMediaMessage(
  phone: string,
  message: string,
  mediaUrl: string,
  mediaType: "image" | "document" | "video" | "audio",
  recipientName?: string,
): Promise<WhatsAppMessage> {
  try {
    const config = await getWhatsAppConfig()

    if (!config || !config.apiToken) {
      throw new Error("WhatsApp is not configured")
    }

    const formattedPhone = formatPhoneNumber(phone)

    if (!validatePhoneNumber(formattedPhone)) {
      throw new Error(`Invalid phone number: ${phone}`)
    }

    const messageRecord = await saveMessage({
      recipient_phone: formattedPhone,
      recipient_name: recipientName,
      message_type: "media",
      message_content: message,
      media_url: mediaUrl,
      status: "pending",
    })

    const response = await fetch(`${config.apiUrl}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: mediaType,
        [mediaType]: {
          link: mediaUrl,
          caption: message,
        },
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || "Failed to send media message")
    }

    const updatedMessage = await updateMessageStatus(messageRecord.id!, "sent", result.messages?.[0]?.id)

    return updatedMessage
  } catch (error) {
    console.error("[WhatsApp] Error sending media message:", error)
    throw error
  }
}

// حفظ رسالة في قاعدة البيانات
async function saveMessage(message: Omit<WhatsAppMessage, "id">): Promise<WhatsAppMessage> {
  try {
    const result = await sql`
      INSERT INTO whatsapp_messages (
        recipient_phone, recipient_name, message_type, message_content,
        template_name, template_params, media_url, status
      ) VALUES (
        ${message.recipient_phone}, ${message.recipient_name || null},
        ${message.message_type}, ${message.message_content},
        ${message.template_name || null}, ${JSON.stringify(message.template_params || {})},
        ${message.media_url || null}, ${message.status}
      )
      RETURNING *
    `

    return result[0] as WhatsAppMessage
  } catch (error) {
    console.error("[WhatsApp] Error saving message:", error)
    throw error
  }
}

// تحديث حالة الرسالة
async function updateMessageStatus(
  messageId: number,
  status: MessageStatus,
  whatsappMessageId?: string,
  errorMessage?: string,
): Promise<WhatsAppMessage> {
  try {
    const updates: any = {
      status,
      updated_at: new Date(),
    }

    if (whatsappMessageId) {
      updates.whatsapp_message_id = whatsappMessageId
    }

    if (status === "sent") {
      updates.sent_at = new Date()
    } else if (status === "delivered") {
      updates.delivered_at = new Date()
    } else if (status === "read") {
      updates.read_at = new Date()
    } else if (status === "failed") {
      updates.error_message = errorMessage
    }

    const result = await sql`
      UPDATE whatsapp_messages 
      SET 
        status = ${updates.status},
        whatsapp_message_id = ${updates.whatsapp_message_id || null},
        sent_at = ${updates.sent_at || null},
        delivered_at = ${updates.delivered_at || null},
        read_at = ${updates.read_at || null},
        error_message = ${updates.error_message || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${messageId}
      RETURNING *
    `

    return result[0] as WhatsAppMessage
  } catch (error) {
    console.error("[WhatsApp] Error updating message status:", error)
    throw error
  }
}

// الحصول على قالب رسالة
async function getTemplate(templateCode: string): Promise<WhatsAppTemplate | null> {
  try {
    const result = await sql`
      SELECT * FROM whatsapp_templates 
      WHERE template_code = ${templateCode} AND is_active = true
    `

    return result.length > 0 ? (result[0] as WhatsAppTemplate) : null
  } catch (error) {
    console.error("[WhatsApp] Error fetching template:", error)
    return null
  }
}

// الحصول على جميع القوالب
export async function getAllTemplates(): Promise<WhatsAppTemplate[]> {
  try {
    const result = await sql`
      SELECT * FROM whatsapp_templates 
      WHERE is_active = true
      ORDER BY template_category, template_name
    `

    return result as WhatsAppTemplate[]
  } catch (error) {
    console.error("[WhatsApp] Error fetching templates:", error)
    return []
  }
}

// الحصول على سجل الرسائل
export async function getMessageHistory(
  phone?: string,
  limit = 50,
  offset = 0,
): Promise<{ messages: WhatsAppMessage[]; total: number }> {
  try {
    const whereClause = phone ? sql`WHERE recipient_phone = ${formatPhoneNumber(phone)}` : sql``

    const messages = await sql`
      SELECT * FROM whatsapp_messages 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const countResult = await sql`
      SELECT COUNT(*) as total FROM whatsapp_messages 
      ${whereClause}
    `

    return {
      messages: messages as WhatsAppMessage[],
      total: Number.parseInt(countResult[0].total),
    }
  } catch (error) {
    console.error("[WhatsApp] Error fetching message history:", error)
    return { messages: [], total: 0 }
  }
}

// معالجة webhook من WhatsApp (تحديثات حالة الرسائل)
export async function handleWebhook(payload: any): Promise<void> {
  try {
    console.log("[WhatsApp] Webhook received:", JSON.stringify(payload, null, 2))

    // التحقق من نوع الحدث
    if (payload.entry?.[0]?.changes?.[0]?.value?.statuses) {
      const statuses = payload.entry[0].changes[0].value.statuses

      for (const statusUpdate of statuses) {
        const whatsappMessageId = statusUpdate.id
        const status = statusUpdate.status // sent, delivered, read, failed

        // تحديث حالة الرسالة في قاعدة البيانات
        await sql`
          UPDATE whatsapp_messages 
          SET 
            status = ${status},
            ${status === "delivered" ? sql`delivered_at = CURRENT_TIMESTAMP,` : sql``}
            ${status === "read" ? sql`read_at = CURRENT_TIMESTAMP,` : sql``}
            ${status === "failed" ? sql`error_message = ${statusUpdate.errors?.[0]?.message || "Unknown error"},` : sql``}
            updated_at = CURRENT_TIMESTAMP
          WHERE whatsapp_message_id = ${whatsappMessageId}
        `
      }
    }

    // معالجة الرسائل الواردة من العملاء
    if (payload.entry?.[0]?.changes?.[0]?.value?.messages) {
      const messages = payload.entry[0].changes[0].value.messages

      for (const incomingMessage of messages) {
        console.log("[WhatsApp] Incoming message from customer:", incomingMessage)
        // هنا يمكن إضافة منطق معالجة الرسائل الواردة من العملاء
        // مثل: الرد التلقائي، توجيه الرسالة، حفظ الاستفسار، إلخ
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error handling webhook:", error)
    throw error
  }
}

// اختبار الاتصال بـ WhatsApp API
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const config = await getWhatsAppConfig()

    if (!config || !config.apiToken) {
      return {
        success: false,
        message: "WhatsApp is not configured. Please add API settings.",
      }
    }

    // محاولة الحصول على معلومات رقم الهاتف
    const response = await fetch(`${config.apiUrl}/${config.phoneNumberId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
    })

    if (response.ok) {
      return {
        success: true,
        message: "WhatsApp connection successful!",
      }
    } else {
      const error = await response.json()
      return {
        success: false,
        message: error.error?.message || "Failed to connect to WhatsApp API",
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Connection test failed:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
