import sql from "@/lib/database"
import { sendTemplateMessage, sendTextMessage } from "./whatsapp-service"

// (كان يُنشئ عميل neon() خاصاً به دوماً بصرف النظر عن كون DATABASE_URL يشير لخادم Postgres محلي —
// عميل neon يتواصل عبر HTTP فقط، فيفشل بـ"fetch failed" حِيال أي قاعدة محلية. الاستيراد من
// lib/database.ts يُحيل لنفس منطق التبديل pg/neon المستخدَم بباقي المشروع.)

export interface Notification {
  id: number
  notification_type: string
  title: string
  message: string
  recipient_user_id?: number
  recipient_department?: string
  recipient_role?: string
  related_order_id?: number
  related_order_type?: string
  related_order_number?: string
  stage_id?: number
  priority_level: "low" | "normal" | "high" | "urgent"
  is_read: boolean
  is_sent: boolean
  send_email: boolean
  send_sms: boolean
  send_whatsapp: boolean
  scheduled_send_time?: Date
  sent_at?: Date
  read_at?: Date
  created_at: Date
  updated_at: Date
}

export interface NotificationTemplate {
  id: number
  template_code: string
  template_name: string
  notification_type: string
  title_template: string
  message_template: string
  default_priority: string
  send_email: boolean
  send_sms: boolean
  send_whatsapp: boolean
  is_active: boolean
}

export interface NotificationRule {
  id: number
  rule_name: string
  rule_type: string
  trigger_condition: string
  target_stage_id?: number
  target_department?: string
  target_role?: string
  hours_delay: number
  template_code: string
  is_active: boolean
}

// إنشاء تنبيه جديد
export async function createNotification(data: {
  notification_type: string
  title: string
  message: string
  recipient_user_id?: number
  recipient_department?: string
  recipient_role?: string
  related_order_id?: number
  related_order_type?: string
  related_order_number?: string
  stage_id?: number
  priority_level?: "low" | "normal" | "high" | "urgent"
  send_email?: boolean
  send_sms?: boolean
  send_whatsapp?: boolean
  scheduled_send_time?: Date
}) {
  try {
    const result = await sql`
      INSERT INTO notifications (
        notification_type, title, message, recipient_user_id,
        recipient_department, recipient_role, related_order_id,
        related_order_type, related_order_number, stage_id,
        priority_level, send_email, send_sms, send_whatsapp,
        scheduled_send_time
      ) VALUES (
        ${data.notification_type}, ${data.title}, ${data.message},
        ${data.recipient_user_id || null}, ${data.recipient_department || null},
        ${data.recipient_role || null}, ${data.related_order_id || null},
        ${data.related_order_type || null}, ${data.related_order_number || null},
        ${data.stage_id || null}, ${data.priority_level || "normal"},
        ${data.send_email || false}, ${data.send_sms || false},
        ${data.send_whatsapp || false}, ${data.scheduled_send_time || null}
      )
      RETURNING *
    `

    const notification = result[0] as Notification

    if (data.send_whatsapp && data.related_order_id && data.related_order_type) {
      await sendWhatsAppNotification(notification)
    }

    return notification
  } catch (error) {
    console.error("Error creating notification:", error)
    throw error
  }
}

