import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// GET - جلب سجل الإشعارات لعميل معين
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")
    const orderId = searchParams.get("orderId")
    const limit = searchParams.get("limit") || "50"

    console.log("[v0] Fetching notification history:", { customerId, orderId, limit })

    let notifications

    if (orderId) {
      // جلب إشعارات طلبية معينة
      notifications = await sql`
        SELECT 
          n.*,
          o.order_number
        FROM customer_notifications n
        LEFT JOIN orders o ON n.order_id = o.id
        WHERE n.order_id = ${orderId}
        ORDER BY n.created_at DESC
        LIMIT ${Number.parseInt(limit)}
      `
    } else if (customerId) {
      // جلب إشعارات عميل معين
      notifications = await sql`
        SELECT 
          n.*,
          o.order_number
        FROM customer_notifications n
        LEFT JOIN orders o ON n.order_id = o.id
        WHERE n.customer_id = ${customerId}
        ORDER BY n.created_at DESC
        LIMIT ${Number.parseInt(limit)}
      `
    } else {
      return NextResponse.json({ error: "معرف العميل أو الطلبية مطلوب" }, { status: 400 })
    }

    console.log("[v0] Notifications found:", notifications.length)

    return NextResponse.json({
      notifications,
      count: notifications.length,
    })
  } catch (error) {
    console.error("[v0] Error fetching notification history:", error)
    return NextResponse.json({ error: "فشل في جلب سجل الإشعارات" }, { status: 500 })
  }
}
