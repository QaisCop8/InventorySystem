import { type NextRequest, NextResponse } from "next/server"
import { getProductsNeedingReorder, getNotificationSettings, wasRecentlyNotified } from "@/lib/whatsapp-notifications"

/**
 * This endpoint can be called by a cron job or scheduled task
 * to automatically check inventory and send notifications
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Starting automated reorder check...")

    // Get notification settings
    const settings = await getNotificationSettings()

    if (!settings || !settings.is_enabled) {
      return NextResponse.json({
        success: false,
        message: "Notifications are not enabled",
      })
    }

    // Get products needing reorder
    const products = await getProductsNeedingReorder()

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No products need reordering",
        productsChecked: 0,
      })
    }

    // Filter out products that were recently notified
    const productsToNotify = []
    for (const product of products) {
      const recentlyNotified = await wasRecentlyNotified(product.id, 24)
      if (!recentlyNotified) {
        productsToNotify.push(product)
      }
    }

    if (productsToNotify.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All products were recently notified",
        productsChecked: products.length,
        productsToNotify: 0,
      })
    }

    // Trigger the send notifications endpoint
    // نفس الجلسة والشركة (مسارات /api محمية بجلسة في middleware.ts)
    const sendResponse = await fetch(`${request.nextUrl.origin}/api/inventory/send-reorder-notifications`, {
      method: "POST",
      headers: { cookie: request.headers.get("cookie") || "", "x-tenant-db": request.headers.get("x-tenant-db") || "" },
    })

    const sendResult = await sendResponse.json()

    return NextResponse.json({
      success: true,
      message: "Automated check completed",
      productsChecked: products.length,
      productsToNotify: productsToNotify.length,
      notificationResult: sendResult,
    })
  } catch (error) {
    console.error("[v0] Error in automated reorder check:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Error during automated check",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// GET endpoint for manual trigger or status check
export async function GET(request: NextRequest) {
  try {
    const products = await getProductsNeedingReorder()
    const settings = await getNotificationSettings()

    return NextResponse.json({
      enabled: settings?.is_enabled || false,
      productsNeedingReorder: products.length,
      products: products.slice(0, 10), // Return first 10 for preview
    })
  } catch (error) {
    console.error("[v0] Error checking reorder status:", error)
    return NextResponse.json({ error: "Failed to check reorder status" }, { status: 500 })
  }
}
