import sql from "@/lib/database"
import { sendTemplateMessage, sendTextMessage } from "./whatsapp-service"

// إرسال إشعار تأكيد الطلبية
export async function sendOrderConfirmation(orderId: number, orderType: "sales" | "purchase"): Promise<void> {
  try {
    if (orderType === "sales") {
      const orders = await sql`
        SELECT 
          so.order_number,
          so.total_amount,
          c.customer_name,
          c.whatsapp1,
          c.mobile1
        FROM sales_orders so
        JOIN customers c ON so.customer_id = c.id
        WHERE so.id = ${orderId}
      `

      if (orders.length > 0) {
        const order = orders[0]
        const phone = order.whatsapp1 || order.mobile1

        if (phone) {
          await sendTemplateMessage(
            phone,
            "ORDER_CONFIRMATION",
            {
              customer_name: order.customer_name,
              order_number: order.order_number,
              total_amount: Number(order.total_amount).toLocaleString("ar-SA", {
                style: "currency",
                currency: "SAR",
              }),
            },
            order.customer_name,
          )

          console.log("[WhatsApp] Order confirmation sent:", order.order_number)
        }
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending order confirmation:", error)
  }
}

// إرسال إشعار جاهزية الطلبية
export async function sendOrderReadyNotification(orderId: number): Promise<void> {
  try {
    const orders = await sql`
      SELECT 
        so.order_number,
        c.customer_name,
        c.whatsapp1,
        c.mobile1
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      WHERE so.id = ${orderId}
    `

    if (orders.length > 0) {
      const order = orders[0]
      const phone = order.whatsapp1 || order.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "ORDER_READY",
          {
            customer_name: order.customer_name,
            order_number: order.order_number,
          },
          order.customer_name,
        )

        console.log("[WhatsApp] Order ready notification sent:", order.order_number)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending order ready notification:", error)
  }
}

// إرسال إشعار توصيل الطلبية
export async function sendOrderDeliveredNotification(orderId: number): Promise<void> {
  try {
    const orders = await sql`
      SELECT 
        so.order_number,
        c.customer_name,
        c.whatsapp1,
        c.mobile1
      FROM sales_orders so
      JOIN customers c ON so.customer_id = c.id
      WHERE so.id = ${orderId}
    `

    if (orders.length > 0) {
      const order = orders[0]
      const phone = order.whatsapp1 || order.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "ORDER_DELIVERED",
          {
            customer_name: order.customer_name,
            order_number: order.order_number,
          },
          order.customer_name,
        )

        console.log("[WhatsApp] Order delivered notification sent:", order.order_number)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending order delivered notification:", error)
  }
}

// إرسال إشعار الفاتورة
export async function sendInvoiceNotification(
  customerId: number,
  invoiceNumber: string,
  totalAmount: number,
): Promise<void> {
  try {
    const customers = await sql`
      SELECT customer_name, whatsapp1, mobile1
      FROM customers
      WHERE id = ${customerId}
    `

    if (customers.length > 0) {
      const customer = customers[0]
      const phone = customer.whatsapp1 || customer.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "INVOICE_SENT",
          {
            customer_name: customer.customer_name,
            invoice_number: invoiceNumber,
            total_amount: totalAmount.toLocaleString("ar-SA", {
              style: "currency",
              currency: "SAR",
            }),
          },
          customer.customer_name,
        )

        console.log("[WhatsApp] Invoice notification sent:", invoiceNumber)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending invoice notification:", error)
  }
}

// إرسال تذكير بالدفع
export async function sendPaymentReminder(
  customerId: number,
  invoiceNumber: string,
  totalAmount: number,
  dueDate: Date,
): Promise<void> {
  try {
    const customers = await sql`
      SELECT customer_name, whatsapp1, mobile1
      FROM customers
      WHERE id = ${customerId}
    `

    if (customers.length > 0) {
      const customer = customers[0]
      const phone = customer.whatsapp1 || customer.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "PAYMENT_REMINDER",
          {
            customer_name: customer.customer_name,
            invoice_number: invoiceNumber,
            total_amount: totalAmount.toLocaleString("ar-SA", {
              style: "currency",
              currency: "SAR",
            }),
            due_date: dueDate.toLocaleDateString("ar-SA"),
          },
          customer.customer_name,
        )

        console.log("[WhatsApp] Payment reminder sent:", invoiceNumber)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending payment reminder:", error)
  }
}

// إرسال تأكيد استلام الدفع
export async function sendPaymentReceivedNotification(
  customerId: number,
  invoiceNumber: string,
  amount: number,
): Promise<void> {
  try {
    const customers = await sql`
      SELECT customer_name, whatsapp1, mobile1
      FROM customers
      WHERE id = ${customerId}
    `

    if (customers.length > 0) {
      const customer = customers[0]
      const phone = customer.whatsapp1 || customer.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "PAYMENT_RECEIVED",
          {
            customer_name: customer.customer_name,
            invoice_number: invoiceNumber,
            amount: amount.toLocaleString("ar-SA", {
              style: "currency",
              currency: "SAR",
            }),
          },
          customer.customer_name,
        )

        console.log("[WhatsApp] Payment received notification sent:", invoiceNumber)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending payment received notification:", error)
  }
}

// إرسال رسالة ترحيب لعميل جديد
export async function sendWelcomeMessage(customerId: number): Promise<void> {
  try {
    const customers = await sql`
      SELECT customer_name, whatsapp1, mobile1
      FROM customers
      WHERE id = ${customerId}
    `

    if (customers.length > 0) {
      const customer = customers[0]
      const phone = customer.whatsapp1 || customer.mobile1

      if (phone) {
        // الحصول على اسم الشركة من الإعدادات
        const settings = await sql`
          SELECT setting_value 
          FROM general_settings 
          WHERE setting_key = 'companyName'
        `

        const companyName = settings.length > 0 ? settings[0].setting_value : "شركتنا"

        await sendTemplateMessage(
          phone,
          "WELCOME_MESSAGE",
          {
            company_name: companyName,
          },
          customer.customer_name,
        )

        console.log("[WhatsApp] Welcome message sent to:", customer.customer_name)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending welcome message:", error)
  }
}

// إرسال إشعار عام
export async function sendGeneralNotification(customerId: number, notificationMessage: string): Promise<void> {
  try {
    const customers = await sql`
      SELECT customer_name, whatsapp1, mobile1
      FROM customers
      WHERE id = ${customerId}
    `

    if (customers.length > 0) {
      const customer = customers[0]
      const phone = customer.whatsapp1 || customer.mobile1

      if (phone) {
        await sendTemplateMessage(
          phone,
          "GENERAL_NOTIFICATION",
          {
            customer_name: customer.customer_name,
            notification_message: notificationMessage,
          },
          customer.customer_name,
        )

        console.log("[WhatsApp] General notification sent to:", customer.customer_name)
      }
    }
  } catch (error) {
    console.error("[WhatsApp] Error sending general notification:", error)
  }
}

// إرسال إشعارات جماعية
export async function sendBulkNotification(
  customerIds: number[],
  message: string,
  templateCode?: string,
  variables?: Record<string, any>,
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (const customerId of customerIds) {
    try {
      const customers = await sql`
        SELECT customer_name, whatsapp1, mobile1
        FROM customers
        WHERE id = ${customerId}
      `

      if (customers.length > 0) {
        const customer = customers[0]
        const phone = customer.whatsapp1 || customer.mobile1

        if (phone) {
          if (templateCode && variables) {
            await sendTemplateMessage(phone, templateCode, variables, customer.customer_name)
          } else {
            await sendTextMessage(phone, message, customer.customer_name)
          }
          success++
        }
      }
    } catch (error) {
      console.error("[WhatsApp] Error sending bulk notification to customer:", customerId, error)
      failed++
    }

    // تأخير بسيط لتجنب تجاوز حدود API
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  console.log("[WhatsApp] Bulk notification completed:", { success, failed })
  return { success, failed }
}
