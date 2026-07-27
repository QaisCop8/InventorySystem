import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET() {
  try {
    const settings = await sql`
      SELECT * FROM workflow_settings 
      WHERE id = 1
    `

    if (settings.length === 0) {
      // إرجاع الإعدادات الافتراضية
      return NextResponse.json({
        workflowSystemMandatory: true,
        allowSkipStages: false,
        requireApprovalNotes: true,
        requireRejectionReason: true,
        autoAssignToDepartment: true,
        sendNotifications: true,
        trackTimeInStages: true,
        allowParallelProcessing: false,
      })
    }

    return NextResponse.json(settings[0])
  } catch (error) {
    console.error("Error fetching workflow settings:", error)
    return NextResponse.json({ error: "Failed to fetch workflow settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    // إنشاء أو تحديث الإعدادات
    await sql`
      INSERT INTO workflow_settings (
        id, workflow_system_mandatory, allow_skip_stages, require_approval_notes,
        require_rejection_reason, auto_assign_to_department, send_notifications,
        track_time_in_stages, allow_parallel_processing, updated_at
      ) VALUES (
        1, ${body.workflowSystemMandatory}, ${body.allowSkipStages}, ${body.requireApprovalNotes},
        ${body.requireRejectionReason}, ${body.autoAssignToDepartment}, ${body.sendNotifications},
        ${body.trackTimeInStages}, ${body.allowParallelProcessing}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        workflow_system_mandatory = EXCLUDED.workflow_system_mandatory,
        allow_skip_stages = EXCLUDED.allow_skip_stages,
        require_approval_notes = EXCLUDED.require_approval_notes,
        require_rejection_reason = EXCLUDED.require_rejection_reason,
        auto_assign_to_department = EXCLUDED.auto_assign_to_department,
        send_notifications = EXCLUDED.send_notifications,
        track_time_in_stages = EXCLUDED.track_time_in_stages,
        allow_parallel_processing = EXCLUDED.allow_parallel_processing,
        updated_at = NOW()
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating workflow settings:", error)
    return NextResponse.json({ error: "Failed to update workflow settings" }, { status: 500 })
  }
}
