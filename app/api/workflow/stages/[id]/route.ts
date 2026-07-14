import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const stages = await sql`
      SELECT 
        sf.id,
        sf.stage_id,
        ws.stage_name,
        ws.stage_code,
        sf.is_optional,
        sf.requires_approval,
        sf.requires_previous_approval,
        sf.can_skip,
        sf.skip_conditions,
        sf.max_duration_hours,
        sf.warning_hours,
        sf.escalation_hours,
        sf.escalation_to_department
      FROM stage_flexibility_settings sf
      JOIN workflow_stages ws ON sf.stage_id = ws.id
      ORDER BY ws.stage_order
    `

    return NextResponse.json(
      stages.map((stage) => ({
        id: stage.id,
        stageId: stage.stage_id,
        stageName: stage.stage_name,
        stageCode: stage.stage_code,
        isOptional: stage.is_optional,
        requiresApproval: stage.requires_approval,
        requiresPreviousApproval: stage.requires_previous_approval,
        canSkip: stage.can_skip,
        skipConditions: stage.skip_conditions,
        maxDurationHours: stage.max_duration_hours,
        warningHours: stage.warning_hours,
        escalationHours: stage.escalation_hours,
        escalationToDepartment: stage.escalation_to_department,
      })),
    )
  } catch (error) {
    console.error("Error fetching stage flexibility settings:", error)
    return NextResponse.json({ error: "Failed to fetch stage flexibility settings" }, { status: 500 })
  }
}

