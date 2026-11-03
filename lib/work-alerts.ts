import { getTenantPool } from "@/lib/database"
import { countInternalManufacturingStages } from "@/lib/internal-manufacturing-request"
import { isWorkspaceAdmin } from "@/lib/task-orders"

// تنبيهات العمل (جرس الرأس): أعداد حيّة لما ينتظر معالجة — تُحسب عند الطلب ولا تُخزَّن، فتختفي وحدها حين تُعالَج.
// كل تنبيه يحمل القسم الذي يفتحه؛ الواجهة تُخفي تنبيه أي قسم لا يملك المستخدم صلاحية فتحه.

export type WorkAlert = {
  key: string
  title: string
  message: string
  count: number
  section: string
  priority: "normal" | "high" | "urgent"
}

type Query = (text: string, values?: unknown[]) => Promise<any[]>

// جدول/عمود غير موجود في قاعدة شركة قديمة ⇒ لا تنبيه بدل كسر الجرس كله
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (["42P01", "42703"].includes(String((error as { code?: string })?.code))) return fallback
    throw error
  }
}

const INTERNAL_STAGES: Record<number, { section: string; label: string }> = {
  2: { section: "internal-manufacturing-request-audit", label: "بانتظار التدقيق" },
  3: { section: "internal-manufacturing-preparation", label: "بانتظار التجهيز" },
  4: { section: "internal-manufacturing-ready-audit", label: "بانتظار تدقيق الجاهز" },
  5: { section: "internal-manufacturing-send", label: "بانتظار الإرسال" },
  6: { section: "internal-manufacturing-receive", label: "بانتظار الاستلام" },
  7: { section: "internal-manufacturing-received-audit", label: "بانتظار تدقيق المستلم" },
}

