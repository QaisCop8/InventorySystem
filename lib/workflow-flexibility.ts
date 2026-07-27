// مكتبة إدارة مرونة نظام المراحل
// Workflow Flexibility Management Library

import sql from "@/lib/database"
// أنواع البيانات
export interface WorkflowSettings {
  workflowSystemMandatory: boolean
  allowSkipStages: boolean
  requireApprovalNotes: boolean
  requireRejectionReason: boolean
  autoAssignToDepartment: boolean
  sendNotifications: boolean
  trackTimeInStages: boolean
  allowParallelProcessing: boolean
}

export interface StageFlexibilitySettings {
  id: number
  stageId: number
  stageName: string
  stageCode: string
  isOptional: boolean
  requiresApproval: boolean
  requiresPreviousApproval: boolean
  canSkip: boolean
  skipConditions?: string
  maxDurationHours?: number
  warningHours?: number
  escalationHours?: number
  escalationToUser?: number
  escalationToDepartment?: string
}

export interface TransitionRule {
  id: number
  fromStageId: number
  toStageId: number
  sequenceId: number
  ruleType: "automatic" | "conditional" | "manual" | "approval_required"
  conditions?: string
  requiredRole?: string
  requiredDepartment?: string
  approvalCount: number
  canReject: boolean
  rejectionReturnsToStage?: number
  isActive: boolean
  priority: number
}

export interface StageDecision {
  orderId: number
  orderType: string
  stageId: number
  decisionType: "approve" | "reject" | "skip" | "hold" | "escalate"
  decisionReason?: string
  decisionNotes?: string
  decisionByUser: number
  decisionByUsername: string
  decisionByDepartment: string
}

export async function getWorkflowSettings(): Promise<WorkflowSettings> {
  try {
    const settings = await sql`
      SELECT setting_key, setting_value, setting_type 
      FROM general_settings 
      WHERE category = 'workflow'
    `

    const settingsMap = settings.reduce((acc: any, setting: any) => {
      const key = setting.setting_key.replace("workflow_", "").replace(/_([a-z])/g, (g: string) => g[1].toUpperCase())
      acc[key] = setting.setting_type === "boolean" ? setting.setting_value === "true" : setting.setting_value
      return acc
    }, {})

    return {
      workflowSystemMandatory: settingsMap.systemMandatory ?? true,
      allowSkipStages: settingsMap.allowSkipStages ?? false,
      requireApprovalNotes: settingsMap.requireApprovalNotes ?? true,
      requireRejectionReason: settingsMap.requireRejectionReason ?? true,
      autoAssignToDepartment: settingsMap.autoAssignToDepartment ?? true,
      sendNotifications: settingsMap.sendNotifications ?? true,
      trackTimeInStages: settingsMap.trackTimeInStages ?? true,
      allowParallelProcessing: settingsMap.allowParallelProcessing ?? false,
    }
  } catch (error) {
    console.error("Error fetching workflow settings:", error)
    throw error
  }
}

export async function updateWorkflowSettings(settings: Partial<WorkflowSettings>): Promise<void> {
  try {
    const updates = Object.entries(settings).map(([key, value]) => {
      const settingKey = `workflow_${key.replace(/([A-Z])/g, "_$1").toLowerCase()}`
      return sql`
        UPDATE general_settings 
        SET setting_value = ${String(value)}, updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = ${settingKey}
      `
    })

    await Promise.all(updates)
  } catch (error) {
    console.error("Error updating workflow settings:", error)
    throw error
  }
}

export async function getStageFlexibilitySettings(companyId = 1): Promise<StageFlexibilitySettings[]> {
  try {
    const stages = await sql`
      SELECT 
        ws.id,
        ws.id as stage_id,
        ws.stage_name,
        ws.stage_code,
        COALESCE(wss.is_optional, ws.is_optional) as is_optional,
        COALESCE(wss.requires_approval, ws.requires_approval) as requires_approval,
        COALESCE(wss.requires_previous_approval, ws.requires_previous_approval) as requires_previous_approval,
        COALESCE(wss.can_skip, ws.can_skip) as can_skip,
        COALESCE(wss.skip_conditions, ws.skip_conditions) as skip_conditions,
        COALESCE(wss.max_duration_hours, ws.max_duration_hours) as max_duration_hours,
        wss.warning_hours,
        wss.escalation_hours,
        wss.escalation_to_user,
        wss.escalation_to_department
      FROM workflow_stages ws
      LEFT JOIN workflow_stage_settings wss ON ws.id = wss.stage_id AND wss.company_id = ${companyId}
      WHERE ws.is_active = true
      ORDER BY ws.id
    `

    return stages.map((stage: any) => ({
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
      escalationToUser: stage.escalation_to_user,
      escalationToDepartment: stage.escalation_to_department,
    }))
  } catch (error) {
    console.error("Error fetching stage flexibility settings:", error)
    throw error
  }
}