// إنشاء تنبيه من قالب
export async function createNotificationFromTemplate(
  templateCode: string,
  variables: Record<string, any>,
  recipients: {
    user_id?: number
    department?: string
    role?: string
  },
  orderData?: {
    order_id: number
    order_type: string
    order_number: string
    stage_id?: number
  },
) {
  try {
    // الحصول على القالب
    const template = await sql`
      SELECT * FROM notification_templates 
      WHERE template_code = ${templateCode} AND is_active = true
    `

    if (!template.length) {
      throw new Error(`Template ${templateCode} not found`)
    }

    const tmpl = template[0] as NotificationTemplate

    // استبدال المتغيرات في القالب
    let title = tmpl.title_template
    let message = tmpl.message_template

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`
      title = title.replace(new RegExp(placeholder, "g"), String(value))
      message = message.replace(new RegExp(placeholder, "g"), String(value))
    })

    // إنشاء التنبيه
    return await createNotification({
      notification_type: tmpl.notification_type,
      title,
      message,
      recipient_user_id: recipients.user_id,
      recipient_department: recipients.department,
      recipient_role: recipients.role,
      related_order_id: orderData?.order_id,
      related_order_type: orderData?.order_type,
      related_order_number: orderData?.order_number,
      stage_id: orderData?.stage_id,
      priority_level: tmpl.default_priority as any,
      send_email: tmpl.send_email,
      send_sms: tmpl.send_sms,
      send_whatsapp: tmpl.send_whatsapp,
    })
  } catch (error) {
    console.error("Error creating notification from template:", error)
    throw error
  }
}

// إنشاء تنبيه تقدم الطلبية
export async function createOrderAdvanceNotification(
  orderId: number,
  orderType: "sales" | "purchase",
  orderNumber: string,
  fromStageName: string,
  toStageName: string,
  toStageId: number,
  totalAmount: number,
  performedBy: string,
) {
  try {
    // الحصول على القسم المسؤول عن المرحلة الجديدة
    const stageDepartments = await sql`
      SELECT DISTINCT assigned_to_department 
      FROM workflow_stage_departments 
      WHERE stage_id = ${toStageId} AND is_active = true
    `

    // إنشاء تنبيه لكل قسم مسؤول
    const notifications = []
    for (const dept of stageDepartments) {
      const notification = await createNotificationFromTemplate(
        "ORDER_ASSIGNED",
        {
          order_number: orderNumber,
          from_stage: fromStageName,
          to_stage: toStageName,
          stage_name: toStageName,
          total_amount: totalAmount.toLocaleString("ar-SA", {
            style: "currency",
            currency: "SAR",
          }),
          performed_by: performedBy,
        },
        {
          department: dept.assigned_to_department,
        },
        {
          order_id: orderId,
          order_type: orderType,
          order_number: orderNumber,
          stage_id: toStageId,
        },
      )
      notifications.push(notification)
    }

    await sendOrderStatusUpdateToCustomer(orderId, orderType, orderNumber, toStageName)

    return notifications
  } catch (error) {
    console.error("Error creating order advance notification:", error)
    throw error
  }
}

// إنشاء تنبيه رفض الطلبية
export async function createOrderRejectionNotification(
  orderId: number,
  orderType: "sales" | "purchase",
  orderNumber: string,
  stageName: string,
  stageId: number,
  reason: string,
  performedBy: string,
  performedByDepartment: string,
) {
  try {
    return await createNotificationFromTemplate(
      "ORDER_REJECTED",
      {
        order_number: orderNumber,
        stage_name: stageName,
        reason: reason,
        performed_by: performedBy,
      },
      {
        department: performedByDepartment,
      },
      {
        order_id: orderId,
        order_type: orderType,
        order_number: orderNumber,
        stage_id: stageId,
      },
    )
  } catch (error) {
    console.error("Error creating order rejection notification:", error)
    throw error
  }
}

// فحص الطلبيات المتأخرة وإنشاء تنبيهات
export async function checkOverdueOrdersAndNotify() {
  try {
    // الحصول على الطلبيات المتأخرة (أكثر من 24 ساعة في نفس المرحلة)
    const overdueOrders = await sql`
      SELECT 
        ows.*,
        ws.stage_name,
        ws.max_duration_hours,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 as hours_in_stage,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.customer_name
          WHEN ows.order_type = 'purchase' THEN po.supplier_name
        END as partner_name,
        CASE 
          WHEN ows.order_type = 'sales' THEN so.total_amount
          WHEN ows.order_type = 'purchase' THEN po.total_amount
        END as total_amount
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      LEFT JOIN sales_orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
      LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
      WHERE 
        ows.is_overdue = false
        AND (
          (ws.max_duration_hours IS NOT NULL AND 
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 > ws.max_duration_hours)
          OR
          (ws.max_duration_hours IS NULL AND 
           EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600 > 24)
        )
    `

    const notifications = []
    for (const order of overdueOrders) {
      // تحديث حالة الطلبية كمتأخرة
      await sql`
        UPDATE order_workflow_status 
        SET is_overdue = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${order.id}
      `

      // إنشاء تنبيه التأخير
      const notification = await createNotificationFromTemplate(
        "ORDER_OVERDUE",
        {
          order_number: order.order_number,
          stage_name: order.stage_name,
          hours_overdue: Math.floor(order.hours_in_stage),
          partner_name: order.partner_name,
          total_amount:
            order.total_amount?.toLocaleString("ar-SA", {
              style: "currency",
              currency: "SAR",
            }) || "غير محدد",
        },
        {
          department: order.assigned_to_department,
        },
        {
          order_id: order.order_id,
          order_type: order.order_type,
          order_number: order.order_number,
          stage_id: order.current_stage_id,
        },
      )
      notifications.push(notification)
    }

    return notifications
  } catch (error) {
    console.error("Error checking overdue orders:", error)
    throw error
  }
}

// الحصول على التنبيهات للمستخدم أو القسم
function isNotificationsTableMissingError(error: any) {
  const message = String(error?.message || error)
  return /relation \"notifications\" does not exist|undefined_table/i.test(message)
}

export async function getNotifications(
  userId?: number,
  department?: string,
  limit = 50,
  offset = 0,
  unreadOnly = false,
) {
  try {
    const whereConditions = []
    const params: any[] = []

    if (userId) {
      whereConditions.push(`recipient_user_id = $${params.length + 1}`)
      params.push(userId)
    }

    if (department) {
      whereConditions.push(`recipient_department = $${params.length + 1}`)
      params.push(department)
    }

    if (unreadOnly) {
      whereConditions.push("is_read = false")
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : ""

    const query = `
      SELECT 
        n.*,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name
      FROM notifications n
      LEFT JOIN workflow_stages ws ON n.stage_id = ws.id
      ${whereClause}
      ORDER BY 
        CASE n.priority_level 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'normal' THEN 3 
          WHEN 'low' THEN 4 
        END,
        n.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `

    params.push(limit, offset)

    const result = await sql.unsafe(query, params)
    return result as Notification[]
  } catch (error) {
    if (isNotificationsTableMissingError(error)) {
      console.warn("Notifications table missing; returning empty list.")
      return []
    }
    console.error("Error fetching notifications:", error)
    throw error
  }
}

// تحديد التنبيه كمقروء
export async function markNotificationAsRead(notificationId: number) {
  try {
    const result = await sql`
      UPDATE notifications 
      SET is_read = true, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${notificationId}
      RETURNING *
    `
    return result[0] as Notification
  } catch (error) {
    console.error("Error marking notification as read:", error)
    throw error
  }
}

// تحديد جميع التنبيهات كمقروءة
export async function markAllNotificationsAsRead(userId?: number, department?: string) {
  try {
    const whereConditions = []
    const params: any[] = []

    if (userId) {
      whereConditions.push(`recipient_user_id = $${params.length + 1}`)
      params.push(userId)
    }

    if (department) {
      whereConditions.push(`recipient_department = $${params.length + 1}`)
      params.push(department)
    }

    whereConditions.push("is_read = false")

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`

    const query = `
      UPDATE notifications 
      SET is_read = true, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      ${whereClause}
    `

    await sql.unsafe(query, params)
    return true
  } catch (error) {
    console.error("Error marking all notifications as read:", error)
    throw error
  }
}

