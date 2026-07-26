import sql from "@/lib/database"
import { createNotification } from "@/lib/notifications"

// محرك "تتبع أوامر العمل" — نظام تتبع طلبيات متعدد الفروع/الأقسام مبني على سير عمل موصوف كرسم
// بياني موجَّه (DAG): كل صنف طلبية (order_item) يمرّ عبر خطوات (workflow_steps) مترابطة بانتقالات
// (workflow_transitions) قد تتفرّع بالتوازي (AND) أو تتفرّع شرطياً (XOR عبر شروط متنافية) وتلتقي
// لاحقاً (join_type). "تعريف" الخطوة (WorkflowStep) منفصل تماماً عن "نسخة تنفيذها" الفعلية لكل صنف
// (StepInstance) — تعديل سير عمل مستخدَم فعلياً لا يُصحّح الأصناف الجارية عليه، بل يُنشئ نسخة
// (version) جديدة يعمل بها الجديد فقط. سجلّ التنفيذ (execution_logs) إضافة فقط (Insert-only) أبداً
// لا UPDATE/DELETE — منه تُحسب مدد العمل ويُبنى مسار التدقيق الكامل. بادئة task_ على كل الجداول
// لتفادي أي تعارض مع نظام طلبيات المبيعات/المشتريات القائم في هذا المشروع.

let tablesReady: Promise<void> | null = null

