import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { checkInventoryAndNotify } from "@/lib/whatsapp-scheduler"

// GET: Fetch notification log
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const result = await sql`
      SELECT 
        id,
        product_id,
        product_code,
        product_name,
        phone_number,
        message_content,
        status,
        error_message,
        sent_at,
        created_at
      FROM whatsapp_notification_log
      ORDER BY created_at DESC
      LIMIT ${limit}
    `

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error fetching notification log:", error)
    return NextResponse.json({ error: "Failed to fetch notification log" }, { status: 500 })
  }
}

// POST: Send WhatsApp notifications for products at reorder point
export async function POST(request: NextRequest) {
  try {
    const result = await checkInventoryAndNotify()

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error sending reorder notifications:", error)
    return NextResponse.json(
      {
        success: false,
        message: "حدث خطأ أثناء إرسال الإشعارات",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