// الحصول على عدد التنبيهات غير المقروءة
export async function getUnreadNotificationCount(userId?: number, department?: string) {
  try {
    const whereConditions = ["is_read = false"]
    const params: any[] = []

    if (userId) {
      whereConditions.push(`recipient_user_id = $${params.length + 1}`)
      params.push(userId)
    }

    if (department) {
      whereConditions.push(`recipient_department = $${params.length + 1}`)
      params.push(department)
    }

    const whereClause = `WHERE ${whereConditions.join(" AND ")}`

    const query = `
      SELECT COUNT(*) as count
      FROM notifications 
      ${whereClause}
    `

    const result = await sql.unsafe(query, params)
    return result && result[0] ? Number.parseInt(result[0].count) : 0
  } catch (error) {
    if (isNotificationsTableMissingError(error)) {
      console.warn("Notifications table missing; returning unread count 0.")
      return 0
    }
    console.error("Error getting unread notification count:", error)
    return 0
  }
}

// حذف التنبيهات القديمة (أكثر من 30 يوم)
export async function cleanupOldNotifications(daysToKeep = 30) {
  try {
    const result = await sql`
      DELETE FROM notifications 
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'
      AND is_read = true
    `
    return result
  } catch (error) {
    console.error("Error cleaning up old notifications:", error)
    throw error
  }
}

