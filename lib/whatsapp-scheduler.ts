import sql from "@/lib/database"
import { getProductsNeedingReorder, getNotificationSettings } from "./whatsapp-notifications"

/**
 * Check if it's time to send daily summary based on settings
 */
export async function shouldSendDailySummary(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT 
        send_daily_summary,
        daily_summary_time,
        updated_at
      FROM whatsapp_notification_settings
      WHERE is_enabled = true
      ORDER BY id DESC
      LIMIT 1
    `

    if (result.length === 0 || !result[0].send_daily_summary) {
      return false
    }

    const summaryTime = result[0].daily_summary_time
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`

    // Check if current time matches summary time (within 5 minutes)
    const [summaryHour, summaryMinute] = summaryTime.split(":").map(Number)
    const [currentHour, currentMinute] = currentTime.split(":").map(Number)

    const timeDiff = Math.abs(summaryHour * 60 + summaryMinute - (currentHour * 60 + currentMinute))

    return timeDiff <= 5
  } catch (error) {
    console.error("[v0] Error checking daily summary schedule:", error)
    return false
  }
}

export async function checkInventoryAndNotify() {
  try {
    const settings = await getNotificationSettings()

    if (!settings || !settings.is_enabled) {
      return {
        success: false,
        message: "Notifications are disabled",
        productsChecked: 0,
        productsToNotify: 0,
      }
    }

    const products = await getProductsNeedingReorder()

    return {
      success: true,
      message: "Inventory check completed",
      productsChecked: products.length,
      productsToNotify: products.length,
    }
  } catch (error) {
    console.error("[v0] Error checking inventory notifications:", error)
    return {
      success: false,
      message: "Failed to check inventory notifications",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Format daily summary message
 */
export function formatDailySummary(products: any[]): string {
  if (products.length === 0) {
    return "✅ تقرير المخزون اليومي\n\nجميع المنتجات في مستويات مخزون جيدة."
  }

  let message = `📊 تقرير المخزون اليومي\n\n`
  message += `⚠️ عدد المنتجات التي تحتاج إعادة طلب: ${products.length}\n\n`

  products.slice(0, 10).forEach((product, index) => {
    message += `${index + 1}. ${product.product_name}\n`
    message += `   📦 الكود: ${product.product_code}\n`
    message += `   📊 المخزون: ${product.current_stock}\n`
    message += `   ⚠️ نقطة الطلب: ${product.reorder_point}\n`
    if (product.supplier_name) {
      message += `   🏢 المورد: ${product.supplier_name}\n`
    }
    message += `\n`
  })

  if (products.length > 10) {
    message += `... و ${products.length - 10} منتج آخر\n`
  }

  message += `\n📅 التاريخ: ${new Date().toLocaleDateString("ar-SA")}`

  return message
}
