import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { createNotificationFromTemplate } from "@/lib/notifications"

export async function POST(request: NextRequest) {
  try {
    const { orderType, orderId, newStatus, reason, changedBy } = await request.json()

    // الحصول على الحالة الحالية
    const table = orderType === "sales" ? "sales_orders" : "purchase_orders"
    const [currentOrder] = await sql`
      SELECT workflow_status, order_number, total_amount, customer_id FROM ${sql(table)} WHERE id = ${orderId}
    `

    if (!currentOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // تحديث حالة الطلبية
    await sql`
      UPDATE ${sql(table)} 
      SET workflow_status = ${newStatus}
      WHERE id = ${orderId}
    `

    // إضافة سجل في تاريخ التغييرات
    await sql`
      INSERT INTO workflow_history (
        order_type, order_id, order_number, previous_status, 
        new_status, changed_by, change_reason
      ) VALUES (
        ${orderType}, ${orderId}, ${currentOrder.order_number}, 
        ${currentOrder.workflow_status}, ${newStatus}, ${changedBy}, ${reason}
      )
    `

    try {
      await createNotificationFromTemplate(
        "ORDER_STATUS_CHANGED",
        {
          order_number: currentOrder.order_number,
          old_status: currentOrder.workflow_status,
          new_status: newStatus,
          changed_by: changedBy,
          reason: reason || "لا يوجد سبب محدد",
          total_amount:
            currentOrder.total_amount?.toLocaleString("ar-SA", {
              style: "currency",
              currency: "SAR",
            }) || "غير محدد",
        },
        {
          role: "manager", // Send to managers
        },
        {
          order_id: orderId,
          order_type: orderType,
          order_number: currentOrder.order_number,
        },
      )
    } catch (notificationError) {
      console.error("Error creating status change notification:", notificationError)
      // Don't fail the status update if notification fails
    }

    if (orderType === "sales" && currentOrder.customer_id) {
      try {
        const notificationStatus = mapWorkflowStatusToNotification(newStatus)

        if (notificationStatus) {
          await fetch(`${request.nextUrl.origin}/api/customer-notifications/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_id: currentOrder.customer_id,
              order_id: orderId,
              status: notificationStatus,
            }),
          })

          console.log("[v0] Customer notification sent for order:", currentOrder.order_number)
        }
      } catch (customerNotificationError) {
        console.error("[v0] Error sending customer notification:", customerNotificationError)
        // Don't fail the status update if customer notification fails
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating order status:", error)
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 })
  }
}

function mapWorkflowStatusToNotification(workflowStatus: string): string | null {
  const statusMap: Record<string, string> = {
    pending: "received",
    approved: "preparing",
    in_progress: "preparing",
    quality_check: "quality_check",
    ready_to_ship: "ready_to_ship",
    shipped: "shipped",
    delivered: "delivered",
    completed: "delivered",
    cancelled: "cancelled",
    rejected: "cancelled",
  }

  return statusMap[workflowStatus] || null
}
