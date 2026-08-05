import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import twilio from "twilio"
import { shouldSendDailySummary, formatDailySummary } from "@/lib/whatsapp-scheduler"
import { getProductsNeedingReorder } from "@/lib/whatsapp-notifications"

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export async function POST(request: NextRequest) {
  try {
    // Check if it's time to send daily summary
    const shouldSend = await shouldSendDailySummary()

    if (!shouldSend) {
      return NextResponse.json({
        success: false,
        message: "Not time for daily summary yet",
      })
    }

    // Fetch notification settings
    const settingsResult = await sql`
      SELECT * FROM whatsapp_notification_settings
      WHERE is_enabled = true AND send_daily_summary = true
      ORDER BY id DESC
      LIMIT 1
    `

    if (settingsResult.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Daily summary is not enabled",
      })
    }

    const settings = settingsResult[0]
    const phoneNumbers = settings.phone_numbers || []

    if (phoneNumbers.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No phone numbers configured",
      })
    }

    // Get products needing reorder
    const products = await getProductsNeedingReorder()

    // Format summary message
    const summaryMessage = formatDailySummary(products)

    // Send to all configured phone numbers
    let sent = 0
    let failed = 0

    for (const phoneNumber of phoneNumbers) {
      try {
        const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER!
        const formattedTo = phoneNumber.startsWith("whatsapp:") ? phoneNumber : `whatsapp:${phoneNumber}`
        const formattedFrom = whatsappNumber.startsWith("whatsapp:") ? whatsappNumber : `whatsapp:${whatsappNumber}`

        await twilioClient.messages.create({
          body: summaryMessage,
          from: formattedFrom,
          to: formattedTo,
        })

        sent++

        // Log the summary
        await sql`
          INSERT INTO whatsapp_notification_log (
            product_id,
            product_code,
            product_name,
            phone_number,
            message_content,
            status,
            sent_at
          )
          VALUES (
            NULL,
            'DAILY_SUMMARY',
            'Daily Inventory Summary',
            ${phoneNumber},
            ${summaryMessage},
            'sent',
            NOW()
          )
        `

        // Small delay between messages
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error("[v0] Error sending daily summary:", error)
        failed++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily summary sent to ${sent} recipients, ${failed} failed`,
      productsCount: products.length,
      sent,
      failed,
    })
  } catch (error) {
    console.error("[v0] Error in daily summary:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send daily summary",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
