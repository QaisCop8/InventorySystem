import { NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const templates = await sql`
      SELECT 
        id,
        template_name,
        template_code,
        template_category,
        message_content,
        variables,
        is_active,
        is_system,
        usage_count,
        last_used_at,
        created_at
      FROM message_templates
      ORDER BY is_system DESC, created_at DESC
    `

    return NextResponse.json(templates)
  } catch (error) {
    console.error("[v0] Error fetching templates:", error)
    return NextResponse.json({ error: "فشل في جلب النماذج" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { template_name, template_code, template_category, message_content, variables } = body

    // استخراج المتغيرات من محتوى الرسالة
    const extractedVariables = message_content.match(/\{([^}]+)\}/g)?.map((v: string) => v.slice(1, -1)) || []

    const result = await sql`
      INSERT INTO message_templates (
        template_name,
        template_code,
        template_category,
        message_content,
        variables,
        created_by
      ) VALUES (
        ${template_name},
        ${template_code},
        ${template_category},
        ${message_content},
        ${JSON.stringify(extractedVariables)},
        'admin'
      )
      RETURNING *
    `

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("[v0] Error creating template:", error)
    return NextResponse.json({ error: "فشل في إنشاء النموذج" }, { status: 500 })
  }
}
