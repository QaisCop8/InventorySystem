import { createOrderAdvanceNotification, createOrderRejectionNotification } from "./notifications"
import sql from "@/lib/database"
export interface WorkflowStage {
  id: number
  stage_code: string
  stage_name: string
  stage_name_en?: string
  description?: string
  stage_type: "start" | "normal" | "end" | "conditional"
  stage_color: string
  icon_name: string
  is_active: boolean
  requires_approval: boolean
  max_duration_hours?: number
  auto_advance: boolean
  created_at: Date
  updated_at: Date
}

export interface WorkflowSequence {
  id: number
  sequence_name: string
  sequence_type: string
  description?: string
  is_default: boolean
  is_active: boolean
  created_by?: number
  created_at: Date
  updated_at: Date
}

export interface WorkflowSequenceStep {
  id: number
  sequence_id: number
  stage_id: number
  step_order: number
  is_optional: boolean
  conditions?: string
  next_stage_id?: number
  alternative_stage_id?: number
  stage_name: string
  stage_color: string
  icon_name: string
}

export interface OrderWorkflowStatus {
  id: number
  order_id: number
  order_type: "sales" | "purchase"
  order_number: string
  sequence_id: number
  current_stage_id: number
  current_step_order: number
  assigned_to_user?: number
  assigned_to_department?: string
  stage_start_time: Date
  expected_completion_time?: Date
  is_overdue: boolean
  priority_level: "low" | "normal" | "high" | "urgent"
  notes?: string
  created_at: Date
  updated_at: Date
}

export interface WorkflowHistory {
  id: number
  order_id: number
  order_type: string
  order_number: string
  sequence_id: number
  from_stage_id?: number
  to_stage_id: number
  from_stage_name?: string
  to_stage_name: string
  action_type: "advance" | "reject" | "return" | "reassign"
  performed_by_user?: number
  performed_by_username?: string
  performed_by_department?: string
  duration_in_previous_stage?: string
  reason?: string
  notes?: string
  created_at: Date
}

// الحصول على جميع المراحل
export async function getWorkflowStages() {
  try {
    const result = await sql`
      SELECT * FROM workflow_stages 
      WHERE is_active = true 
      ORDER BY stage_code
    `
    return result as WorkflowStage[]
  } catch (error) {
    console.error("Error fetching workflow stages:", error)
    throw error
  }
}

// الحصول على تسلسل معين مع خطواته
export async function getWorkflowSequence(sequenceId: number) {
  try {
    const sequence = await sql`
      SELECT * FROM workflow_sequences 
      WHERE id = ${sequenceId} AND is_active = true
    `

    const steps = await sql`
      SELECT 
        wss.*,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name
      FROM workflow_sequence_steps wss
      JOIN workflow_stages ws ON wss.stage_id = ws.id
      WHERE wss.sequence_id = ${sequenceId}
      ORDER BY wss.step_order
    `

    return {
      sequence: sequence[0] as WorkflowSequence,
      steps: steps as WorkflowSequenceStep[],
    }
  } catch (error) {
    console.error("Error fetching workflow sequence:", error)
    throw error
  }
}

// الحصول على التسلسل الافتراضي لنوع طلبية
export async function getDefaultWorkflowSequence(orderType: "sales_order" | "purchase_order") {
  try {
    const result = await sql`
      SELECT * FROM workflow_sequences 
      WHERE sequence_type = ${orderType} 
      AND is_default = true 
      AND is_active = true
      LIMIT 1
    `
    return result[0] as WorkflowSequence
  } catch (error) {
    console.error("Error fetching default workflow sequence:", error)
    throw error
  }
}

