import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { sendNotification } from "@/lib/notification-service"

// POST - إرسال إشعار لعميل معين
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customer_id, order_id, status, message } = body

    console.log("[v0] Sending notification:", { customer_id, order_id, status })

    // التحقق من البيانات المطلوبة
    if (!customer_id || !order_id || !status) {
      return NextResponse.json({ error: "البيانات المطلوبة غير مكتملة" }, { status: 400 })
    }

    // جلب إعدادات الإشعارات للعميل
    const settings = await sql`
      SELECT * FROM customer_notification_settings
      WHERE customer_id = ${customer_id}
      AND is_active = true
      LIMIT 1
    `

    if (settings.length === 0) {
      console.log("[v0] No active notification settings found for customer:", customer_id)
      return NextResponse.json({
        success: false,
        message: "لا توجد إعدادات إشعارات مفعلة لهذا العميل",
      })
    }

    const notificationSettings = settings[0]

    // التحقق من تفعيل الإشعار لهذه الحالة
    const statusFieldMap: Record<string, string> = {
      received: "notify_on_received",
      preparing: "notify_on_preparing",
      quality_check: "notify_on_quality_check",
      ready_to_ship: "notify_on_ready_to_ship",
      shipped: "notify_on_shipped",
      delivered: "notify_on_delivered",
      cancelled: "notify_on_cancelled",
    }

    const statusField = statusFieldMap[status]
    if (!statusField || !notificationSettings[statusField]) {
      console.log("[v0] Notification disabled for status:", status)
      return NextResponse.json({
        success: false,
        message: "الإشعار معطل لهذه الحالة",
      })
    }

    // جلب معلومات العميل
    const customers = await sql`
      SELECT name, mobile1, whatsapp1
      FROM customers
      WHERE id = ${customer_id}
      LIMIT 1
    `

    if (customers.length === 0) {
      return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 })
    }

    const customer = customers[0]

    // تحديد رقم الهاتف المستخدم
    const phoneNumber = notificationSettings.preferred_phone || customer.mobile1

    if (!phoneNumber) {
      return NextResponse.json({ error: "لا يوجد رقم هاتف للعميل" }, { status: 400 })
    }

    // إنشاء رسالة الإشعار
    const notificationMessage = message || generateNotificationMessage(status, order_id, customer.name)

    const sendResults = await sendNotification({
      phoneNumber,
      message: notificationMessage,
      method: notificationSettings.notification_method,
    })

    console.log("[v0] Send results:", sendResults)

    // تحديد حالة الإرسال
    const allSuccess = sendResults.every((result) => result.success)
    const deliveryStatus = allSuccess ? "sent" : "failed"

    // تسجيل الإشعار في قاعدة البيانات
    const notification = await sql`
      INSERT INTO customer_notifications (
        customer_id,
        order_id,
        notification_type,
        message,
        phone_number,
        delivery_method,
        status,
        sent_at,
        error_message
      ) VALUES (
        ${customer_id},
        ${order_id},
        ${status},
        ${notificationMessage},
        ${phoneNumber},
        ${notificationSettings.notification_method},
        ${deliveryStatus},
        ${allSuccess ? new Date().toISOString() : null},
        ${
          allSuccess
            ? null
            : sendResults
                .map((r) => r.error)
                .filter(Boolean)
                .join(", ")
        }
      )
      RETURNING *
    `

    console.log("[v0] Notification logged:", notification[0])

    return NextResponse.json({
      success: allSuccess,
      notification: notification[0],
      sendResults,
      message: allSuccess ? "تم إرسال الإشعار بنجاح" : "فشل في إرسال الإشعار",
    })
  } catch (error) {
    console.error("[v0] Error sending notification:", error)
    return NextResponse.json({ error: "فشل في إرسال الإشعار" }, { status: 500 })
  }
}

// دالة مساعدة لتوليد رسالة الإشعار
function generateNotificationMessage(status: string, orderId: number, customerName: string): string {
  const messages: Record<string, string> = {
    received: `عزيزي ${customerName}، تم استلام طلبيتك رقم ${orderId} بنجاح. سنبدأ في تحضيرها قريباً.`,
    preparing: `عزيزي ${customerName}، طلبيتك رقم ${orderId} قيد التحضير الآن.`,
    quality_check: `عزيزي ${customerName}، طلبيتك رقم ${orderId} في مرحلة التدقيق والمراجعة.`,
    ready_to_ship: `عزيزي ${customerName}، طلبيتك رقم ${orderId} جاهزة للشحن.`,
    shipped: `عزيزي ${customerName}، تم شحن طلبيتك رقم ${orderId}. ستصلك قريباً.`,
    delivered: `عزيزي ${customerName}، تم تسليم طلبيتك رقم ${orderId} بنجاح. نشكرك على ثقتك.`,
    cancelled: `عزيزي ${customerName}، تم إلغاء طلبيتك رقم ${orderId}. للاستفسار يرجى التواصل معنا.`,
  }

  return messages[status] || `تحديث على طلبيتك رقم ${orderId}`
}
