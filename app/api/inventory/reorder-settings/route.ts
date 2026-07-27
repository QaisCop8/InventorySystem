import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const settings = await sql`
      SELECT setting_key, setting_value 
      FROM general_settings 
      WHERE category = 'reorder_system'
    `

    const settingsObj = settings.reduce((acc: any, setting: any) => {
      acc[setting.setting_key] = setting.setting_value
      return acc
    }, {})

    // Default values if not set
    const defaultSettings = {
      enabled: false,
      check_frequency_hours: 24,
      auto_create_purchase_orders: false,
      notification_email: "",
      notification_sms: false,
      minimum_order_value: 1000,
      default_reorder_multiplier: 2,
    }

    return NextResponse.json({ ...defaultSettings, ...settingsObj })
  } catch (error) {
    console.error("Error fetching reorder settings:", error)
    return NextResponse.json({ error: "فشل في تحميل إعدادات النظام" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const settings = await request.json()

    // Update or insert each setting
    for (const [key, value] of Object.entries(settings)) {
      await sql`
        INSERT INTO general_settings (setting_key, setting_value, category, created_at, updated_at)
        VALUES (${key}, ${String(value)}, 'reorder_system', NOW(), NOW())
        ON CONFLICT (setting_key, category) 
        DO UPDATE SET setting_value = ${String(value)}, updated_at = NOW()
      `
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving reorder settings:", error)
    return NextResponse.json({ error: "فشل في حفظ إعدادات النظام" }, { status: 500 })
  }
}