// إنشاء حالة workflow جديدة للطلبية
export async function createOrderWorkflowStatus(
  orderId: number,
  orderType: "sales" | "purchase",
  orderNumber: string,
  assignedToDepartment?: string,
) {
  try {
    // الحصول على التسلسل الافتراضي
    const sequenceType = orderType === "sales" ? "sales_order" : "purchase_order"
    const sequence = await getDefaultWorkflowSequence(sequenceType)

    if (!sequence) {
      throw new Error(`No default workflow sequence found for ${sequenceType}`)
    }

    // الحصول على المرحلة الأولى
    const firstStep = await sql`
      SELECT wss.*, ws.stage_name 
      FROM workflow_sequence_steps wss
      JOIN workflow_stages ws ON wss.stage_id = ws.id
      WHERE wss.sequence_id = ${sequence.id}
      ORDER BY wss.step_order
      LIMIT 1
    `

    if (!firstStep.length) {
      throw new Error(`No steps found for workflow sequence ${sequence.id}`)
    }

    // تحديد القسم المسؤول بناءً على نوع الطلبية إذا لم يتم تحديده
    let department = assignedToDepartment
    if (!department) {
      department = orderType === "sales" ? "المبيعات" : "المشتريات"
    }

    // إنشاء حالة workflow
    const result = await sql`
      INSERT INTO order_workflow_status (
        order_id, order_type, order_number, sequence_id,
        current_stage_id, current_step_order, assigned_to_department,
        stage_start_time, priority_level
      ) VALUES (
        ${orderId}, ${orderType}, ${orderNumber}, ${sequence.id},
        ${firstStep[0].stage_id}, ${firstStep[0].step_order}, 
        ${department}, CURRENT_TIMESTAMP, 'normal'
      )
      RETURNING *
    `

    // تسجيل في التاريخ
    await sql`
      INSERT INTO workflow_history (
        order_id, order_type, order_number, sequence_id,
        to_stage_id, to_stage_name, action_type,
        performed_by_username, performed_by_department, notes
      ) VALUES (
        ${orderId}, ${orderType}, ${orderNumber}, ${sequence.id},
        ${firstStep[0].stage_id}, ${firstStep[0].stage_name}, 'advance',
        'system', ${department}, 'تم إنشاء الطلبية وبدء التسلسل'
      )
    `

    return result[0] as OrderWorkflowStatus
  } catch (error) {
    console.error("Error creating order workflow status:", error)
    throw error
  }
}

// تحديث مرحلة الطلبية
export async function advanceOrderToNextStage(
  orderId: number,
  orderType: "sales" | "purchase",
  performedByUser: string,
  performedByDepartment: string,
  notes?: string,
) {
  try {
    // الحصول على الحالة الحالية
    const currentStatus = await sql`
      SELECT * FROM order_workflow_status 
      WHERE order_id = ${orderId} AND order_type = ${orderType}
    `

    if (!currentStatus.length) {
      throw new Error(`No workflow status found for order ${orderId}`)
    }

    const status = currentStatus[0]

    // الحصول على المرحلة التالية
    const nextStep = await sql`
      SELECT wss.*, ws.stage_name, ws.stage_color, ws.icon_name
      FROM workflow_sequence_steps wss
      JOIN workflow_stages ws ON wss.next_stage_id = ws.id
      WHERE wss.sequence_id = ${status.sequence_id}
      AND wss.step_order = ${status.current_step_order}
    `

    if (!nextStep.length) {
      throw new Error(`No next step found for current stage`)
    }

    const next = nextStep[0]

    const currentStage = await sql`
      SELECT stage_name FROM workflow_stages WHERE id = ${status.current_stage_id}
    `

    const orderTable = orderType === "sales" ? "orders" : "purchase_orders"
    const orderDetails = await sql`
      SELECT order_number, total_amount FROM ${sql(orderTable)} WHERE id = ${orderId}
    `

    // حساب المدة في المرحلة السابقة
    const duration = await sql`
      SELECT CURRENT_TIMESTAMP - ${status.stage_start_time} as duration
    `

    // تحديث حالة الطلبية
    const updatedStatus = await sql`
      UPDATE order_workflow_status SET
        current_stage_id = ${next.next_stage_id},
        current_step_order = ${next.step_order + 1},
        stage_start_time = CURRENT_TIMESTAMP,
        is_overdue = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${status.id}
      RETURNING *
    `

    // تسجيل في التاريخ
    await sql`
      INSERT INTO workflow_history (
        order_id, order_type, order_number, sequence_id,
        from_stage_id, to_stage_id, from_stage_name, to_stage_name,
        action_type, performed_by_username, performed_by_department,
        duration_in_previous_stage, notes
      ) VALUES (
        ${orderId}, ${orderType}, ${status.order_number}, ${status.sequence_id},
        ${status.current_stage_id}, ${next.next_stage_id},
        ${currentStage[0]?.stage_name || "غير محدد"}, ${next.stage_name}, 
        'advance', ${performedByUser}, ${performedByDepartment},
        ${duration[0].duration}, ${notes || null}
      )
    `

    try {
      await createOrderAdvanceNotification(
        orderId,
        orderType,
        orderDetails[0]?.order_number || `${orderType}-${orderId}`,
        currentStage[0]?.stage_name || "غير محدد",
        next.stage_name,
        next.next_stage_id,
        orderDetails[0]?.total_amount || 0,
        performedByUser,
      )
    } catch (notificationError) {
      console.error("Error creating advance notification:", notificationError)
      // Don't fail the workflow if notification fails
    }

    return updatedStatus[0] as OrderWorkflowStatus
  } catch (error) {
    console.error("Error advancing order to next stage:", error)
    throw error
  }
}

