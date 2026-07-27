import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
// GET - جلب إعدادات الإشعارات لعميل معين
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")

    if (!customerId) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    console.log("[v0] Fetching notification settings for customer:", customerId)

    const settings = await sql`
      SELECT 
        id,
        customer_id,
        notification_method,
        preferred_phone,
        notify_on_received,
        notify_on_preparing,
        notify_on_quality_check,
        notify_on_ready_to_ship,
        notify_on_shipped,
        notify_on_delivered,
        notify_on_cancelled,
        is_active,
        send_daily_summary,
        daily_summary_time,
        created_at,
        updated_at
      FROM customer_notification_settings
      WHERE customer_id = ${customerId}
      LIMIT 1
    `

    console.log("[v0] Settings found:", settings.length)

    if (settings.length === 0) {
      // إرجاع null إذا لم توجد إعدادات
      return NextResponse.json({ settings: null })
    }

    return NextResponse.json({ settings: settings[0] })
  } catch (error) {
    console.error("[v0] Error fetching notification settings:", error)
    return NextResponse.json({ error: "فشل في جلب إعدادات الإشعارات" }, { status: 500 })
  }
}

// POST - إنشاء أو تحديث إعدادات الإشعارات
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      customer_id,
      notification_method,
      preferred_phone,
      notify_on_received,
      notify_on_preparing,
      notify_on_quality_check,
      notify_on_ready_to_ship,
      notify_on_shipped,
      notify_on_delivered,
      notify_on_cancelled,
      is_active,
      send_daily_summary,
      daily_summary_time,
    } = body

    console.log("[v0] Saving notification settings:", body)

    // التحقق من البيانات المطلوبة
    if (!customer_id) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    if (!notification_method || !["sms", "whatsapp", "both"].includes(notification_method)) {
      return NextResponse.json({ error: "طريقة الإرسال غير صحيحة" }, { status: 400 })
    }

    // التحقق من وجود إعدادات سابقة
    const existingSettings = await sql`
      SELECT id FROM customer_notification_settings
      WHERE customer_id = ${customer_id}
      LIMIT 1
    `

    let savedSettings

    if (existingSettings.length > 0) {
      // تحديث الإعدادات الموجودة
      console.log("[v0] Updating existing settings for customer:", customer_id)

      savedSettings = await sql`
        UPDATE customer_notification_settings
        SET
          notification_method = ${notification_method},
          preferred_phone = ${preferred_phone || ""},
          notify_on_received = ${notify_on_received ?? true},
          notify_on_preparing = ${notify_on_preparing ?? true},
          notify_on_quality_check = ${notify_on_quality_check ?? true},
          notify_on_ready_to_ship = ${notify_on_ready_to_ship ?? true},
          notify_on_shipped = ${notify_on_shipped ?? true},
          notify_on_delivered = ${notify_on_delivered ?? false},
          notify_on_cancelled = ${notify_on_cancelled ?? true},
          is_active = ${is_active ?? true},
          send_daily_summary = ${send_daily_summary ?? false},
          daily_summary_time = ${daily_summary_time || "09:00:00"},
          updated_at = NOW()
        WHERE customer_id = ${customer_id}
        RETURNING *
      `
    } else {
      // إنشاء إعدادات جديدة
      console.log("[v0] Creating new settings for customer:", customer_id)

      savedSettings = await sql`
        INSERT INTO customer_notification_settings (
          customer_id,
          notification_method,
          preferred_phone,
          notify_on_received,
          notify_on_preparing,
          notify_on_quality_check,
          notify_on_ready_to_ship,
          notify_on_shipped,
          notify_on_delivered,
          notify_on_cancelled,
          is_active,
          send_daily_summary,
          daily_summary_time
        ) VALUES (
          ${customer_id},
          ${notification_method},
          ${preferred_phone || ""},
          ${notify_on_received ?? true},
          ${notify_on_preparing ?? true},
          ${notify_on_quality_check ?? true},
          ${notify_on_ready_to_ship ?? true},
          ${notify_on_shipped ?? true},
          ${notify_on_delivered ?? false},
          ${notify_on_cancelled ?? true},
          ${is_active ?? true},
          ${send_daily_summary ?? false},
          ${daily_summary_time || "09:00:00"}
        )
        RETURNING *
      `
    }

    console.log("[v0] Settings saved successfully:", savedSettings[0])

    return NextResponse.json({
      success: true,
      settings: savedSettings[0],
    })
  } catch (error) {
    console.error("[v0] Error saving notification settings:", error)
    return NextResponse.json({ error: "فشل في حفظ إعدادات الإشعارات" }, { status: 500 })
  }
}

// DELETE - حذف إعدادات الإشعارات
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get("customerId")

    if (!customerId) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    console.log("[v0] Deleting notification settings for customer:", customerId)

    await sql`
      DELETE FROM customer_notification_settings
      WHERE customer_id = ${customerId}
    `

    return NextResponse.json({
      success: true,
      message: "تم حذف إعدادات الإشعارات بنجاح",
    })
  } catch (error) {
    console.error("[v0] Error deleting notification settings:", error)
    return NextResponse.json({ error: "فشل في حذف إعدادات الإشعارات" }, { status: 500 })
  }
}