async function sendWhatsAppNotification(notification: Notification): Promise<void> {
  try {
    // الحصول على معلومات العميل من الطلبية
    let customerInfo: { phone: string; name: string } | null = null

    if (notification.related_order_type === "sales" && notification.related_order_id) {
      const salesOrders = await sql`
        SELECT 
          c.customer_name,
          c.whatsapp1,
          c.mobile1
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        WHERE so.id = ${notification.related_order_id}
      `

      if (salesOrders.length > 0) {
        const order = salesOrders[0]
        customerInfo = {
          phone: order.whatsapp1 || order.mobile1,
          name: order.customer_name,
        }
      }
    } else if (notification.related_order_type === "purchase" && notification.related_order_id) {
      const purchaseOrders = await sql`
        SELECT 
          s.supplier_name,
          s.whatsapp1,
          s.mobile1
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.id = ${notification.related_order_id}
      `

      if (purchaseOrders.length > 0) {
        const order = purchaseOrders[0]
        customerInfo = {
          phone: order.whatsapp1 || order.mobile1,
          name: order.supplier_name,
        }
      }
    }

    if (!customerInfo || !customerInfo.phone) {
      console.log("[Notifications] No WhatsApp number found for notification:", notification.id)
      return
    }

    // إرسال الرسالة
    await sendTextMessage(customerInfo.phone, notification.message, customerInfo.name)

    console.log("[Notifications] WhatsApp notification sent successfully:", notification.id)
  } catch (error) {
    console.error("[Notifications] Error sending WhatsApp notification:", error)
  }
}

async function sendOrderStatusUpdateToCustomer(
  orderId: number,
  orderType: "sales" | "purchase",
  orderNumber: string,
  stageName: string,
): Promise<void> {
  try {
    let customerInfo: { phone: string; name: string } | null = null

    if (orderType === "sales") {
      const salesOrders = await sql`
        SELECT 
          c.customer_name,
          c.whatsapp1,
          c.mobile1
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        WHERE so.id = ${orderId}
      `

      if (salesOrders.length > 0) {
        const order = salesOrders[0]
        customerInfo = {
          phone: order.whatsapp1 || order.mobile1,
          name: order.customer_name,
        }
      }
    }

    if (!customerInfo || !customerInfo.phone) {
      console.log("[Notifications] No customer WhatsApp for order:", orderNumber)
      return
    }

    // إرسال رسالة تحديث الحالة
    await sendTemplateMessage(
      customerInfo.phone,
      "ORDER_STATUS_UPDATE",
      {
        customer_name: customerInfo.name,
        order_number: orderNumber,
        stage_name: stageName,
        additional_info: "سنقوم بإعلامك عند أي تحديث جديد.",
      },
      customerInfo.name,
    )

    console.log("[Notifications] Order status update sent to customer:", customerInfo.phone)
  } catch (error) {
    console.error("[Notifications] Error sending order status update:", error)
  }
}