// رفض طلبية وإرجاعها لمرحلة سابقة
export async function rejectOrderToAlternativeStage(
  orderId: number,
  orderType: "sales" | "purchase",
  performedByUser: string,
  performedByDepartment: string,
  reason: string,
  notes?: string,
) {
  try {
    const currentStatus = await sql`
      SELECT * FROM order_workflow_status 
      WHERE order_id = ${orderId} AND order_type = ${orderType}
    `

    if (!currentStatus.length) {
      throw new Error(`No workflow status found for order ${orderId}`)
    }

    const status = currentStatus[0]

    // الحصول على المرحلة البديلة (في حالة الرفض)
    const alternativeStep = await sql`
      SELECT wss.*, ws.stage_name, ws.stage_color, ws.icon_name
      FROM workflow_sequence_steps wss
      JOIN workflow_stages ws ON wss.alternative_stage_id = ws.id
      WHERE wss.sequence_id = ${status.sequence_id}
      AND wss.step_order = ${status.current_step_order}
    `

    if (!alternativeStep.length) {
      throw new Error(`No alternative stage found for rejection`)
    }

    const alternative = alternativeStep[0]

    const currentStage = await sql`
      SELECT stage_name FROM workflow_stages WHERE id = ${status.current_stage_id}
    `

    // تحديث حالة الطلبية
    const updatedStatus = await sql`
      UPDATE order_workflow_status SET
        current_stage_id = ${alternative.alternative_stage_id},
        stage_start_time = CURRENT_TIMESTAMP,
        is_overdue = false,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${status.id}
      RETURNING *
    `

    // تسجيل في التاريخ
    await sql`
      INSERT INTO workflow_history (
        order_id, order_type, order_number, sequence_id,
        from_stage_id, to_stage_id, from_stage_name, to_stage_name,
        action_type, performed_by_username, performed_by_department,
        reason, notes
      ) VALUES (
        ${orderId}, ${orderType}, ${status.order_number}, ${status.sequence_id},
        ${status.current_stage_id}, ${alternative.alternative_stage_id},
        ${currentStage[0]?.stage_name || "غير محدد"}, ${alternative.stage_name}, 
        'reject', ${performedByUser}, ${performedByDepartment},
        ${reason}, ${notes || null}
      )
    `

    try {
      await createOrderRejectionNotification(
        orderId,
        orderType,
        status.order_number,
        currentStage[0]?.stage_name || "غير محدد",
        status.current_stage_id,
        reason,
        performedByUser,
        performedByDepartment,
      )
    } catch (notificationError) {
      console.error("Error creating rejection notification:", notificationError)
      // Don't fail the workflow if notification fails
    }

    return updatedStatus[0] as OrderWorkflowStatus
  } catch (error) {
    console.error("Error rejecting order:", error)
    throw error
  }
}

// الحصول على حالة workflow للطلبية
export async function getOrderWorkflowStatus(orderId: number, orderType: "sales" | "purchase") {
  try {
    const result = await sql`
      SELECT 
        ows.*,
        ws.stage_name,
        ws.stage_color,
        ws.icon_name,
        ws.stage_type,
        ws.requires_approval,
        wseq.sequence_name
      FROM order_workflow_status ows
      JOIN workflow_stages ws ON ows.current_stage_id = ws.id
      JOIN workflow_sequences wseq ON ows.sequence_id = wseq.id
      WHERE ows.order_id = ${orderId} AND ows.order_type = ${orderType}
    `

    return result[0] || null
  } catch (error) {
    console.error("Error fetching order workflow status:", error)
    throw error
  }
}

