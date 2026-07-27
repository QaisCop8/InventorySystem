import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// GET: Fetch notification settings
export async function GET(request: NextRequest) {
  try {
    const result = await sql`
      SELECT 
        id,
        is_enabled,
        phone_numbers,
        notification_threshold,
        message_template,
        send_daily_summary,
        daily_summary_time,
        created_at,
        updated_at
      FROM whatsapp_notification_settings
      ORDER BY id DESC
      LIMIT 1
    `

    if (result.length === 0) {
      // Return default settings if none exist
      return NextResponse.json({
        id: null,
        is_enabled: false,
        phone_numbers: [],
        notification_threshold: "at_reorder_point",
        message_template: `🔔 تنبيه إعادة طلب

📦 المنتج: {product_name}
🔢 الكود: {product_code}
📊 المخزون الحالي: {current_stock}
⚠️ نقطة إعادة الطلب: {reorder_point}
🏭 المورد: {supplier_name}

يرجى اتخاذ الإجراء اللازم.`,
        send_daily_summary: false,
        daily_summary_time: "09:00",
      })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error fetching notification settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

// POST: Save notification settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      is_enabled,
      phone_numbers,
      notification_threshold,
      message_template,
      send_daily_summary,
      daily_summary_time,
    } = body

    let result

    if (id) {
      // Update existing settings
      result = await sql`
        UPDATE whatsapp_notification_settings
        SET 
          is_enabled = ${is_enabled},
          phone_numbers = ${phone_numbers},
          notification_threshold = ${notification_threshold},
          message_template = ${message_template},
          send_daily_summary = ${send_daily_summary},
          daily_summary_time = ${daily_summary_time},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `
    } else {
      // Insert new settings
      result = await sql`
        INSERT INTO whatsapp_notification_settings (
          is_enabled,
          phone_numbers,
          notification_threshold,
          message_template,
          send_daily_summary,
          daily_summary_time
        )
        VALUES (
          ${is_enabled},
          ${phone_numbers},
          ${notification_threshold},
          ${message_template},
          ${send_daily_summary},
          ${daily_summary_time}
        )
        RETURNING *
      `
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error saving notification settings:", error)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
