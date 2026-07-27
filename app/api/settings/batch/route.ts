import { type NextRequest, NextResponse } from "next/server"
import { getBatchSettings } from "@/lib/batch-utils"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const documentType = searchParams.get("document_type")

    if (!documentType) {
      return NextResponse.json({ error: "Document type is required" }, { status: 400 })
    }

    const settings = await getBatchSettings(documentType)

    if (!settings) {
      // إنشاء إعدادات افتراضية
      const defaultSettings = {
        mandatory_batch_selection: false,
        auto_select_fifo: true,
        allow_negative_stock: false,
        require_expiry_date: documentType.includes("purchase"),
      }

      await sql`
        INSERT INTO batch_settings (
          document_type, mandatory_batch_selection, auto_select_fifo, 
          allow_negative_stock, require_expiry_date
        ) VALUES (
          ${documentType}, ${defaultSettings.mandatory_batch_selection}, 
          ${defaultSettings.auto_select_fifo}, ${defaultSettings.allow_negative_stock}, 
          ${defaultSettings.require_expiry_date}
        )
      `

      return NextResponse.json(defaultSettings)
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("[v0] Error fetching batch settings:", error)
    return NextResponse.json({ error: "Failed to fetch batch settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const { document_type, mandatory_batch_selection, auto_select_fifo, allow_negative_stock, require_expiry_date } =
      data

    if (!document_type) {
      return NextResponse.json({ error: "Document type is required" }, { status: 400 })
    }

    // تحديث أو إدراج الإعدادات
    await sql`
      INSERT INTO batch_settings (
        document_type, mandatory_batch_selection, auto_select_fifo, 
        allow_negative_stock, require_expiry_date
      ) VALUES (
        ${document_type}, ${mandatory_batch_selection}, ${auto_select_fifo}, 
        ${allow_negative_stock}, ${require_expiry_date}
      )
      ON CONFLICT (document_type) DO UPDATE SET
        mandatory_batch_selection = EXCLUDED.mandatory_batch_selection,
        auto_select_fifo = EXCLUDED.auto_select_fifo,
        allow_negative_stock = EXCLUDED.allow_negative_stock,
        require_expiry_date = EXCLUDED.require_expiry_date,
        updated_at = CURRENT_TIMESTAMP
    `

    return NextResponse.json({
      success: true,
      message: "تم حفظ إعدادات الباتش بنجاح",
    })
  } catch (error) {
    console.error("[v0] Error saving batch settings:", error)
    return NextResponse.json({ error: "Failed to save batch settings" }, { status: 500 })
  }
}