// الحصول على تاريخ workflow للطلبية
export async function getOrderWorkflowHistory(orderId: number, orderType: "sales" | "purchase") {
  try {
    const result = await sql`
      SELECT 
        wh.*,
        ws_from.stage_name as from_stage_display,
        ws_to.stage_name as to_stage_display,
        ws_to.stage_color,
        ws_to.icon_name
      FROM workflow_history wh
      LEFT JOIN workflow_stages ws_from ON wh.from_stage_id = ws_from.id
      JOIN workflow_stages ws_to ON wh.to_stage_id = ws_to.id
      WHERE wh.order_id = ${orderId} AND wh.order_type = ${orderType}
      ORDER BY wh.created_at DESC
    `

    return result as WorkflowHistory[]
  } catch (error) {
    console.error("Error fetching order workflow history:", error)
    throw error
  }
}

// الحصول على الطلبيات حسب المرحلة
export async function getOrdersByStage(stageId: number, department?: string) {
  try {
    if (department) {
      const result = await sql`
        SELECT 
          ows.*,
          ws.stage_name,
          ws.stage_color,
          ws.icon_name,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.customer_name
            WHEN ows.order_type = 'purchase' THEN po.supplier_name
          END as partner_name,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.total_amount
            WHEN ows.order_type = 'purchase' THEN po.total_amount
          END as total_amount,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.order_date
            WHEN ows.order_type = 'purchase' THEN po.order_date
          END as order_date
        FROM order_workflow_status ows
        JOIN workflow_stages ws ON ows.current_stage_id = ws.id
        LEFT JOIN orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
        LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
        WHERE ows.current_stage_id = ${stageId}
        AND ows.assigned_to_department = ${department}
        ORDER BY ows.stage_start_time ASC
      `
      return result
    } else {
      const result = await sql`
        SELECT 
          ows.*,
          ws.stage_name,
          ws.stage_color,
          ws.icon_name,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.customer_name
            WHEN ows.order_type = 'purchase' THEN po.supplier_name
          END as partner_name,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.total_amount
            WHEN ows.order_type = 'purchase' THEN po.total_amount
          END as total_amount,
          CASE 
            WHEN ows.order_type = 'sales' THEN so.order_date
            WHEN ows.order_type = 'purchase' THEN po.order_date
          END as order_date
        FROM order_workflow_status ows
        JOIN workflow_stages ws ON ows.current_stage_id = ws.id
        LEFT JOIN orders so ON ows.order_type = 'sales' AND ows.order_id = so.id
        LEFT JOIN purchase_orders po ON ows.order_type = 'purchase' AND ows.order_id = po.id
        WHERE ows.current_stage_id = ${stageId}
        ORDER BY ows.stage_start_time ASC
      `
      return result
    }
  } catch (error) {
    console.error("Error fetching orders by stage:", error)
    throw error
  }
}

// الحصول على إحصائيات workflow
export async function getWorkflowStatistics(department?: string) {
  try {
    if (department) {
      const result = await sql`
        SELECT 
          ws.stage_name,
          ws.stage_color,
          ws.icon_name,
          COUNT(ows.id) as order_count,
          COUNT(CASE WHEN ows.is_overdue THEN 1 END) as overdue_count,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600) as avg_hours_in_stage
        FROM workflow_stages ws
        LEFT JOIN order_workflow_status ows ON ws.id = ows.current_stage_id
          AND ows.assigned_to_department = ${department}
        WHERE ws.is_active = true
        GROUP BY ws.id, ws.stage_name, ws.stage_color, ws.icon_name
        ORDER BY ws.stage_code
      `
      return result
    } else {
      const result = await sql`
        SELECT 
          ws.stage_name,
          ws.stage_color,
          ws.icon_name,
          COUNT(ows.id) as order_count,
          COUNT(CASE WHEN ows.is_overdue THEN 1 END) as overdue_count,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - ows.stage_start_time))/3600) as avg_hours_in_stage
        FROM workflow_stages ws
        LEFT JOIN order_workflow_status ows ON ws.id = ows.current_stage_id
        WHERE ws.is_active = true
        GROUP BY ws.id, ws.stage_name, ws.stage_color, ws.icon_name
        ORDER BY ws.stage_code
      `
      return result
    }
  } catch (error) {
    console.error("Error fetching workflow statistics:", error)
    throw error
  }
}
