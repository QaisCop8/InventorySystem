import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Document settings API GET called")
    const { searchParams } = new URL(request.url)
    const documentType = searchParams.get("document_type")
    console.log("[v0] Document type requested:", documentType)

    if (!documentType) {
      console.log("[v0] No document type provided, returning error")
      return NextResponse.json({ error: "Document type is required" }, { status: 400 })
    }

    try {
      const existingSettings = await sql`
        SELECT * FROM document_settings 
        WHERE document_type = ${documentType}
        ORDER BY display_order ASC
      `

      console.log("[v0] Existing settings found:", existingSettings.length)

      if (existingSettings.length === 0) {
        // Create default settings for the document type
        const defaultFields = getDefaultFieldsForDocumentType(documentType)
        console.log("[v0] Creating default settings for:", documentType)

        for (const field of defaultFields) {
          await sql`
            INSERT INTO document_settings (
              document_type, field_name, display_name, display_order,
              show_in_screen, show_in_print, is_required, field_type
            ) VALUES (
              ${documentType}, ${field.field_name}, ${field.display_name}, ${field.display_order},
              ${field.show_in_screen}, ${field.show_in_print}, ${field.is_required}, ${field.field_type}
            )
          `
        }

        // Fetch the newly created settings
        const newSettings = await sql`
          SELECT * FROM document_settings 
          WHERE document_type = ${documentType}
          ORDER BY display_order ASC
        `

        console.log("[v0] Created default settings:", newSettings.length)
        return NextResponse.json(newSettings)
      }

      return NextResponse.json(existingSettings)
    } catch (dbError) {
      console.error("[v0] Database error:", dbError)
      return NextResponse.json({ error: "Database error occurred" }, { status: 500 })
    }
  } catch (error) {
    console.error("[v0] Error fetching document settings:", error)
    return NextResponse.json({ error: "Failed to fetch document settings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[v0] Saving document settings:", data)

    const { document_type, fields } = data

    if (!document_type || !fields || !Array.isArray(fields)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 })
    }

    // Delete existing settings for this document type
    await sql`DELETE FROM document_settings WHERE document_type = ${document_type}`

    // Insert new settings
    const insertPromises = fields.map((field: any) => {
      return sql`
        INSERT INTO document_settings (
          document_type, field_name, display_name, display_order,
          show_in_screen, show_in_print, is_required
        ) VALUES (
          ${document_type}, ${field.id}, ${field.displayName}, ${field.order},
          ${field.showInScreen}, ${field.showInPrint}, ${field.isRequired || false}
        )
      `
    })

    await Promise.all(insertPromises)

    return NextResponse.json({
      success: true,
      message: "تم حفظ إعدادات السندات بنجاح",
    })
  } catch (error) {
    console.error("Error saving document settings:", error)
    return NextResponse.json({ error: "Failed to save document settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[v0] Updating document settings:", data)

    const { id, ...updateData } = data

    const result = await sql`
      UPDATE document_settings SET
        display_name = ${updateData.display_name},
        display_order = ${updateData.display_order},
        show_in_screen = ${updateData.show_in_screen},
        show_in_print = ${updateData.show_in_print},
        is_required = ${updateData.is_required},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating document settings:", error)
    return NextResponse.json({ error: "Failed to update document settings" }, { status: 500 })
  }
}

function getDefaultFieldsForDocumentType(documentType: string) {
  const commonFields = [
    {
      field_name: "sequence",
      display_name: "رقم السند",
      display_order: 1,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "text",
    },
    {
      field_name: "date",
      display_name: "التاريخ",
      display_order: 2,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "date",
    },
    {
      field_name: "barcode",
      display_name: "الباركود",
      display_order: 3,
      show_in_screen: true,
      show_in_print: false,
      is_required: false,
      field_type: "text",
    },
    {
      field_name: "product",
      display_name: "المنتج",
      display_order: 4,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "text",
    },
    {
      field_name: "unit",
      display_name: "الوحدة",
      display_order: 5,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "text",
    },
    {
      field_name: "quantity",
      display_name: "الكمية",
      display_order: 6,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "number",
    },
    {
      field_name: "unit_price",
      display_name: "سعر الوحدة",
      display_order: 7,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "number",
    },
    {
      field_name: "discount",
      display_name: "الخصم",
      display_order: 8,
      show_in_screen: true,
      show_in_print: true,
      is_required: false,
      field_type: "number",
    },
    {
      field_name: "tax",
      display_name: "الضريبة",
      display_order: 9,
      show_in_screen: true,
      show_in_print: true,
      is_required: false,
      field_type: "number",
    },
    {
      field_name: "total",
      display_name: "الإجمالي",
      display_order: 10,
      show_in_screen: true,
      show_in_print: true,
      is_required: true,
      field_type: "number",
    },
    {
      field_name: "warehouse",
      display_name: "المستودع",
      display_order: 11,
      show_in_screen: true,
      show_in_print: false,
      is_required: false,
      field_type: "text",
    },
    {
      field_name: "expiry_date",
      display_name: "تاريخ الصلاحية",
      display_order: 12,
      show_in_screen: true,
      show_in_print: false,
      is_required: false,
      field_type: "date",
    },
    {
      field_name: "batch_number",
      display_name: "رقم الدفعة",
      display_order: 13,
      show_in_screen: true,
      show_in_print: false,
      is_required: false,
      field_type: "text",
    },
    {
      field_name: "notes",
      display_name: "الملاحظات",
      display_order: 14,
      show_in_screen: true,
      show_in_print: false,
      is_required: false,
      field_type: "text",
    },
  ]

  return commonFields
}