export async function updateStageFlexibilitySettings(
  stageId: number,
  settings: Partial<StageFlexibilitySettings>,
  companyId = 1,
): Promise<void> {
  try {
    await sql`
      INSERT INTO workflow_stage_settings (
        stage_id, company_id, is_optional, requires_approval, 
        requires_previous_approval, can_skip, skip_conditions,
        max_duration_hours, warning_hours, escalation_hours,
        escalation_to_user, escalation_to_department, updated_at
      ) VALUES (
        ${stageId}, ${companyId}, ${settings.isOptional}, ${settings.requiresApproval},
        ${settings.requiresPreviousApproval}, ${settings.canSkip}, ${settings.skipConditions},
        ${settings.maxDurationHours}, ${settings.warningHours}, ${settings.escalationHours},
        ${settings.escalationToUser}, ${settings.escalationToDepartment}, CURRENT_TIMESTAMP
      )
      ON CONFLICT (stage_id, company_id) 
      DO UPDATE SET
        is_optional = EXCLUDED.is_optional,
        requires_approval = EXCLUDED.requires_approval,
        requires_previous_approval = EXCLUDED.requires_previous_approval,
        can_skip = EXCLUDED.can_skip,
        skip_conditions = EXCLUDED.skip_conditions,
        max_duration_hours = EXCLUDED.max_duration_hours,
        warning_hours = EXCLUDED.warning_hours,
        escalation_hours = EXCLUDED.escalation_hours,
        escalation_to_user = EXCLUDED.escalation_to_user,
        escalation_to_department = EXCLUDED.escalation_to_department,
        updated_at = CURRENT_TIMESTAMP
    `
  } catch (error) {
    console.error("Error updating stage flexibility settings:", error)
    throw error
  }
}

export async function canAdvanceToNextStage(
  orderId: number,
  orderType: string,
  currentStageId: number,
  nextStageId: number,
  userId: number,
  userDepartment: string,
): Promise<{ canAdvance: boolean; reason?: string; requiresApproval?: boolean }> {
  try {
    const settings = await getWorkflowSettings()

    // إذا كان النظام غير إجباري، السماح بالانتقال
    if (!settings.workflowSystemMandatory) {
      return { canAdvance: true }
    }

    // التحقق من قواعد الانتقال
    const transitionRules = await sql`
      SELECT * FROM workflow_transition_rules 
      WHERE from_stage_id = ${currentStageId} 
        AND to_stage_id = ${nextStageId}
        AND is_active = true
      ORDER BY priority DESC
      LIMIT 1
    `

    if (transitionRules.length === 0) {
      return { canAdvance: false, reason: "لا توجد قاعدة انتقال محددة لهذه المرحلة" }
    }

    const rule = transitionRules[0]

    // التحقق من متطلبات القسم
    if (rule.required_department && rule.required_department !== userDepartment) {
      return {
        canAdvance: false,
        reason: `هذا الانتقال يتطلب موافقة من قسم ${rule.required_department}`,
      }
    }

    // التحقق من نوع القاعدة
    if (rule.rule_type === "approval_required") {
      return { canAdvance: true, requiresApproval: true }
    }

    return { canAdvance: true }
  } catch (error) {
    console.error("Error checking stage advancement:", error)
    throw error
  }
}

export async function recordStageDecision(decision: StageDecision): Promise<void> {
  try {
    await sql`
      INSERT INTO workflow_stage_decisions (
        order_id, order_type, stage_id, decision_type,
        decision_reason, decision_notes, decision_by_user,
        decision_by_username, decision_by_department, created_at
      ) VALUES (
        ${decision.orderId}, ${decision.orderType}, ${decision.stageId},
        ${decision.decisionType}, ${decision.decisionReason}, ${decision.decisionNotes},
        ${decision.decisionByUser}, ${decision.decisionByUsername}, 
        ${decision.decisionByDepartment}, CURRENT_TIMESTAMP
      )
    `
  } catch (error) {
    console.error("Error recording stage decision:", error)
    throw error
  }
}

export async function getTransitionRules(sequenceId?: number): Promise<TransitionRule[]> {
  try {
    const rules = await sql`
      SELECT 
        wtr.*,
        ws_from.stage_name as from_stage_name,
        ws_to.stage_name as to_stage_name
      FROM workflow_transition_rules wtr
      LEFT JOIN workflow_stages ws_from ON wtr.from_stage_id = ws_from.id
      LEFT JOIN workflow_stages ws_to ON wtr.to_stage_id = ws_to.id
      WHERE wtr.is_active = true
        ${sequenceId ? sql`AND wtr.sequence_id = ${sequenceId}` : sql``}
      ORDER BY wtr.sequence_id, wtr.priority DESC
    `

    return rules.map((rule: any) => ({
      id: rule.id,
      fromStageId: rule.from_stage_id,
      toStageId: rule.to_stage_id,
      sequenceId: rule.sequence_id,
      ruleType: rule.rule_type,
      conditions: rule.conditions,
      requiredRole: rule.required_role,
      requiredDepartment: rule.required_department,
      approvalCount: rule.approval_count,
      canReject: rule.can_reject,
      rejectionReturnsToStage: rule.rejection_returns_to_stage,
      isActive: rule.is_active,
      priority: rule.priority,
    }))
  } catch (error) {
    console.error("Error fetching transition rules:", error)
    throw error
  }
}

export async function updateTransitionRule(ruleId: number, updates: Partial<TransitionRule>): Promise<void> {
  try {
    const setClause = Object.entries(updates)
      .filter(([_, value]) => value !== undefined)
      .map(([key, _]) => `${key.replace(/([A-Z])/g, "_$1").toLowerCase()} = $${key}`)
      .join(", ")

    if (setClause) {
      await sql`
        UPDATE workflow_transition_rules 
        SET ${sql.unsafe(setClause)}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ruleId}
      `
    }
  } catch (error) {
    console.error("Error updating transition rule:", error)
    throw error
  }
}
