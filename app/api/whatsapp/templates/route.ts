import { type NextRequest, NextResponse } from "next/server"
import { getAllTemplates } from "@/lib/whatsapp-service"
import sql from "@/lib/database"
// الحصول على جميع النماذج
export async function GET() {
  try {
    const templates = await getAllTemplates()

    return NextResponse.json({
      success: true,
      data: templates,
    })
  } catch (error) {
    console.error("[v0] Error fetching WhatsApp templates:", error)
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
  }
}

// إنشاء نموذج جديد
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { template_code, template_name, template_category, message_template, language, has_media, media_type } = body

    if (!template_code || !template_name || !template_category || !message_template) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO whatsapp_templates (
        template_code, template_name, template_category, message_template,
        language, has_media, media_type, is_active
      ) VALUES (
        ${template_code}, ${template_name}, ${template_category}, ${message_template},
        ${language || "ar"}, ${has_media || false}, ${media_type || null}, true
      )
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      message: "Template created successfully",
      data: result[0],
    })
  } catch (error) {
    console.error("[v0] Error creating WhatsApp template:", error)
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}

// تحديث نموذج
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, template_name, template_category, message_template, language, has_media, media_type, is_active } = body

    if (!id) {
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 })
    }

    const result = await sql`
      UPDATE whatsapp_templates 
      SET 
        template_name = ${template_name},
        template_category = ${template_category},
        message_template = ${message_template},
        language = ${language || "ar"},
        has_media = ${has_media || false},
        media_type = ${media_type || null},
        is_active = ${is_active !== undefined ? is_active : true},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      message: "Template updated successfully",
      data: result[0],
    })
  } catch (error) {
    console.error("[v0] Error updating WhatsApp template:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

// حذف نموذج
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 })
    }

    await sql`
      DELETE FROM whatsapp_templates 
      WHERE id = ${id}
    `

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
    })
  } catch (error) {
    console.error("[v0] Error deleting WhatsApp template:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