export function ensureTaskOrderTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS task_branches (
          id SERIAL PRIMARY KEY,
          code VARCHAR(20) UNIQUE NOT NULL,
          name VARCHAR(150) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      // branch_id يشير إلى جدول "branches" العام (تعريفات الفروع الحقيقية في النظام) لا إلى
      // task_branches المحلي — بلا قيد FK صريح عابر للوحدات (نفس أسلوب هذا المشروع في ربط جداول
      // من وحدات مختلفة، كـitem_id في task_workflows أعلاه)، تفادياً لتعطّل الترحيل لو تضاربت
      // معرّفات الفروع القديمة عند التبديل من task_branches. القيد القديم يُزال أدناه لأي قاعدة
      // بيانات أُنشئت قبل هذا التغيير.
      await sql`
        CREATE TABLE IF NOT EXISTS task_sections (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          description TEXT,
          branch_id INTEGER,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`ALTER TABLE task_sections ADD COLUMN IF NOT EXISTS branch_id INTEGER`
      await sql`ALTER TABLE task_sections DROP CONSTRAINT IF EXISTS task_sections_branch_id_fkey`
      // عضوية قسم: علاقة N:M عمداً (خلافاً لِـ"قسم واحد فقط للمستخدم" بالمواصفة) — تعميم بسيط لا
      // يكسر أياً من قواعد العمل المذكورة (R1 تبقى صحيحة لكل صف عضوية على حدة)، ويسمح لموظف يغطّي
      // أكثر من قسم دون حلول التفافية إدارية.
      await sql`
        CREATE TABLE IF NOT EXISTS task_section_users (
          id SERIAL PRIMARY KEY,
          section_id INTEGER NOT NULL REFERENCES task_sections(id) ON DELETE CASCADE,
          user_id VARCHAR(255) NOT NULL,
          is_manager BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(section_id, user_id)
        )
      `
      // type: 'general' (افتراضي لِـitem_type) أو 'group' (خاص بمجموعة أصناف عبر group_id — يُقارَن
      // بـitem_groups.id) أو 'specific' (خاص بصنف/أصناف محددة — عبر task_workflow_items أدناه، لا
      // item_id وحده، لأن الشاشة تسمح باختيار أكثر من صنف). لا قيد FK صريح على group_id/item_id عبر
      // الوحدات، أسوةً بأسلوب هذا المشروع بربط الجداول عبر الوحدات المختلفة. version: يُنشئ صفاً
      // جديداً بدل تعديل صف قائم عند تعديل سير عمل عليه أصناف طلبية جارية فعلاً — الأصناف القائمة
      // تبقى مرتبطة بمعرّف الإصدار القديم (workflow_id) دون أي تأثير، بينما is_active يُنقَل
      // للإصدار الجديد فقط.
      await sql`
        CREATE TABLE IF NOT EXISTS task_workflows (
          id SERIAL PRIMARY KEY,
          name VARCHAR(150) NOT NULL,
          description TEXT,
          type VARCHAR(20) NOT NULL DEFAULT 'general',
          item_id INTEGER,
          item_type VARCHAR(100),
          group_id INTEGER,
          branch_id INTEGER,
          status INTEGER NOT NULL DEFAULT 1,
          version INTEGER NOT NULL DEFAULT 1,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS group_id INTEGER`
      // branch_id يشير إلى جدول "branches" العام (نفس أسلوب task_sections.branch_id) — NULL يعني
      // "الكل" (يطبَّق على كل الفروع). لا قيد FK صريح عابر للوحدات.
      await sql`ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS branch_id INTEGER`
      // status: 1=فعّال عادي، 2=محذوف (حذف منطقي عبر deleteWorkflow) — مختلف عن is_active التي
      // تُميّز "إصدار قديم استُبدل بآخر جديد" (يبقى قابلاً للعرض/التدقيق)؛ الحذف المنطقي (status=2)
      // يُخفي السير تماماً من القوائم (انظر تصفية status في listWorkflows).
      await sql`ALTER TABLE task_workflows ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
      // أصناف سير عمل النوع 'specific' (قد تكون أكثر من صنف واحد) — إضافة/حذف كامل عند كل حفظ
      // خطوات (انظر saveWorkflowItems)، لا تعديل تراكمي.
      await sql`
        CREATE TABLE IF NOT EXISTS task_workflow_items (
          id SERIAL PRIMARY KEY,
          workflow_id INTEGER NOT NULL REFERENCES task_workflows(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL,
          UNIQUE(workflow_id, product_id)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS task_workflow_steps (
          id SERIAL PRIMARY KEY,
          workflow_id INTEGER NOT NULL REFERENCES task_workflows(id) ON DELETE CASCADE,
          key VARCHAR(50) NOT NULL,
          label VARCHAR(150) NOT NULL,
          section_id INTEGER NOT NULL REFERENCES task_sections(id),
          assignment_type VARCHAR(20) NOT NULL DEFAULT 'all',
          assigned_user_id VARCHAR(255),
          is_start BOOLEAN DEFAULT false,
          is_end BOOLEAN DEFAULT false,
          join_type VARCHAR(10) NOT NULL DEFAULT 'none',
          sla_hours NUMERIC,
          is_conditional BOOLEAN NOT NULL DEFAULT false,
          sla_actions TEXT[] NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(workflow_id, key)
        )
      `
      await sql`ALTER TABLE task_workflow_steps ADD COLUMN IF NOT EXISTS is_conditional BOOLEAN NOT NULL DEFAULT false`
      await sql`ALTER TABLE task_workflow_steps ADD COLUMN IF NOT EXISTS sla_actions TEXT[] NOT NULL DEFAULT '{}'`
      await sql`
        CREATE TABLE IF NOT EXISTS task_workflow_transitions (
          id SERIAL PRIMARY KEY,
          workflow_id INTEGER NOT NULL REFERENCES task_workflows(id) ON DELETE CASCADE,
          from_step_id INTEGER NOT NULL REFERENCES task_workflow_steps(id) ON DELETE CASCADE,
          to_step_id INTEGER NOT NULL REFERENCES task_workflow_steps(id) ON DELETE CASCADE,
          condition_key VARCHAR(100),
          condition_value VARCHAR(200),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS task_customer_orders (
          id SERIAL PRIMARY KEY,
          order_code VARCHAR(30) UNIQUE,
          customer_id INTEGER,
          status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          created_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `
      // attributes: JSONB حرّة تحمل سمات الصنف (كـ"النوع الفرعي"، أو أي مفتاح/قيمة يلزم انتقالات
      // سير العمل الشرطية — condition_key/condition_value أعلاه تُقارَن مباشرة بهذا الحقل).
      await sql`
        CREATE TABLE IF NOT EXISTS task_order_items (
          id SERIAL PRIMARY KEY,
          item_code VARCHAR(30) UNIQUE,
          customer_order_id INTEGER REFERENCES task_customer_orders(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          product_id INTEGER,
          item_type VARCHAR(100),
          qty NUMERIC,
          attributes JSONB NOT NULL DEFAULT '{}',
          workflow_id INTEGER NOT NULL REFERENCES task_workflows(id),
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          status VARCHAR(20) NOT NULL DEFAULT 'in_workflow',
          created_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        )
      `
      // override_section_id: تحويل إداري لقسم التنفيذ الفعلي لهذه النسخة وحدها (دون المساس بتعريف
      // الخطوة المشتركة بين كل الأصناف). claimed_by_user_id فارغ + status='pending' يعني "متاحة لكل
      // أعضاء القسم" (assignment_type='all')؛ تُملأ لحظة أول Start (قفل تفاؤلي عبر شرط WHERE عند
      // التحديث) أو فوراً إن كانت assignment_type='specific'.
      await sql`
        CREATE TABLE IF NOT EXISTS task_step_instances (
          id SERIAL PRIMARY KEY,
          order_item_id INTEGER NOT NULL REFERENCES task_order_items(id) ON DELETE CASCADE,
          step_id INTEGER NOT NULL REFERENCES task_workflow_steps(id),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          claimed_by_user_id VARCHAR(255),
          override_section_id INTEGER REFERENCES task_sections(id),
          first_started_at TIMESTAMP,
          completed_at TIMESTAMP,
          rejected_at TIMESTAMP,
          parent_instance_id INTEGER REFERENCES task_step_instances(id),
          total_duration_seconds INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      // إضافة فقط — لا UPDATE ولا DELETE على هذا الجدول من أي دالة بالملف (مصدر الحقيقة الوحيد
      // لحساب المدد ولمسار التدقيق الكامل؛ انظر logTerminalAction التي تُدرِج صفاً جديداً دائماً
      // بدل تعديل صف 'start' القائم).
      await sql`
        CREATE TABLE IF NOT EXISTS task_execution_logs (
          id SERIAL PRIMARY KEY,
          step_instance_id INTEGER NOT NULL REFERENCES task_step_instances(id) ON DELETE CASCADE,
          order_item_id INTEGER NOT NULL REFERENCES task_order_items(id) ON DELETE CASCADE,
          user_id VARCHAR(255),
          action VARCHAR(20) NOT NULL,
          at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          duration_sec INTEGER NOT NULL DEFAULT 0,
          note TEXT
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS task_transfer_logs (
          id SERIAL PRIMARY KEY,
          step_instance_id INTEGER NOT NULL REFERENCES task_step_instances(id) ON DELETE CASCADE,
          order_item_id INTEGER NOT NULL REFERENCES task_order_items(id) ON DELETE CASCADE,
          from_section_id INTEGER,
          to_section_id INTEGER,
          from_user_id VARCHAR(255),
          to_user_id VARCHAR(255),
          admin_id VARCHAR(255) NOT NULL,
          reason TEXT NOT NULL,
          at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_task_step_instances_item ON task_step_instances(order_item_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_step_instances_status ON task_step_instances(status)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_step_instances_claim ON task_step_instances(claimed_by_user_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_execution_logs_instance ON task_execution_logs(step_instance_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_execution_logs_item ON task_execution_logs(order_item_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_workflow_steps_workflow ON task_workflow_steps(workflow_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_workflow_transitions_from ON task_workflow_transitions(from_step_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_task_section_users_user ON task_section_users(user_id)`
    })()
  }
  return tablesReady
}

// ------------------------------------------------------------------
// الفروع (Branches)
// ------------------------------------------------------------------

export async function listBranches() {
  await ensureTaskOrderTables()
  return sql`SELECT * FROM task_branches ORDER BY name`
}

export async function createBranch(data: { code: string; name: string }) {
  await ensureTaskOrderTables()
  const result = await sql`
    INSERT INTO task_branches (code, name) VALUES (${data.code}, ${data.name}) RETURNING *
  `
  return result[0]
}

export async function updateBranch(id: number, data: { code?: string; name?: string; is_active?: boolean }) {
  await ensureTaskOrderTables()
  const result = await sql`
    UPDATE task_branches
    SET code = COALESCE(${data.code}, code), name = COALESCE(${data.name}, name),
        is_active = COALESCE(${data.is_active}, is_active), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return result[0] || null
}

// ------------------------------------------------------------------
// الأقسام (Sections) وأعضاؤها + صلاحيات الوصول
// ------------------------------------------------------------------

export async function listSections() {
  await ensureTaskOrderTables()
  const sections = await sql`
    SELECT s.*, b.branch_name AS branch_name, b.branch_code AS branch_code
    FROM task_sections s
    LEFT JOIN branches b ON b.id = s.branch_id
    ORDER BY s.name
  `
  const members = await sql`
    SELECT su.*, u.full_name, u.username, u.role AS user_role
    FROM task_section_users su
    LEFT JOIN user_settings u ON u.user_id = su.user_id
    ORDER BY su.is_manager DESC, u.full_name
  `
  return sections.map((s: any) => ({ ...s, members: members.filter((m: any) => m.section_id === s.id) }))
}

export async function createSection(data: { name: string; description?: string; branch_id?: number | null }) {
  await ensureTaskOrderTables()
  const result = await sql`
    INSERT INTO task_sections (name, description, branch_id)
    VALUES (${data.name}, ${data.description || null}, ${data.branch_id || null})
    RETURNING *
  `
  return result[0]
}

export async function updateSection(
  id: number,
  data: { name?: string; description?: string; is_active?: boolean; branch_id?: number | null },
) {
  await ensureTaskOrderTables()
  const result = await sql`
    UPDATE task_sections
    SET name = COALESCE(${data.name}, name),
        description = COALESCE(${data.description}, description),
        is_active = COALESCE(${data.is_active}, is_active),
        branch_id = COALESCE(${data.branch_id}, branch_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return result[0] || null
}

export async function addSectionMember(sectionId: number, userId: string, isManager: boolean) {
  await ensureTaskOrderTables()
  const result = await sql`
    INSERT INTO task_section_users (section_id, user_id, is_manager)
    VALUES (${sectionId}, ${userId}, ${isManager})
    ON CONFLICT (section_id, user_id) DO UPDATE SET is_manager = ${isManager}
    RETURNING *
  `
  return result[0]
}

export async function removeSectionMember(sectionId: number, userId: string) {
  await ensureTaskOrderTables()
  await sql`DELETE FROM task_section_users WHERE section_id = ${sectionId} AND user_id = ${userId}`
}

export async function getSectionMemberUserIds(sectionId: number): Promise<string[]> {
  const rows = await sql`SELECT user_id FROM task_section_users WHERE section_id = ${sectionId}`
  return rows.map((r: any) => r.user_id)
}

export async function isSectionMember(sectionId: number, userId: string): Promise<{ isMember: boolean; isManager: boolean }> {
  const rows = await sql`SELECT is_manager FROM task_section_users WHERE section_id = ${sectionId} AND user_id = ${userId}`
  if (rows.length === 0) return { isMember: false, isManager: false }
  return { isMember: true, isManager: !!rows[0].is_manager }
}

export async function isWorkspaceAdmin(userId: string): Promise<boolean> {
  const rows = await sql`SELECT role, permissions FROM user_settings WHERE user_id = ${userId} LIMIT 1`
  if (rows.length === 0) return false
  const { role, permissions } = rows[0]
  if (role === "مدير النظام") return true
  try {
    const perms = typeof permissions === "string" ? JSON.parse(permissions) : permissions
    if (perms?.all || perms?.["جميع الصلاحيات"]) return true
    if (perms?.["task-orders"]?.admin) return true
  } catch {
    // permissions غير صالحة كـJSON — تُعامَل كغياب صلاحية الإدارة
  }
  return false
}

async function assertSectionAccess(sectionId: number, userId: string) {
  if (await isWorkspaceAdmin(userId)) return
  const membership = await isSectionMember(sectionId, userId)
  if (!membership.isMember) throw new Error("لا تملك صلاحية التعامل مع مهام هذا القسم")
}

async function assertAdmin(userId: string) {
  if (!(await isWorkspaceAdmin(userId))) throw new Error("هذا الإجراء متاح لمدير النظام فقط")
}

// ------------------------------------------------------------------
// إشعارات
// ------------------------------------------------------------------

// الإشعار أثر جانبي "أفضل جهد" (best-effort) دوماً — فشله (خدمة واتساب غير مُهيَّأة، أو أي عطل
// عابر) يجب ألا يُسقِط الإجراء الأساسي (بدء/إنهاء/رفض مهمة فعلية) الذي استدعاه؛ لذا كل استدعاء
// createNotification هنا محميّ بمحاولة/التقاط صامتة (مع تسجيل الخطأ) بدل تركه يُفشل السلسلة كلها.
async function safeNotify(payload: Parameters<typeof createNotification>[0]) {
  try {
    await createNotification(payload)
  } catch (error) {
    console.error("[task-orders] notification failed (non-blocking):", error)
  }
}

async function notifySectionMembers(sectionId: number, data: { title: string; message: string; orderItemId: number; itemCode: string }) {
  const memberIds = await getSectionMemberUserIds(sectionId)
  await Promise.all(
    memberIds.map((userId) =>
      safeNotify({
        notification_type: "task_order",
        title: data.title,
        message: data.message,
        recipient_user_id: Number(userId),
        related_order_id: data.orderItemId,
        related_order_type: "task_order_item",
        related_order_number: data.itemCode,
        priority_level: "normal",
      }),
    ),
  )
}

async function notifySectionManagers(sectionId: number, data: { title: string; message: string; orderItemId: number; itemCode: string }) {
  const rows = await sql`SELECT user_id FROM task_section_users WHERE section_id = ${sectionId} AND is_manager = true`
  await Promise.all(
    rows.map((r: any) =>
      safeNotify({
        notification_type: "task_order",
        title: data.title,
        message: data.message,
        recipient_user_id: Number(r.user_id),
        related_order_id: data.orderItemId,
        related_order_type: "task_order_item",
        related_order_number: data.itemCode,
        priority_level: "normal",
      }),
    ),
  )
}

async function notifyUser(userId: string, data: { title: string; message: string; orderItemId: number; itemCode: string }) {
  await safeNotify({
    notification_type: "task_order",
    title: data.title,
    message: data.message,
    recipient_user_id: Number(userId),
    related_order_id: data.orderItemId,
    related_order_type: "task_order_item",
    related_order_number: data.itemCode,
    priority_level: "normal",
  })
}

// ------------------------------------------------------------------
// سير العمل (Workflows): تعريف + خطوات + انتقالات (DAG)
// ------------------------------------------------------------------

export async function listWorkflows() {
  await ensureTaskOrderTables()
  const workflows = await sql`
    SELECT w.*, g.group_name, b.branch_name,
      (SELECT COUNT(*) FROM task_order_items i WHERE i.workflow_id = w.id) AS usage_count
    FROM task_workflows w
    LEFT JOIN item_groups g ON g.id = w.group_id
    LEFT JOIN branches b ON b.id = w.branch_id
    WHERE w.status <> 2
    ORDER BY w.name, w.version DESC
  `
  const steps = await sql`
    SELECT st.*, s.name AS section_name
    FROM task_workflow_steps st
    JOIN task_sections s ON s.id = st.section_id
    ORDER BY st.workflow_id, st.id
  `
  const transitions = await sql`SELECT * FROM task_workflow_transitions ORDER BY workflow_id, id`
  const items = await sql`SELECT workflow_id, product_id FROM task_workflow_items ORDER BY workflow_id, id`
  return workflows.map((w: any) => ({
    ...w,
    steps: steps.filter((s: any) => s.workflow_id === w.id),
    transitions: transitions.filter((t: any) => t.workflow_id === w.id),
    item_ids: items.filter((i: any) => i.workflow_id === w.id).map((i: any) => Number(i.product_id)),
  }))
}

// يمنع أكثر من سير عمل نشِط "متطابق" حسب معيار كل نوع، على أي فرع "يتداخل" مع الفرع المطلوب —
// فرعان يتداخلان إن كان أحدهما NULL ("الكل"، يشمل كل الفروع ضمناً بما فيها كل فرع محدَّد) أو كانا
// نفس الفرع تحديداً؛ فرعان محدَّدان مختلفان فقط لا يتداخلان. لذا سير عمل "الكل" يتعارض مع أي سير
// عمل لفرع محدَّد (والعكس)، لا مع سير آخر لفرع "الكل" فقط كما كان سابقاً.
// 'general': تداخل فرع فقط. 'group': تداخل فرع + نفس المجموعة. 'specific': تداخل فرع + أي صنف
// مشترك مع أصناف سير عمل قائم (سواء على نفس الفرع تحديداً أو عبر سير "الكل").
async function assertNoDuplicateWorkflow(
  type: string,
  data: { branch_id: number | null; group_id?: number | null; item_ids?: number[] },
  excludeWorkflowId?: number,
) {
  const activeSameType = await sql`
    SELECT * FROM task_workflows
    WHERE is_active = true AND type = ${type}
      AND (branch_id IS NULL OR ${data.branch_id}::int IS NULL OR branch_id = ${data.branch_id})
      AND id IS DISTINCT FROM ${excludeWorkflowId ?? -1}
  `
  if (type === "general") {
    if (activeSameType.length > 0) throw new Error("يوجد سير عمل لهذا الفرع مسبقاً")
    return
  }
  if (type === "group") {
    if (activeSameType.some((w: any) => Number(w.group_id) === Number(data.group_id))) {
      throw new Error("يوجد سير عمل لهذه المجموعة على نفس الفرع أو لكل الفروع مسبقاً")
    }
    return
  }
  if (type === "specific") {
    const candidateIds = activeSameType.map((w: any) => w.id)
    if (candidateIds.length === 0) return
    const overlapping = await sql`
      SELECT DISTINCT workflow_id FROM task_workflow_items
      WHERE workflow_id = ANY(${candidateIds}::int[]) AND product_id = ANY(${data.item_ids || []}::int[])
    `
    if (overlapping.length > 0) throw new Error("يوجد سير عمل لأحد هذه الأصناف على نفس الفرع أو لكل الفروع مسبقاً")
  }
}

// itemIds غير فارغة فقط لِـtype='specific' (قد تحمل أكثر من صنف). تُستبدَل بالكامل عند كل حفظ
// (لا تعديل تراكمي) — انظر saveWorkflowSteps التي تستدعيها أيضاً عند إعادة نسخ سير عمل مُستخدَم.
export async function createWorkflow(data: {
  name: string
  description?: string
  type?: string
  item_id?: number | null
  item_type?: string | null
  group_id?: number | null
  item_ids?: number[]
  branch_id?: number | null
}) {
  await ensureTaskOrderTables()
  const type = data.type || "general"
  // خط دفاع ثانٍ خلف تحقق الواجهة (WorkflowsAdmin في task-admin.tsx) — نفس رسالة الواجهة لمجموعة
  // الصنف تحديداً لأن الواجهة تُركِّز حقل البحث عليها.
  if (type === "group" && !data.group_id) throw new Error("يجب تحديد مجموعة الصنف")
  if (type === "specific" && (!data.item_ids || data.item_ids.length === 0)) throw new Error("يجب اختيار صنف واحد على الأقل")
  const branchId = data.branch_id ?? null
  await assertNoDuplicateWorkflow(type, { branch_id: branchId, group_id: data.group_id ?? null, item_ids: data.item_ids })

  const result = await sql`
    INSERT INTO task_workflows (name, description, type, item_id, item_type, group_id, branch_id, version, is_active)
    VALUES (${data.name}, ${data.description || null}, ${type}, ${data.item_id || null}, ${data.item_type || null}, ${data.group_id || null}, ${branchId}, 1, true)
    RETURNING *
  `
  const workflow = result[0]
  const itemIds = Array.isArray(data.item_ids) ? Array.from(new Set(data.item_ids)) : []
  for (const productId of itemIds) {
    await sql`INSERT INTO task_workflow_items (workflow_id, product_id) VALUES (${workflow.id}, ${productId})`
  }
  return { ...workflow, item_ids: itemIds }
}

export async function updateWorkflowMeta(id: number, data: { name?: string; description?: string; is_active?: boolean }) {
  await ensureTaskOrderTables()
  const result = await sql`
    UPDATE task_workflows
    SET name = COALESCE(${data.name}, name), description = COALESCE(${data.description}, description),
        is_active = COALESCE(${data.is_active}, is_active), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return result[0] || null
}

// تعديل تعريف سير عمل بعد حفظه (اسم/نوع/فرع/مجموعة/أصناف) — وليس خطواته (انظر saveWorkflowSteps
// لذلك). نفس فلسفة الإصدار: لو لم يُستخدَم بعد يُعدَّل في مكانه، وإلا يُنسَخ إلى إصدار جديد
// (خطواته/انتقالاته منسوخة كما هي حرفياً من الإصدار الحالي) ويُعطَّل القديم — الأصناف الجارية على
// الإصدار القديم لا تتأثر إطلاقاً.
export async function updateWorkflowDefinition(
  id: number,
  data: {
    name: string
    description?: string
    type?: string
    item_id?: number | null
    group_id?: number | null
    item_ids?: number[]
    branch_id?: number | null
  },
) {
  await ensureTaskOrderTables()
  const current = (await sql`SELECT * FROM task_workflows WHERE id = ${id}`)[0]
  if (!current) throw new Error("سير العمل غير موجود")

  const type = data.type || current.type
  if (type === "group" && !data.group_id) throw new Error("يجب تحديد مجموعة الصنف")
  if (type === "specific" && (!data.item_ids || data.item_ids.length === 0)) throw new Error("يجب اختيار صنف واحد على الأقل")
  const branchId = data.branch_id ?? null
  await assertNoDuplicateWorkflow(type, { branch_id: branchId, group_id: data.group_id ?? null, item_ids: data.item_ids }, id)

  const usage = await sql`SELECT id FROM task_order_items WHERE workflow_id = ${id} LIMIT 1`
  const itemIds = Array.isArray(data.item_ids) ? Array.from(new Set(data.item_ids)) : []

  if (usage.length === 0) {
    const result = await sql`
      UPDATE task_workflows
      SET name = ${data.name}, description = ${data.description || null}, type = ${type},
          item_id = ${data.item_id || null}, group_id = ${data.group_id || null}, branch_id = ${branchId},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `
    await sql`DELETE FROM task_workflow_items WHERE workflow_id = ${id}`
    for (const productId of itemIds) {
      await sql`INSERT INTO task_workflow_items (workflow_id, product_id) VALUES (${id}, ${productId})`
    }
    return { ...result[0], item_ids: itemIds }
  }

  const maxVersion = await sql`SELECT COALESCE(MAX(version), 0) AS v FROM task_workflows WHERE name = ${data.name}`
  const inserted = await sql`
    INSERT INTO task_workflows (name, description, type, item_id, item_type, group_id, branch_id, version, is_active)
    VALUES (${data.name}, ${data.description || null}, ${type}, ${data.item_id || null}, NULL, ${data.group_id || null}, ${branchId}, ${Number(maxVersion[0].v) + 1}, true)
    RETURNING *
  `
  const newWorkflow = inserted[0]
  await sql`UPDATE task_workflows SET is_active = false WHERE id = ${id}`

  for (const productId of itemIds) {
    await sql`INSERT INTO task_workflow_items (workflow_id, product_id) VALUES (${newWorkflow.id}, ${productId})`
  }

  const oldSteps = await sql`SELECT * FROM task_workflow_steps WHERE workflow_id = ${id}`
  const oldTransitions = await sql`SELECT * FROM task_workflow_transitions WHERE workflow_id = ${id}`
  const keyToNewId: Record<string, number> = {}
  for (const step of oldSteps) {
    const insertedStep = await sql`
      INSERT INTO task_workflow_steps (workflow_id, key, label, section_id, assignment_type, assigned_user_id, is_start, is_end, join_type, sla_hours, is_conditional, sla_actions)
      VALUES (
        ${newWorkflow.id}, ${step.key}, ${step.label}, ${step.section_id}, ${step.assignment_type},
        ${step.assigned_user_id}, ${step.is_start}, ${step.is_end}, ${step.join_type}, ${step.sla_hours},
        ${step.is_conditional}, ${step.sla_actions}
      )
      RETURNING id
    `
    keyToNewId[step.key] = insertedStep[0].id
  }
  for (const t of oldTransitions) {
    const fromKey = oldSteps.find((s: any) => s.id === t.from_step_id)?.key
    const toKey = oldSteps.find((s: any) => s.id === t.to_step_id)?.key
    if (!fromKey || !toKey) continue
    await sql`
      INSERT INTO task_workflow_transitions (workflow_id, from_step_id, to_step_id, condition_key, condition_value)
      VALUES (${newWorkflow.id}, ${keyToNewId[fromKey]}, ${keyToNewId[toKey]}, ${t.condition_key}, ${t.condition_value})
    `
  }

  return { ...newWorkflow, item_ids: itemIds }
}

// حذف منطقي (status=2) — يُمنع إن وُجدت مهام مفتوحة (pending/in_progress/paused) على أصناف
// تستخدم هذا السير حالياً، لتفادي "يتم العمل عليها حالياً وتختفي فجأة من كل الشاشات".
export async function deleteWorkflow(id: number, userId: string) {
  await ensureTaskOrderTables()
  await assertAdmin(userId)
  const current = (await sql`SELECT id FROM task_workflows WHERE id = ${id}`)[0]
  if (!current) throw new Error("سير العمل غير موجود")

  const openCount = await sql`
    SELECT COUNT(*) AS c FROM task_step_instances si
    JOIN task_order_items i ON i.id = si.order_item_id
    WHERE i.workflow_id = ${id} AND si.status IN ('pending', 'in_progress', 'paused')
  `
  if (Number(openCount[0].c) > 0) {
    throw new Error("لا يمكن حذف سير العمل لوجود مهام مفتوحة عليه")
  }

  const result = await sql`
    UPDATE task_workflows SET status = 2, is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING id
  `
  return result[0]
}

interface StepInput {
  key: string
  label: string
  section_id: number
  assignment_type?: "all" | "specific"
  assigned_user_id?: string | null
  join_type?: "none" | "and" | "or"
  sla_hours?: number | null
  is_conditional?: boolean
  sla_actions?: string[]
}
interface TransitionInput {
  from_key: string
  to_key: string
  condition_key?: string | null
  condition_value?: string | null
}

// يحفظ خطوات/انتقالات سير عمل بالكامل. إن كان هذا الإصدار غير مستخدَم فعلياً بأي صنف طلبية بعد
// يُعدَّل في مكانه؛ إن كان مستخدَماً بالفعل يُنسَخ إلى صف سير عمل جديد (version+1, is_active=true)
// وتُبنى الخطوات/الانتقالات عليه، ويُعطَّل الإصدار القديم (is_active=false) — الأصناف الجارية تبقى
// مرتبطة بمعرّف الإصدار القديم دون أي تأثير عليها إطلاقاً.
export async function saveWorkflowSteps(workflowId: number, steps: StepInput[], transitions: TransitionInput[]) {
  await ensureTaskOrderTables()
  const keys = new Set(steps.map((s) => s.key))
  if (keys.size !== steps.length) throw new Error("مفاتيح الخطوات يجب أن تكون فريدة")
  for (const t of transitions) {
    if (!keys.has(t.from_key) || !keys.has(t.to_key)) throw new Error("انتقال يشير إلى خطوة غير موجودة")
    if (t.from_key === t.to_key) throw new Error("لا يمكن أن يكون الانتقال من خطوة إلى نفسها")
  }

  // لا مدخل يدوي لـ"بداية"/"نهاية" بعد الآن — تُشتقّان آلياً من شكل شبكة الانتقالات: خطوة بلا أي
  // انتقال وارد إليها = بداية، وخطوة بلا أي انتقال صادر منها = نهاية (خطوة وحيدة بلا انتقالات
  // إطلاقاً تكون الاثنين معاً). محرك التنفيذ (createOrderItem/completeTask) ما زال يحتاج علامة
  // is_start/is_end فعلية على كل خطوة، فتُحسَب هنا بدل الاعتماد على إدخال المستخدم المباشر.
  const incomingKeys = new Set(transitions.map((t) => t.to_key))
  const outgoingKeys = new Set(transitions.map((t) => t.from_key))
  const isStartKey = (key: string) => !incomingKeys.has(key)
  const isEndKey = (key: string) => !outgoingKeys.has(key)

  if (steps.length > 1) {
    // كل خطوة يجب أن تكون ضمن شبكة الانتقالات (لا خطوات معزولة بلا أي ارتباط).
    for (const step of steps) {
      const connected = transitions.some((t) => t.from_key === step.key || t.to_key === step.key)
      if (!connected) throw new Error(`الخطوة "${step.label}" غير مرتبطة بأي انتقال`)
    }
  }

  // خطوة "تحديد ل مستخدم معين" (assignment_type='specific') تستلزم اختيار مستخدم فعلياً، وأن يكون
  // عضواً فعلياً في قسم تلك الخطوة تحديداً.
  for (const step of steps) {
    if (step.assignment_type !== "specific") continue
    if (!step.assigned_user_id) throw new Error(`يجب اختيار المستخدم للخطوة "${step.label}" عند تحديد ل مستخدم معين`)
    const membership = await sql`
      SELECT 1 FROM task_section_users WHERE section_id = ${step.section_id} AND user_id = ${step.assigned_user_id} LIMIT 1
    `
    if (membership.length === 0) throw new Error(`المستخدم المحدد للخطوة "${step.label}" ليس عضواً في القسم المختار`)
  }

  const current = (await sql`SELECT * FROM task_workflows WHERE id = ${workflowId}`)[0]
  if (!current) throw new Error("سير العمل غير موجود")

  const usage = await sql`SELECT id FROM task_order_items WHERE workflow_id = ${workflowId} LIMIT 1`
  let targetWorkflowId = workflowId

  if (usage.length > 0) {
    const maxVersion = await sql`SELECT COALESCE(MAX(version), 0) AS v FROM task_workflows WHERE name = ${current.name}`
    const inserted = await sql`
      INSERT INTO task_workflows (name, description, type, item_id, item_type, group_id, branch_id, version, is_active)
      VALUES (
        ${current.name}, ${current.description}, ${current.type}, ${current.item_id}, ${current.item_type},
        ${current.group_id}, ${current.branch_id}, ${Number(maxVersion[0].v) + 1}, true
      )
      RETURNING *
    `
    targetWorkflowId = inserted[0].id
    await sql`UPDATE task_workflows SET is_active = false WHERE id = ${workflowId}`
    // ربط الأصناف (task_workflow_items) مرتبط بمعرّف الإصدار القديم تحديداً — يُنسَخ صراحة
    // للإصدار الجديد، وإلا فقد سير العمل من النوع 'specific' مطابقته عند إعادة الحل (resolveWorkflow).
    const existingItems = await sql`SELECT product_id FROM task_workflow_items WHERE workflow_id = ${workflowId}`
    for (const row of existingItems) {
      await sql`INSERT INTO task_workflow_items (workflow_id, product_id) VALUES (${targetWorkflowId}, ${row.product_id})`
    }
  } else {
    await sql`DELETE FROM task_workflow_transitions WHERE workflow_id = ${workflowId}`
    await sql`DELETE FROM task_workflow_steps WHERE workflow_id = ${workflowId}`
  }

  const keyToId: Record<string, number> = {}
  for (const step of steps) {
    const inserted = await sql`
      INSERT INTO task_workflow_steps (workflow_id, key, label, section_id, assignment_type, assigned_user_id, is_start, is_end, join_type, sla_hours, is_conditional, sla_actions)
      VALUES (
        ${targetWorkflowId}, ${step.key}, ${step.label}, ${step.section_id}, ${step.assignment_type || "all"},
        ${step.assigned_user_id || null}, ${isStartKey(step.key)}, ${isEndKey(step.key)}, ${step.join_type || "none"}, ${step.sla_hours ?? null},
        ${!!step.is_conditional}, ${step.sla_actions || []}
      )
      RETURNING id
    `
    keyToId[step.key] = inserted[0].id
  }
  for (const t of transitions) {
    await sql`
      INSERT INTO task_workflow_transitions (workflow_id, from_step_id, to_step_id, condition_key, condition_value)
      VALUES (${targetWorkflowId}, ${keyToId[t.from_key]}, ${keyToId[t.to_key]}, ${t.condition_key || null}, ${t.condition_value || null})
    `
  }

  const [workflow] = await sql`SELECT * FROM task_workflows WHERE id = ${targetWorkflowId}`
  const stepRows = await sql`
    SELECT st.*, s.name AS section_name FROM task_workflow_steps st JOIN task_sections s ON s.id = st.section_id
    WHERE st.workflow_id = ${targetWorkflowId}
  `
  const transitionRows = await sql`SELECT * FROM task_workflow_transitions WHERE workflow_id = ${targetWorkflowId}`
  return { ...workflow, steps: stepRows, transitions: transitionRows }
}

// اختيار سير العمل: "خاص بصنف/أصناف محددة" (type='specific' عبر task_workflow_items) يتغلّب على
// "خاص بمجموعة" (type='group' — عبر products.category_id، وهو نفس معرّف item_groups فعلياً كما
// يُظهر عرض item_groups_with_count)، ثم "عام حسب نوع الصنف" (type='general' مرتبط بـitem_type نصي
// حر)، تطابقاً مع القاعدة R9 (الأخص يتغلّب على الأعم).
// حل سير العمل المطابق لصنف طلبية: أولوية صنف محدد ← مجموعة الصنف ← عام حسب نوع الصنف ← عام
// افتراضي. كل مستوى يُقيَّد بالفرع عند تمرير branchId: سير عمل بلا فرع محدَّد (branch_id = NULL،
// أي "الكل") يُطابق أي فرع، تماماً كمنطق التداخل الموسَّع المعتمد بالتحقق من ازدواجية سير العمل عند
// إنشائه (assertNoDuplicateWorkflow) — فلا يتعارضان أبداً على نفس الصنف/المجموعة/النوع لنفس الفرع.
export async function resolveWorkflow(productId: number | null, itemType: string | null, branchId: number | null = null) {
  await ensureTaskOrderTables()
  if (productId) {
    const specific = await sql`
      SELECT w.* FROM task_workflows w
      JOIN task_workflow_items wi ON wi.workflow_id = w.id
      WHERE w.is_active = true AND w.type = 'specific' AND wi.product_id = ${productId}
        AND (w.branch_id IS NULL OR ${branchId}::int IS NULL OR w.branch_id = ${branchId})
      ORDER BY w.version DESC LIMIT 1
    `
    if (specific.length > 0) return specific[0]
    // توافق مع صفوف قديمة أُنشئت قبل دعم تعدد الأصناف (item_id مباشرة على task_workflows بدل
    // الجدول الوسيط task_workflow_items).
    const legacySpecific = await sql`
      SELECT * FROM task_workflows WHERE is_active = true AND type = 'specific' AND item_id = ${productId}
        AND (branch_id IS NULL OR ${branchId}::int IS NULL OR branch_id = ${branchId})
      ORDER BY version DESC LIMIT 1
    `
    if (legacySpecific.length > 0) return legacySpecific[0]

    const productRows = await sql`SELECT category_id FROM products WHERE id = ${productId} LIMIT 1`
    const categoryId = productRows[0]?.category_id ?? null
    if (categoryId) {
      const group = await sql`
        SELECT * FROM task_workflows WHERE is_active = true AND type = 'group' AND group_id = ${categoryId}
          AND (branch_id IS NULL OR ${branchId}::int IS NULL OR branch_id = ${branchId})
        ORDER BY version DESC LIMIT 1
      `
      if (group.length > 0) return group[0]
    }
  }
  if (itemType) {
    const general = await sql`
      SELECT * FROM task_workflows WHERE is_active = true AND type = 'general' AND item_type = ${itemType}
        AND (branch_id IS NULL OR ${branchId}::int IS NULL OR branch_id = ${branchId})
      ORDER BY version DESC LIMIT 1
    `
    if (general.length > 0) return general[0]
  }
  const fallback = await sql`
    SELECT * FROM task_workflows WHERE is_active = true AND type = 'general' AND item_type IS NULL
      AND (branch_id IS NULL OR ${branchId}::int IS NULL OR branch_id = ${branchId})
    ORDER BY version DESC LIMIT 1
  `
  return fallback[0] || null
}

// ------------------------------------------------------------------
// طلبيات العملاء (اختيارية — غلاف تجميعي فوق أصناف الطلبية)
// ------------------------------------------------------------------

export async function listCustomerOrders() {
  await ensureTaskOrderTables()
  const orders = await sql`
    SELECT o.*, c.name AS customer_name,
      (SELECT COUNT(*) FROM task_order_items i WHERE i.customer_order_id = o.id) AS item_count,
      (SELECT COUNT(*) FROM task_order_items i WHERE i.customer_order_id = o.id AND i.status = 'completed') AS completed_item_count
    FROM task_customer_orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC
  `
  return orders
}

export async function createCustomerOrder(data: { customerId?: number | null; priority?: string; createdBy: string }) {
  await ensureTaskOrderTables()
  const inserted = await sql`
    INSERT INTO task_customer_orders (customer_id, priority, created_by, status)
    VALUES (${data.customerId || null}, ${data.priority || "normal"}, ${data.createdBy}, 'in_progress')
    RETURNING *
  `
  const order = inserted[0]
  const orderCode = `ORD-${String(order.id).padStart(6, "0")}`
  await sql`UPDATE task_customer_orders SET order_code = ${orderCode} WHERE id = ${order.id}`
  return { ...order, order_code: orderCode }
}

// ------------------------------------------------------------------
// أصناف الطلبية (البطاقات على مستوى الصنف) وحالتها المجمَّعة
// ------------------------------------------------------------------

function generateItemCode(id: number) {
  return `TSK-${String(id).padStart(6, "0")}`
}

export async function createOrderItem(data: {
  customerOrderId?: number | null
  title: string
  description?: string
  productId?: number | null
  itemType?: string | null
  workflowId?: number | null
  branchId?: number | null
  qty?: number | null
  attributes?: Record<string, string>
  priority?: string
  createdBy: string
}) {
  await ensureTaskOrderTables()
  // اختيار سير العمل مباشرةً (كما تفعله لوحة "صنف جديد" — تعرض كل سير العمل النشِط بالاسم مباشرة،
  // لأن الاعتماد على item_type وحده لا يُميّز بين أكثر من سير عمل عام يتشاركان item_type فارغاً/
  // نفسه) يتغلّب على قاعدة الحل التلقائي عبر product_id/item_type — تبقى تلك القاعدة متاحة لإنشاء
  // آلي مستقبلي (كربط أصناف مباشرة بمنتج فعلي بالنظام) لا يمرّ عبر هذه الشاشة.
  const workflow = data.workflowId
    ? (await sql`SELECT * FROM task_workflows WHERE id = ${data.workflowId} AND is_active = true`)[0]
    : await resolveWorkflow(data.productId ?? null, data.itemType ?? null, data.branchId ?? null)
  if (!workflow) throw new Error("لا يوجد سير عمل مطابق لهذا الصنف — أنشئ سير عمل عام أو خاص أولاً")

  const startStep = (await sql`SELECT * FROM task_workflow_steps WHERE workflow_id = ${workflow.id} AND is_start = true LIMIT 1`)[0]
  if (!startStep) throw new Error("سير العمل لا يحتوي على خطوة بداية")

  const inserted = await sql`
    INSERT INTO task_order_items (customer_order_id, title, description, product_id, item_type, qty, attributes, workflow_id, priority, created_by, status)
    VALUES (
      ${data.customerOrderId || null}, ${data.title}, ${data.description || null}, ${data.productId || null},
      ${data.itemType || null}, ${data.qty ?? null}, ${JSON.stringify(data.attributes || {})}, ${workflow.id},
      ${data.priority || "normal"}, ${data.createdBy}, 'in_workflow'
    )
    RETURNING *
  `
  const item = inserted[0]
  const itemCode = generateItemCode(item.id)
  await sql`UPDATE task_order_items SET item_code = ${itemCode} WHERE id = ${item.id}`

  const instance = (
    await sql`
      INSERT INTO task_step_instances (order_item_id, step_id, status, parent_instance_id)
      VALUES (${item.id}, ${startStep.id}, 'pending', NULL)
      RETURNING *
    `
  )[0]
  await sql`
    INSERT INTO task_execution_logs (step_instance_id, order_item_id, user_id, action, note)
    VALUES (${instance.id}, ${item.id}, ${data.createdBy}, 'create', ${"تم إنشاء الصنف"})
  `

  await notifySectionMembers(startStep.section_id, {
    title: "مهمة جديدة بقسمك",
    message: `${data.title} (${itemCode})`,
    orderItemId: item.id,
    itemCode,
  })

  return { ...item, item_code: itemCode }
}

// تقرير/قائمة كل أصناف الطلبية (وليس فقط المهام المفتوحة كما بلوحة Kanban) — current_steps تُجمِّع
// تسميات كل مراحل التنفيذ المفتوحة حالياً (قد تكون أكثر من واحدة لصنف فيه تفرّع متوازٍ لم يلتقِ
// بعد)، وlast_note/last_note_at آخر ملاحظة فعلية (غير فارغة) سُجِّلت على الصنف أياً كان فعلها
// (بدء/إيقاف/إنهاء/رفض/تحويل) — تكفي هذان العمودان لقراءة سريعة بجدول التقرير قبل فتح التفاصيل.
export async function listOrderItems(filters: { workflowId?: number; status?: string; search?: string }) {
  await ensureTaskOrderTables()
  const rows = await sql`
    SELECT i.*, w.name AS workflow_name, co.order_code AS customer_order_code, c.name AS customer_name,
      creator.full_name AS created_by_name,
      (SELECT COUNT(*) FROM task_step_instances si WHERE si.order_item_id = i.id AND si.status IN ('pending','in_progress','paused')) AS open_task_count,
      (
        SELECT STRING_AGG(DISTINCT st.label, '، ')
        FROM task_step_instances si JOIN task_workflow_steps st ON st.id = si.step_id
        WHERE si.order_item_id = i.id AND si.status IN ('pending', 'in_progress', 'paused')
      ) AS current_steps,
      (
        SELECT l.note FROM task_execution_logs l
        WHERE l.order_item_id = i.id AND l.note IS NOT NULL AND l.note <> ''
        ORDER BY l.at DESC LIMIT 1
      ) AS last_note,
      (
        SELECT l.at FROM task_execution_logs l
        WHERE l.order_item_id = i.id AND l.note IS NOT NULL AND l.note <> ''
        ORDER BY l.at DESC LIMIT 1
      ) AS last_note_at
    FROM task_order_items i
    JOIN task_workflows w ON w.id = i.workflow_id
    LEFT JOIN task_customer_orders co ON co.id = i.customer_order_id
    LEFT JOIN customers c ON c.id = co.customer_id
    LEFT JOIN user_settings creator ON creator.user_id = i.created_by
    WHERE (${filters.workflowId ?? null}::int IS NULL OR i.workflow_id = ${filters.workflowId ?? null})
      AND (${filters.status ?? null}::text IS NULL OR i.status = ${filters.status ?? null})
      AND (${filters.search ?? null}::text IS NULL OR i.title ILIKE ${filters.search ? `%${filters.search}%` : null} OR i.item_code ILIKE ${filters.search ? `%${filters.search}%` : null})
    ORDER BY i.updated_at DESC
  `
  return rows
}

// الوحدة الأساسية للوحة Kanban: كل صف "مهمة" مفتوحة (StepInstance) — وليس صنف الطلبية نفسه، لأن
// التفرّع المتوازي قد يُنتج أكثر من مهمة مفتوحة بأقسام مختلفة لنفس الصنف في آنٍ واحد.
export async function listOpenTasks(filters: { workflowId?: number; sectionId?: number; assigneeId?: string; search?: string }) {
  await ensureTaskOrderTables()
  const rows = await sql`
    SELECT si.*, st.key AS step_key, st.label AS step_label, st.assignment_type, st.sla_hours, st.is_end,
      COALESCE(si.override_section_id, st.section_id) AS effective_section_id,
      sec.name AS section_name,
      i.id AS order_item_id, i.item_code, i.title, i.description, i.priority AS item_priority, i.workflow_id, i.status AS item_status,
      i.created_at AS item_created_at,
      w.name AS workflow_name,
      u.full_name AS claimed_by_name,
      (
        SELECT l.at FROM task_execution_logs l
        WHERE l.step_instance_id = si.id AND l.action = 'start'
        ORDER BY l.at DESC LIMIT 1
      ) AS running_since
    FROM task_step_instances si
    JOIN task_workflow_steps st ON st.id = si.step_id
    JOIN task_sections sec ON sec.id = COALESCE(si.override_section_id, st.section_id)
    JOIN task_order_items i ON i.id = si.order_item_id
    JOIN task_workflows w ON w.id = i.workflow_id
    LEFT JOIN user_settings u ON u.user_id = si.claimed_by_user_id
    WHERE si.status IN ('pending', 'in_progress', 'paused')
      AND (${filters.workflowId ?? null}::int IS NULL OR i.workflow_id = ${filters.workflowId ?? null})
      AND (${filters.sectionId ?? null}::int IS NULL OR COALESCE(si.override_section_id, st.section_id) = ${filters.sectionId ?? null})
      AND (${filters.assigneeId ?? null}::text IS NULL OR si.claimed_by_user_id = ${filters.assigneeId ?? null})
      AND (${filters.search ?? null}::text IS NULL OR i.title ILIKE ${filters.search ? `%${filters.search}%` : null} OR i.item_code ILIKE ${filters.search ? `%${filters.search}%` : null})
    ORDER BY i.priority, si.created_at
  `
  // status='in_progress' لا يعني بالضرورة أن العداد يعمل الآن فعلياً (قد يكون آخر سجل 'stop' وليس
  // 'start') — has_running_timer الحقيقي يُحسَب هنا صراحة بدل الاعتماد على status وحدها.
  return rows.map((r: any) => ({ ...r, has_running_timer: r.status === "in_progress" && !!r.running_since }))
}

export async function getOrderItemDetail(orderItemId: number) {
  await ensureTaskOrderTables()
  const items = await sql`
    SELECT i.*, w.name AS workflow_name, co.order_code AS customer_order_code, c.name AS customer_name,
      creator.full_name AS created_by_name
    FROM task_order_items i
    JOIN task_workflows w ON w.id = i.workflow_id
    LEFT JOIN task_customer_orders co ON co.id = i.customer_order_id
    LEFT JOIN customers c ON c.id = co.customer_id
    LEFT JOIN user_settings creator ON creator.user_id = i.created_by
    WHERE i.id = ${orderItemId}
  `
  if (items.length === 0) return null

  const instances = await sql`
    SELECT si.*, st.key AS step_key, st.label AS step_label, st.assignment_type, st.is_end, st.join_type,
      COALESCE(si.override_section_id, st.section_id) AS effective_section_id,
      sec.name AS section_name, u.full_name AS claimed_by_name
    FROM task_step_instances si
    JOIN task_workflow_steps st ON st.id = si.step_id
    JOIN task_sections sec ON sec.id = COALESCE(si.override_section_id, st.section_id)
    LEFT JOIN user_settings u ON u.user_id = si.claimed_by_user_id
    WHERE si.order_item_id = ${orderItemId}
    ORDER BY si.created_at
  `
  const instanceIds = instances.map((i: any) => i.id)
  const logs =
    instanceIds.length === 0
      ? []
      : await sql`
      SELECT l.*, u.full_name AS user_name
      FROM task_execution_logs l
      LEFT JOIN user_settings u ON u.user_id = l.user_id
      WHERE l.order_item_id = ${orderItemId}
      ORDER BY l.at DESC
    `
  const transfers = await sql`
    SELECT tl.*, fu.full_name AS from_user_name, tu.full_name AS to_user_name, au.full_name AS admin_name,
      fs.name AS from_section_name, ts.name AS to_section_name
    FROM task_transfer_logs tl
    LEFT JOIN user_settings fu ON fu.user_id = tl.from_user_id
    LEFT JOIN user_settings tu ON tu.user_id = tl.to_user_id
    LEFT JOIN user_settings au ON au.user_id = tl.admin_id
    LEFT JOIN task_sections fs ON fs.id = tl.from_section_id
    LEFT JOIN task_sections ts ON ts.id = tl.to_section_id
    WHERE tl.order_item_id = ${orderItemId}
    ORDER BY tl.at DESC
  `

  const workflowSteps = await sql`
    SELECT st.*, s.name AS section_name FROM task_workflow_steps st JOIN task_sections s ON s.id = st.section_id
    WHERE st.workflow_id = ${items[0].workflow_id}
  `
  const workflowTransitions = await sql`SELECT * FROM task_workflow_transitions WHERE workflow_id = ${items[0].workflow_id}`

  return { ...items[0], instances, logs, transfers, workflowSteps, workflowTransitions }
}

// ------------------------------------------------------------------
// محرك تنفيذ المهام (StepInstance): بدء/إيقاف/إنهاء/رفض + تفرّع/التقاء تلقائي
// ------------------------------------------------------------------

async function getInstanceContext(instanceId: number) {
  const rows = await sql`
    SELECT si.*, st.section_id AS step_section_id, st.assignment_type, st.assigned_user_id, st.is_end,
      COALESCE(si.override_section_id, st.section_id) AS effective_section_id,
      i.id AS order_item_id, i.item_code, i.title, i.created_by, i.customer_order_id
    FROM task_step_instances si
    JOIN task_workflow_steps st ON st.id = si.step_id
    JOIN task_order_items i ON i.id = si.order_item_id
    WHERE si.id = ${instanceId}
  `
  return rows[0] || null
}

// يُسجّل فعلاً نهائياً على المهمة (stop/complete/force_complete) بصف واحد بالضبط دائماً — إن كان
// آخر سجل عليها 'start' مفتوحاً يُحسَب مدة تلك الفترة ضمن هذا الصف نفسه (بدل تعديل صف 'start'
// القائم، حفاظاً على كون الجدول إضافة فقط)، وإلا يُسجَّل الفعل بمدة صفرية مع الملاحظة إن وُجدت.
async function logTerminalAction(
  instanceId: number,
  orderItemId: number,
  userId: string,
  action: "stop" | "complete" | "force_complete",
  note?: string,
) {
  const lastLogs = await sql`
    SELECT * FROM task_execution_logs WHERE step_instance_id = ${instanceId} ORDER BY at DESC LIMIT 1
  `
  const last = lastLogs[0]
  const wasRunning = !!last && last.action === "start"
  const durationSeconds = wasRunning ? Math.max(0, Math.floor((Date.now() - new Date(last.at).getTime()) / 1000)) : 0
  await sql`
    INSERT INTO task_execution_logs (step_instance_id, order_item_id, user_id, action, duration_sec, note)
    VALUES (${instanceId}, ${orderItemId}, ${userId}, ${action}, ${durationSeconds}, ${note || null})
  `
  return durationSeconds
}

export async function startTask(instanceId: number, userId: string) {
  await ensureTaskOrderTables()
  const ctx = await getInstanceContext(instanceId)
  if (!ctx) throw new Error("المهمة غير موجودة")
  if (!["pending", "paused"].includes(ctx.status)) throw new Error("لا يمكن بدء هذه المهمة بحالتها الحالية")

  await assertSectionAccess(ctx.effective_section_id, userId)
  if (ctx.assignment_type === "specific" && ctx.assigned_user_id && ctx.assigned_user_id !== userId) {
    throw new Error("هذه المهمة مسندة لمستخدم محدد")
  }
  if (ctx.claimed_by_user_id && ctx.claimed_by_user_id !== userId) {
    throw new Error("تم استلام هذه المهمة من مستخدم آخر")
  }

  // قفل تفاؤلي: شرط WHERE بنفس الحالة/الاستلام المتوقَّعين يمنع سباقاً بين مستخدمين يضغطان Start
  // في اللحظة نفسها على مهمة assignment_type='all' غير مُستلَمة بعد. تُغطّي حالتين معاً بشرط واحد:
  // "pending" غير مُستلَمة (أو مُستلَمة مسبقاً لنفس المستخدم عبر تحويل إداري) ⇐ استلام+بدء، أو
  // "paused" مُستلَمة أصلاً لنفس المستخدم ⇐ استئناف فقط.
  const claimed = await sql`
    UPDATE task_step_instances
    SET status = 'in_progress', claimed_by_user_id = ${userId}, first_started_at = COALESCE(first_started_at, CURRENT_TIMESTAMP)
    WHERE id = ${instanceId}
      AND (
        (status = 'pending' AND (claimed_by_user_id IS NULL OR claimed_by_user_id = ${userId}))
        OR (status = 'paused' AND claimed_by_user_id = ${userId})
      )
    RETURNING *
  `
  if (claimed.length === 0) throw new Error("تم استلام هذه المهمة للتو من مستخدم آخر")

  await sql`
    INSERT INTO task_execution_logs (step_instance_id, order_item_id, user_id, action)
    VALUES (${instanceId}, ${ctx.order_item_id}, ${userId}, 'start')
  `
  await notifySectionManagers(ctx.effective_section_id, {
    title: "بدأ العمل على مهمة",
    message: `${ctx.title} (${ctx.item_code})`,
    orderItemId: ctx.order_item_id,
    itemCode: ctx.item_code,
  })
  return getOrderItemDetail(ctx.order_item_id)
}

export async function stopTask(instanceId: number, userId: string, note?: string) {
  await ensureTaskOrderTables()
  const ctx = await getInstanceContext(instanceId)
  if (!ctx) throw new Error("المهمة غير موجودة")
  if (ctx.status !== "in_progress") throw new Error("لا يوجد عمل جارٍ على هذه المهمة")
  if (ctx.claimed_by_user_id !== userId && !(await isWorkspaceAdmin(userId))) {
    throw new Error("لا تملك صلاحية إيقاف مهمة مستخدم آخر")
  }

  const durationSeconds = await logTerminalAction(instanceId, ctx.order_item_id, userId, "stop", note)
  await sql`
    UPDATE task_step_instances SET status = 'paused', total_duration_seconds = total_duration_seconds + ${durationSeconds}
    WHERE id = ${instanceId}
  `
  return getOrderItemDetail(ctx.order_item_id)
}

export async function rejectTask(instanceId: number, userId: string, reason: string, isForce = false) {
  await ensureTaskOrderTables()
  const ctx = await getInstanceContext(instanceId)
  if (!ctx) throw new Error("المهمة غير موجودة")
  if (!["pending", "paused", "in_progress"].includes(ctx.status)) throw new Error("لا يمكن رفض هذه المهمة بحالتها الحالية")
  if (!isForce && ctx.first_started_at) throw new Error("لا يمكن الرفض بعد بدء العمل على المهمة")
  if (isForce) await assertAdmin(userId)
  else await assertSectionAccess(ctx.effective_section_id, userId)
  if (!ctx.parent_instance_id) throw new Error("هذه أول مرحلة بسير العمل — لا توجد مرحلة سابقة للإعادة إليها")

  const durationSeconds = isForce && ctx.status === "in_progress" ? await logTerminalAction(instanceId, ctx.order_item_id, userId, "stop") : 0

  await sql`
    UPDATE task_step_instances
    SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP, total_duration_seconds = total_duration_seconds + ${durationSeconds}
    WHERE id = ${instanceId}
  `
  await sql`
    UPDATE task_step_instances SET status = 'pending', claimed_by_user_id = NULL, first_started_at = NULL
    WHERE id = ${ctx.parent_instance_id}
  `
  await sql`
    INSERT INTO task_execution_logs (step_instance_id, order_item_id, user_id, action, note)
    VALUES (${instanceId}, ${ctx.order_item_id}, ${userId}, ${isForce ? "force_reject" : "reject"}, ${reason})
  `

  const parentCtx = await getInstanceContext(ctx.parent_instance_id)
  if (parentCtx) {
    await notifySectionMembers(parentCtx.effective_section_id, {
      title: "أُعيدت مهمة لقسمك تحتاج تعديلاً",
      message: `${ctx.title} (${ctx.item_code}): ${reason}`,
      orderItemId: ctx.order_item_id,
      itemCode: ctx.item_code,
    })
  }
  return getOrderItemDetail(ctx.order_item_id)
}

// يُقيّم كل الانتقالات الخارجة من خطوة مكتملة، ويُفرِّع مهمة جديدة لكل خطوة هدف يتحقق شرطها (فراغ
// الشرط = انتقال غير مشروط دائماً يتحقق)، مع احترام join_type لخطوة الهدف: 'and' لا تُفرَّع حتى
// تكتمل كل الخطوات المصدر المؤدية إليها لنفس الصنف؛ 'or'/'none' تُفرَّع فوراً عند أول وصول ولا
// تُكرَّر إن كانت مُفرَّعة أصلاً (فروع or الشقيقة تبقى مفتوحة ولا تُلغى تلقائياً — قرار مقصود: تفادي
// إلغاء عمل بشري جارٍ فعلياً دون تدخّل صريح من مستخدم).
async function advanceFromStep(orderItemId: number, fromStepId: number, itemAttributes: Record<string, any>) {
  const outgoing = await sql`SELECT * FROM task_workflow_transitions WHERE from_step_id = ${fromStepId}`
  for (const transition of outgoing) {
    const conditionMatches = !transition.condition_key || String(itemAttributes?.[transition.condition_key] ?? "") === String(transition.condition_value ?? "")
    if (!conditionMatches) continue

    const existing = await sql`
      SELECT id FROM task_step_instances WHERE order_item_id = ${orderItemId} AND step_id = ${transition.to_step_id} LIMIT 1
    `
    if (existing.length > 0) continue

    const targetStep = (await sql`SELECT * FROM task_workflow_steps WHERE id = ${transition.to_step_id}`)[0]
    if (targetStep.join_type === "and") {
      const counts = await sql`
        SELECT
          (SELECT COUNT(DISTINCT from_step_id) FROM task_workflow_transitions WHERE to_step_id = ${transition.to_step_id}) AS predecessor_count,
          (
            SELECT COUNT(DISTINCT si.step_id) FROM task_step_instances si
            WHERE si.order_item_id = ${orderItemId} AND si.status = 'completed'
              AND si.step_id IN (SELECT from_step_id FROM task_workflow_transitions WHERE to_step_id = ${transition.to_step_id})
          ) AS completed_predecessor_count
      `
      if (Number(counts[0].completed_predecessor_count) < Number(counts[0].predecessor_count)) continue
    }

    await sql`
      INSERT INTO task_step_instances (order_item_id, step_id, status, parent_instance_id)
      VALUES (${orderItemId}, ${transition.to_step_id}, 'pending', (
        SELECT id FROM task_step_instances WHERE order_item_id = ${orderItemId} AND step_id = ${fromStepId} ORDER BY created_at DESC LIMIT 1
      ))
    `

    const item = (await sql`SELECT item_code, title FROM task_order_items WHERE id = ${orderItemId}`)[0]
    await notifySectionMembers(targetStep.section_id, {
      title: "مهمة وصلت إلى قسمك",
      message: `${item.title} (${item.item_code})`,
      orderItemId,
      itemCode: item.item_code,
    })
  }
}

export async function completeTask(instanceId: number, userId: string, note?: string, isForce = false) {
  await ensureTaskOrderTables()
  const ctx = await getInstanceContext(instanceId)
  if (!ctx) throw new Error("المهمة غير موجودة")
  if (isForce) {
    await assertAdmin(userId)
    if (!["pending", "paused", "in_progress"].includes(ctx.status)) throw new Error("لا يمكن إنهاء هذه المهمة بحالتها الحالية")
  } else {
    await assertSectionAccess(ctx.effective_section_id, userId)
    if (ctx.status !== "in_progress") throw new Error("يجب بدء المهمة أولاً قبل إنهائها")
    if (ctx.claimed_by_user_id !== userId) throw new Error("لا تملك صلاحية إنهاء مهمة مستخدم آخر")
  }

  const durationSeconds = await logTerminalAction(instanceId, ctx.order_item_id, userId, isForce ? "force_complete" : "complete", note)
  await sql`
    UPDATE task_step_instances SET status = 'completed', completed_at = CURRENT_TIMESTAMP, total_duration_seconds = total_duration_seconds + ${durationSeconds}
    WHERE id = ${instanceId}
  `

  const item = (await sql`SELECT * FROM task_order_items WHERE id = ${ctx.order_item_id}`)[0]

  if (ctx.is_end) {
    await sql`
      UPDATE task_step_instances SET status = 'cancelled'
      WHERE order_item_id = ${ctx.order_item_id} AND id <> ${instanceId} AND status IN ('pending', 'in_progress', 'paused')
    `
    await sql`UPDATE task_order_items SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${ctx.order_item_id}`
    await notifyUser(item.created_by, {
      title: "اكتمل الصنف",
      message: `${item.title} (${item.item_code})`,
      orderItemId: item.id,
      itemCode: item.item_code,
    })
    if (item.customer_order_id) {
      const siblings = await sql`SELECT status FROM task_order_items WHERE customer_order_id = ${item.customer_order_id}`
      if (siblings.every((s: any) => s.status === "completed")) {
        await sql`UPDATE task_customer_orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ${item.customer_order_id}`
      }
    }
  } else {
    await advanceFromStep(ctx.order_item_id, ctx.step_id, item.attributes || {})
  }

  return getOrderItemDetail(ctx.order_item_id)
}

export async function adminTransferTask(
  instanceId: number,
  adminUserId: string,
  data: { toSectionId?: number | null; toUserId?: string | null; reason: string },
) {
  await ensureTaskOrderTables()
  await assertAdmin(adminUserId)
  const ctx = await getInstanceContext(instanceId)
  if (!ctx) throw new Error("المهمة غير موجودة")
  if (!["pending", "paused", "in_progress"].includes(ctx.status)) throw new Error("لا يمكن تحويل هذه المهمة بحالتها الحالية")
  if (!data.reason?.trim()) throw new Error("سبب التحويل مطلوب")

  const fromSectionId = ctx.effective_section_id
  const fromUserId = ctx.claimed_by_user_id

  if (data.toUserId) {
    const targetSectionId = data.toSectionId || fromSectionId
    const membership = await isSectionMember(targetSectionId, data.toUserId)
    if (!membership.isMember) throw new Error("المستخدم المستهدف ليس عضواً بالقسم المستهدف")
  }

  const durationSeconds = ctx.status === "in_progress" ? await logTerminalAction(instanceId, ctx.order_item_id, adminUserId, "stop") : 0

  await sql`
    UPDATE task_step_instances
    SET override_section_id = COALESCE(${data.toSectionId ?? null}, override_section_id),
        claimed_by_user_id = ${data.toUserId ?? null},
        status = 'pending',
        total_duration_seconds = total_duration_seconds + ${durationSeconds}
    WHERE id = ${instanceId}
  `
  await sql`
    INSERT INTO task_transfer_logs (step_instance_id, order_item_id, from_section_id, to_section_id, from_user_id, to_user_id, admin_id, reason)
    VALUES (${instanceId}, ${ctx.order_item_id}, ${fromSectionId}, ${data.toSectionId || fromSectionId}, ${fromUserId}, ${data.toUserId || null}, ${adminUserId}, ${data.reason})
  `
  await sql`
    INSERT INTO task_execution_logs (step_instance_id, order_item_id, user_id, action, note)
    VALUES (${instanceId}, ${ctx.order_item_id}, ${adminUserId}, 'transfer', ${data.reason})
  `

  const targetSectionId = data.toSectionId || fromSectionId
  if (data.toUserId) {
    await notifyUser(data.toUserId, { title: "تم تحويل مهمة إليك", message: `${ctx.title} (${ctx.item_code})`, orderItemId: ctx.order_item_id, itemCode: ctx.item_code })
  } else {
    await notifySectionMembers(targetSectionId, { title: "تم تحويل مهمة لقسمك", message: `${ctx.title} (${ctx.item_code})`, orderItemId: ctx.order_item_id, itemCode: ctx.item_code })
  }

  return getOrderItemDetail(ctx.order_item_id)
}
