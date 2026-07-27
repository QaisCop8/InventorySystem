import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { sendNotification, generateDailySummaryMessage } from "@/lib/notification-service"

// POST - إرسال الملخص اليومي للعملاء
export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Starting daily summary notifications...")

    // جلب جميع العملاء الذين لديهم إعدادات ملخص يومي مفعلة
    const customers = await sql`
      SELECT 
        c.id,
        c.name,
        c.mobile1,
        cns.preferred_phone,
        cns.notification_method,
        cns.daily_summary_time
      FROM customers c
      INNER JOIN customer_notification_settings cns ON c.id = cns.customer_id
      WHERE cns.is_active = true
      AND cns.send_daily_summary = true
    `

    console.log("[v0] Found customers with daily summary enabled:", customers.length)

    const results = []

    for (const customer of customers) {
      try {
        // جلب طلبيات العميل لليوم الحالي
        const orders = await sql`
          SELECT 
            order_number,
            status
          FROM orders
          WHERE customer_id = ${customer.id}
          AND DATE(created_at) = CURRENT_DATE
          ORDER BY created_at DESC
        `

        if (orders.length === 0) {
          console.log("[v0] No orders today for customer:", customer.id)
          continue
        }

        // توليد رسالة الملخص
        const message = generateDailySummaryMessage(customer.name, orders)

        // تحديد رقم الهاتف
        const phoneNumber = customer.preferred_phone || customer.mobile1

        if (!phoneNumber) {
          console.log("[v0] No phone number for customer:", customer.id)
          continue
        }

        // إرسال الإشعار
        const sendResults = await sendNotification({
          phoneNumber,
          message,
          method: customer.notification_method,
        })

        const allSuccess = sendResults.every((result) => result.success)

        // تسجيل الإشعار
        await sql`
          INSERT INTO customer_notifications (
            customer_id,
            notification_type,
            message,
            phone_number,
            delivery_method,
            status,
            sent_at,
            error_message
          ) VALUES (
            ${customer.id},
            'daily_summary',
            ${message},
            ${phoneNumber},
            ${customer.notification_method},
            ${allSuccess ? "sent" : "failed"},
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
        `

        results.push({
          customerId: customer.id,
          customerName: customer.name,
          success: allSuccess,
          ordersCount: orders.length,
        })

        console.log("[v0] Daily summary sent to customer:", customer.id, "Success:", allSuccess)
      } catch (error) {
        console.error("[v0] Error sending daily summary to customer:", customer.id, error)
        results.push({
          customerId: customer.id,
          customerName: customer.name,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "تم إرسال الملخصات اليومية",
      results,
      totalCustomers: customers.length,
      successCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
    })
  } catch (error) {
    console.error("[v0] Error in daily summary job:", error)
    return NextResponse.json({ error: "فشل في إرسال الملخصات اليومية" }, { status: 500 })
  }
}
