import { type NextRequest, NextResponse } from "next/server"
import { getWorkflowStages } from "@/lib/workflow"
import sql from "@/lib/database"
export async function GET() {
  try {
    const stages = await getWorkflowStages()
    return NextResponse.json(stages)
  } catch (error) {
    console.error("Error fetching workflow stages:", error)
    return NextResponse.json({ error: "فشل في جلب المراحل" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const result = await sql`
      INSERT INTO workflow_stages (
        stage_code, stage_name, stage_name_en, description,
        stage_type, stage_color, icon_name, requires_approval,
        max_duration_hours, auto_advance, is_active
      ) VALUES (
        ${data.stage_code}, ${data.stage_name}, ${data.stage_name_en || null},
        ${data.description || null}, ${data.stage_type}, ${data.stage_color},
        ${data.icon_name}, ${data.requires_approval || false},
        ${data.max_duration_hours || null}, ${data.auto_advance || false}, true
      )
      RETURNING *
    `

    return NextResponse.json({
      success: true,
      stage: result[0],
      message: "تم إنشاء المرحلة بنجاح",
    })
  } catch (error) {
    console.error("Error creating workflow stage:", error)
    return NextResponse.json({ error: "فشل في إنشاء المرحلة" }, { status: 500 })
  }
}
