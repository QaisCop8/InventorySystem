import sql from "@/lib/database"
/**
 * Check if a product has reached its reorder point and trigger notification
 * This function should be called after any inventory update
 */
export async function checkAndNotifyReorderPoint(productId: number): Promise<void> {
  try {
    // Check if notifications are enabled
    const settingsResult = await sql`
      SELECT is_enabled FROM whatsapp_notification_settings
      WHERE is_enabled = true
      LIMIT 1
    `

    if (settingsResult.length === 0) {
      console.log("[v0] WhatsApp notifications are disabled")
      return
    }

    // Check if product has reached reorder point
    const productResult = await sql`
      SELECT 
        p.id,
        p.product_code,
        p.product_name,
        ps.current_stock,
        p.reorder_point,
        p.min_stock_level
      FROM products p
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      WHERE 
        p.id = ${productId}
        AND p.status = 'active'
        AND (
          ps.current_stock <= COALESCE(p.reorder_point, p.min_stock_level, 0)
        )
    `

    if (productResult.length === 0) {
      console.log(`[v0] Product ${productId} has not reached reorder point`)
      return
    }

    // Check if notification was already sent recently (within 24 hours)
    const product = productResult[0]
    const recentNotification = await sql`
      SELECT id FROM inventory_notification_log
      WHERE product_code = ${product.product_code}
        AND status = 'sent'
        AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `

    if (recentNotification.length > 0) {
      console.log(`[v0] Notification for product ${product.product_code} was already sent recently`)
      return
    }

    // Trigger notification by calling the API endpoint
    console.log(`[v0] Triggering reorder notification for product ${product.product_code}`)

    // Use fetch to call the internal API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    await fetch(`${baseUrl}/api/inventory/check-and-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id: productId,
      }),
    })
  } catch (error) {
    console.error("[v0] Error checking and notifying reorder point:", error)
    // Don't throw error to avoid breaking the main inventory update flow
  }
}

/**
 * Batch check multiple products for reorder point
 */
export async function checkAndNotifyMultipleProducts(productIds: number[]): Promise<void> {
  try {
    // Check if notifications are enabled
    const settingsResult = await sql`
      SELECT is_enabled FROM whatsapp_notification_settings
      WHERE is_enabled = true
      LIMIT 1
    `

    if (settingsResult.length === 0) {
      console.log("[v0] WhatsApp notifications are disabled")
      return
    }

    // Process each product
    for (const productId of productIds) {
      await checkAndNotifyReorderPoint(productId)
    }
  } catch (error) {
    console.error("[v0] Error checking multiple products:", error)
  }
}