/** branchIds فارغة = كل الفروع؛ activeBranchId لطلب البضاعة الداخلي (كل مرحلة تخص فرعاً منفِّذاً). */
export async function buildWorkAlerts(branchIds: number[], activeBranchId: number | null, userId?: string): Promise<WorkAlert[]> {
  const pool = await getTenantPool()
  const query: Query = async (text, values = []) => (await pool.query(text, values)).rows
  const all = branchIds.length === 0
  const scope = (column: string) => `($1::boolean OR ${column} = ANY($2::int[]))`
  const params = [all, branchIds]
  const count = (rows: any[]) => Number(rows[0]?.count || 0)
  const alerts: WorkAlert[] = []
  const push = (alert: Omit<WorkAlert, "count">, value: number) => { if (value > 0) alerts.push({ ...alert, count: value }) }

  const [internal, drafts, dueOrders, chequesDue, chequesSoon, portal, counts, attendance, purchaseDue] = await Promise.all([
    activeBranchId ? optional(() => countInternalManufacturingStages(activeBranchId), {} as Record<number, number>) : Promise.resolve({} as Record<number, number>),
    optional(() => query(`
      SELECT COUNT(*) count FROM sales_order_drafts
      WHERE confirmed_order_id IS NULL AND COALESCE(status,'draft') NOT IN ('confirmed','cancelled','canceled','rejected','converted') AND ${scope("branch_id")}`, params), []),
    optional(() => query(`
      SELECT COUNT(*) count FROM orders o
      WHERE o.order_type = 1 AND COALESCE(o.order_status,1) IN (1,2,3) AND o.delivery_date IS NOT NULL AND o.delivery_date::date <= CURRENT_DATE
        AND ${scope("o.branch_id")}
        AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND COALESCE(oi.quantity,0) - COALESCE(oi.delivered_quantity,0) > 0)`, params), []),
    optional(() => query(`
      SELECT COUNT(*) count FROM cheques_tbl ch LEFT JOIN voucher_header_tbl vh ON vh.id = ch.voucher_id
      WHERE ch.cheq_type = 1 AND ch.status_id IN (1,2,3) AND ch.due_date::date <= CURRENT_DATE AND ${scope("vh.branch_id")}`, params), []),
    optional(() => query(`
      SELECT COUNT(*) count FROM cheques_tbl ch LEFT JOIN voucher_header_tbl vh ON vh.id = ch.voucher_id
      WHERE ch.cheq_type = 1 AND ch.status_id IN (1,2,3) AND ch.due_date::date > CURRENT_DATE AND ch.due_date::date <= CURRENT_DATE + 3 AND ${scope("vh.branch_id")}`, params), []),
    optional(() => query(`SELECT COUNT(*) count FROM customer_portal_payments_tbl WHERE status = 'pending'`), []),
    optional(() => query(`SELECT COUNT(*) count FROM stock_counts WHERE status = 2 AND ${scope("branch_id")}`, params), []),
    optional(() => query(`SELECT COUNT(*) count FROM attendance_transactions_tbl WHERE status = 'pending'`), []),
    optional(() => query(`
      SELECT COUNT(*) count FROM orders o
      WHERE o.order_type = 2 AND COALESCE(o.order_status,1) IN (1,2,3) AND o.delivery_date IS NOT NULL AND o.delivery_date::date < CURRENT_DATE
        AND ${scope("o.branch_id")}
        AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND COALESCE(oi.quantity,0) - COALESCE(oi.delivered_quantity,0) > 0)`, params), []),
  ])

  for (const [status, stage] of Object.entries(INTERNAL_STAGES)) {
    const value = Number((internal as Record<number, number>)[Number(status)] || 0)
    push({ key: `internal-${status}`, title: "يوجد طلب بضاعة بحاجة للمعالجة", message: `${value} طلب بضاعة داخلي ${stage.label}`, section: stage.section, priority: "high" }, value)
  }
  push({ key: "sales-drafts", title: "يوجد مسودة طلبية مبيعات", message: `${count(drafts)} مسودة طلبية مبيعات لم تُعتمد بعد`, section: "draft-sales-order", priority: "normal" }, count(drafts))
  push({ key: "sales-orders-due", title: "يوجد طلبيات مبيعات مستحقة التسليم لم يتم معالجتها", message: `${count(dueOrders)} طلبية مبيعات حلّ موعد تسليمها ولم تُسلَّم بالكامل`, section: "sales-orders", priority: "urgent" }, count(dueOrders))
  push({ key: "cheques-due", title: "يوجد شيكات واردة مستحقة", message: `${count(chequesDue)} شيك وارد حلّ تاريخ استحقاقه ولم يُودَع أو يُحصَّل`, section: "cheques", priority: "urgent" }, count(chequesDue))
  push({ key: "cheques-soon", title: "شيكات واردة تستحق خلال 3 أيام", message: `${count(chequesSoon)} شيك وارد يستحق قريباً — جهّز الإيداع`, section: "cheques", priority: "normal" }, count(chequesSoon))
  push({ key: "purchase-orders-late", title: "طلبيات مشتريات متأخرة الاستلام", message: `${count(purchaseDue)} طلبية مشتريات تجاوزت موعد التوريد ولم تُستلم بالكامل`, section: "purchase-orders", priority: "high" }, count(purchaseDue))
  push({ key: "portal-payments", title: "إشعارات تحويل من العملاء بانتظار الاعتماد", message: `${count(portal)} إشعار تحويل مرفوع من بوابة العملاء`, section: "customer-portal", priority: "high" }, count(portal))
  push({ key: "stock-counts", title: "جرد منتهٍ بانتظار المطابقة والاعتماد", message: `${count(counts)} جرد مخازن انتهى وينتظر الاعتماد`, section: "stock-count-approval", priority: "normal" }, count(counts))
  push({ key: "attendance", title: "حركات دوام بانتظار الاعتماد", message: `${count(attendance)} حركة (إضافي/خصم) بانتظار الاعتماد`, section: "attendance-transactions", priority: "normal" }, count(attendance))

  // مهام أوامر العمل المتأخرة (تجاوزت "مدة العمل المتوقعة"): لمن يعمل عليها دائماً (مستلمها، أو أعضاء قسمها إن لم
  // تُستلم)، ولمدير القسم/مسؤول النظام حسب "عند تجاوز مدة العمل المتوقعة" في الخطوة.
  if (userId) {
    const admin = await optional(() => isWorkspaceAdmin(userId), false)
    const late = await optional(() => query(`
      WITH late AS (
        SELECT si.id, COALESCE(si.override_section_id, st.section_id) AS section_id, si.claimed_by_user_id, st.sla_actions
        FROM task_step_instances si JOIN task_workflow_steps st ON st.id = si.step_id
        WHERE si.status IN ('pending', 'in_progress', 'paused') AND COALESCE(st.sla_hours, 0) > 0
          AND si.created_at + (st.sla_hours * INTERVAL '1 hour') < CURRENT_TIMESTAMP
      )
      SELECT
        COUNT(*) FILTER (WHERE late.claimed_by_user_id::text = $1
          OR (late.claimed_by_user_id IS NULL AND EXISTS (SELECT 1 FROM task_section_users su WHERE su.section_id = late.section_id AND su.user_id::text = $1))) AS mine,
        COUNT(*) FILTER (WHERE 'notify_manager' = ANY(late.sla_actions)
          AND EXISTS (SELECT 1 FROM task_section_users su WHERE su.section_id = late.section_id AND su.user_id::text = $1 AND su.is_manager)) AS managed,
        COUNT(*) FILTER (WHERE $2::boolean AND 'notify_admin' = ANY(late.sla_actions)) AS admin
      FROM late`, [String(userId), admin]), [])
    const row = late[0] || {}
    const mine = Number(row.mine || 0)
    const supervised = Math.max(Number(row.managed || 0), Number(row.admin || 0))
    push({ key: "task-orders-late", title: "مهام متأخرة عن مدة العمل المتوقعة", message: `${mine} مهمة من مهامك تجاوزت المدة المتوقعة`, section: "task-orders-board", priority: "urgent" }, mine)
    push({ key: "task-orders-late-supervised", title: "مهام متأخرة في الأقسام التي تتابعها", message: `${supervised} مهمة تجاوزت مدة العمل المتوقعة`, section: "task-orders-board", priority: "high" }, supervised)
  }

  const rank = { urgent: 0, high: 1, normal: 2 }
  return alerts.sort((a, b) => rank[a.priority] - rank[b.priority])
}
