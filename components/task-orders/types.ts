export interface TaskBranch {
  id: number
  code: string
  name: string
  is_active: boolean
}

export interface TaskSectionMember {
  id: number
  section_id: number
  user_id: string
  is_manager: boolean
  full_name: string | null
  username: string | null
  user_role: string | null
}

export interface TaskSection {
  id: number
  name: string
  description: string | null
  branch_id: number | null
  branch_name: string | null
  branch_code: string | null
  is_active: boolean
  members: TaskSectionMember[]
}

export type AssignmentType = "all" | "specific"
export type JoinType = "none" | "and" | "or"
export type StepType = string

export interface TaskWorkflowStep {
  id: number
  workflow_id: number
  key: string
  label: string
  section_id: number
  section_name: string
  assignment_type: AssignmentType
  assigned_user_id: string | null
  is_start: boolean
  is_end: boolean
  join_type: JoinType
  sla_hours: number | null
  is_conditional: boolean
  sla_actions: string[]
  step_type: StepType
  mandatory?: boolean
  show_all_items?: boolean
  print_barcode?: boolean
  attachment_required?: boolean
}

export interface TaskWorkflowTransition {
  id: number
  workflow_id: number
  from_step_id: number
  to_step_id: number
  condition_key: string | null
  condition_value: string | null
}

export type WorkflowType = "general" | "group" | "specific"

export interface TaskWorkflow {
  id: number
  name: string
  description: string | null
  type: WorkflowType
  item_id: number | null
  item_type: string | null
  group_id: number | null
  group_name: string | null
  branch_id: number | null
  branch_name: string | null
  item_ids: number[]
  version: number
  is_active: boolean
  usage_count: number
  steps: TaskWorkflowStep[]
  transitions: TaskWorkflowTransition[]
  created_at: string
}

export type OrderItemStatus = "in_workflow" | "completed" | "cancelled"
export type StepInstanceStatus = "pending" | "in_progress" | "paused" | "completed" | "rejected" | "cancelled"
export type Priority = "low" | "normal" | "high" | "urgent"

export interface TaskOpenTask {
  id: number
  order_item_id: number
  item_code: string
  title: string
  description: string | null
  item_priority: Priority
  workflow_id: number
  workflow_name: string
  item_status: OrderItemStatus
  customer_order_id: number | null
  step_id: number
  step_key: string
  step_label: string
  step_type: StepType
  mandatory?: boolean
  show_all_items?: boolean
  print_barcode?: boolean
  attachment_required?: boolean
  assignment_type: AssignmentType
  sla_hours: number | null
  is_end: boolean
  effective_section_id: number
  section_name: string
  status: StepInstanceStatus
  claimed_by_user_id: string | null
  claimed_by_name: string | null
  total_duration_seconds: number
  running_since: string | null
  has_running_timer: boolean
  created_at: string
  item_created_at: string
}

export interface TaskExecutionLog {
  id: number
  step_instance_id: number
  order_item_id: number
  user_id: string | null
  user_name: string | null
  action: string
  at: string
  duration_sec: number
  note: string | null
}

export interface TaskTransferLog {
  id: number
  step_instance_id: number
  from_section_id: number | null
  to_section_id: number | null
  from_user_id: string | null
  from_user_name: string | null
  to_user_id: string | null
  to_user_name: string | null
  admin_id: string
  admin_name: string | null
  reason: string
  at: string
  from_section_name: string | null
  to_section_name: string | null
}

export interface TaskStepInstance {
  id: number
  order_item_id: number
  step_id: number
  step_key: string
  step_label: string
  step_type: StepType
  assignment_type: AssignmentType
  is_end: boolean
  join_type: JoinType
  effective_section_id: number
  section_name: string
  status: StepInstanceStatus
  claimed_by_user_id: string | null
  claimed_by_name: string | null
  first_started_at: string | null
  completed_at: string | null
  rejected_at: string | null
  parent_instance_id: number | null
  total_duration_seconds: number
  created_at: string
}

export interface TaskOrderItemRow {
  id: number
  item_code: string
  title: string
  workflow_id: number
  workflow_name: string
  customer_order_code: string | null
  customer_name: string | null
  created_by_name: string | null
  priority: Priority
  status: OrderItemStatus
  open_task_count: number
  current_steps: string | null
  last_note: string | null
  last_note_at: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskOrderItemDetail {
  id: number
  item_code: string
  customer_order_id: number | null
  customer_order_code: string | null
  source_order_number: string | null
  customer_name: string | null
  title: string
  description: string | null
  product_id: number | null
  item_type: string | null
  qty: number | null
  prepared_qty: number | null
  loading_checked_at: string | null
  loading_checked_by: string | null
  attributes: Record<string, string>
  workflow_id: number
  workflow_name: string
  priority: Priority
  status: OrderItemStatus
  created_by: string
  created_by_name: string | null
  created_at: string
  completed_at: string | null
  instances: TaskStepInstance[]
  logs: TaskExecutionLog[]
  transfers: TaskTransferLog[]
  workflowSteps: TaskWorkflowStep[]
  workflowTransitions: TaskWorkflowTransition[]
}

// صف صنف شقيق داخل نفس الطلبية — تُستخدَم بلوحة الأصناف الشقيقة (order-items-panel.tsx) عند العمل
// على خطوة من نوع تدقيق/اعتماد/تجهيز/تحميل.
export interface SiblingOrderItem {
  id: number
  item_code: string
  title: string
  qty: number | null
  prepared_qty: number | null
  loading_checked_at: string | null
  loading_checked_by: string | null
  status: OrderItemStatus
}

// طلبية قابلة للاعتماد النهائي — تُستخدَم بشاشة اعتماد الطلبيات الجاهزة الجديدة.
export interface ApprovableCustomerOrder {
  id: number
  order_code: string
  customer_id: number | null
  customer_name: string | null
  priority: Priority
  status: string
  source_order_id: number
  item_count: number
  created_at: string
  completed_at: string | null
}

export interface AppUser {
  user_id: string
  full_name: string
  username: string
  role: string | null
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
}

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  normal: "خطوة عادية",
  audit: "تدقيق",
  approval: "اعتماد",
  preparation: "تجهيز",
  loading: "تحميل",
}

export const STEP_STATUS_LABELS: Record<StepInstanceStatus, string> = {
  pending: "بالانتظار",
  in_progress: "قيد العمل",
  paused: "متوقف مؤقتاً",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغى",
}

export const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  start: "بدء",
  stop: "إيقاف مؤقت",
  complete: "إنهاء",
  force_complete: "إنهاء إجباري (إداري)",
  reject: "رفض",
  force_reject: "رفض إجباري (إداري)",
  transfer: "تحويل إداري",
  force_close: "إغلاق إجباري للطلبية",
}
