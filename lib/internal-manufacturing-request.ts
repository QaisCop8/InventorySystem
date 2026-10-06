import sql, { getTenantPool, resolveCurrentDbName } from "@/lib/database"
import { ensureTables as ensureReceiptTables } from "@/app/api/receipts/_lib"
import { INTERNAL_DELIVERY_VCH_TYPE, buildVoucherCode, ensureTables as ensureStockTables, getStockVoucherNumberSettings } from "@/app/api/stock-vouchers/_lib"
import { ensurePermissionTables, hasEffectivePermission } from "@/lib/permissions"

export const INTERNAL_MANUFACTURING_VOUCHER_TYPE = 20

export const INTERNAL_MANUFACTURING_STATUS = {
  Created: 1,
  RequestAudit: 2,
  Preparation: 3,
  ReadyAudit: 4,
  Send: 5,
  Receive: 6,
  ReceivedAudit: 7,
  Completed: 8,
} as const

export type InternalManufacturingStatus = (typeof INTERNAL_MANUFACTURING_STATUS)[keyof typeof INTERNAL_MANUFACTURING_STATUS]
export type InternalManufacturingAction = "create" | "requestAudit" | "prepare" | "readyAudit" | "send" | "receive" | "receivedAudit"
// كل صلاحيات الوحدة — مراحل السير أعلاه + عمليات الطلب نفسه والشاشات المساندة. جميعها تُفحص على
// مستوى الفرع (role_branch_permissions / user_branch_permissions عبر hasEffectivePermission).
export type InternalManufacturingPermission = InternalManufacturingAction | "edit" | "delete" | "dashboard" | "archive" | "settings"
export const INTERNAL_MANUFACTURING_PERMISSION_KEYS: InternalManufacturingPermission[] = ["dashboard", "create", "edit", "delete", "requestAudit", "prepare", "readyAudit", "send", "receive", "receivedAudit", "archive", "settings"]

// الفرع الذي يُنفِّذ كل مرحلة: الفرع مقدم الطلب (branch_id) يُنشئ ويدقق طلبه ويستلم البضاعة، والفرع
// المطلوب منه البضاعة (manufacturing_branch_id) يجهزها ويدققها ويرسلها. الصلاحية تُفحص على هذا الفرع.
export function internalManufacturingActingSide(action: InternalManufacturingPermission): "requester" | "supplier" {
  return action === "prepare" || action === "readyAudit" || action === "send" ? "supplier" : "requester"
}
export function internalManufacturingActingBranch(request: { branch_id?: unknown; manufacturing_branch_id?: unknown }, action: InternalManufacturingPermission) {
  return Number(internalManufacturingActingSide(action) === "supplier" ? request.manufacturing_branch_id : request.branch_id) || 0
}

export type InternalManufacturingSettings = {
  requestAudit: boolean
  preparation: boolean
  readyAudit: boolean
  send: boolean
  receive: boolean
  receivedAudit: boolean
}

const DEFAULT_SETTINGS: InternalManufacturingSettings = { requestAudit: true, preparation: true, readyAudit: true, send: true, receive: true, receivedAudit: true }
const ACTION_PERMISSIONS: Record<InternalManufacturingPermission, string> = {
  create: "إنشاء طلب بضاعة داخلي",
  requestAudit: "تدقيق طلب البضاعة",
  prepare: "تجهيز طلبات البضاعة الداخلية",
  readyAudit: "تدقيق الطلبات الجاهزة",
  send: "إرسال طلبات البضاعة",
  receive: "استلام طلبات البضاعة",
  receivedAudit: "تدقيق البضاعة المستلمة",
  edit: "تعديل طلب بضاعة داخلي",
  delete: "حذف طلب بضاعة داخلي",
  dashboard: "لوحة متابعة طلبات البضاعة",
  archive: "تقرير أرشفة الطلبات الداخلية",
  settings: "إعدادات طلب بضاعة داخلي",
}
// صلاحيات أُضيفت لاحقاً: عند إنشائها لأول مرة تُمنح لكل من يملك "إنشاء طلب بضاعة داخلي" (بنفس
// الفروع)، حتى لا يفقد أي مستخدم حالي تعديل/حذف طلباته أو عرض الأرشيف بعد التحديث.
const INHERIT_FROM_CREATE: InternalManufacturingPermission[] = ["edit", "delete", "dashboard", "archive"]

// تُستدعى من كل مسار API — تُنفَّذ مرة واحدة لكل قاعدة بيانات شركة لكل عملية خادم.
const ensuredDatabases = new Map<string, Promise<void>>()
export async function ensureInternalManufacturingTables() {
  const dbName = await resolveCurrentDbName()
  let pending = ensuredDatabases.get(dbName)
  if (!pending) {
    pending = createInternalManufacturingTables().catch((error) => { ensuredDatabases.delete(dbName); throw error })
    ensuredDatabases.set(dbName, pending)
  }
  return pending
}

async function createInternalManufacturingTables() {
  await ensureReceiptTables()
  await ensureStockTables()
  const conflict = await sql`SELECT name FROM voucher_types_tbl WHERE id = ${INTERNAL_MANUFACTURING_VOUCHER_TYPE} AND name <> 'طلب صناعة داخلي'`
  if (conflict.length) throw new Error("رقم نوع السند 20 مستخدم لنوع مختلف")
  await sql`INSERT INTO voucher_types_tbl (id, name, status) VALUES (20, 'طلب صناعة داخلي', 1) ON CONFLICT (id) DO NOTHING`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS internal_status INTEGER DEFAULT 1`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS manufacturing_branch_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS destination_warehouse_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS to_branch_id INTEGER`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS free_quantity DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS received_quantity DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS prepared_quantity DOUBLE PRECISION DEFAULT 0`
  await sql`ALTER TABLE voucher_items_tbl ADD COLUMN IF NOT EXISTS item_properties JSONB`
  await sql`CREATE TABLE IF NOT EXISTS internal_manufacturing_events (id SERIAL PRIMARY KEY, voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE, action VARCHAR(40) NOT NULL, from_status INTEGER, to_status INTEGER, user_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`ALTER TABLE internal_manufacturing_events ADD COLUMN IF NOT EXISTS before_snapshot JSONB`
  await sql`ALTER TABLE internal_manufacturing_events ADD COLUMN IF NOT EXISTS after_snapshot JSONB`
  await sql`ALTER TABLE internal_manufacturing_events ADD COLUMN IF NOT EXISTS request_snapshot JSONB`
  await sql`CREATE INDEX IF NOT EXISTS idx_internal_manufacturing_events_voucher ON internal_manufacturing_events(voucher_id, created_at)`
  await ensureInternalManufacturingPermissions()
}

async function ensureInternalManufacturingPermissions() {
  await ensurePermissionTables(await resolveCurrentDbName())
  const categoryRows = await sql`INSERT INTO access_category (name) SELECT 'صلاحيات طلب البضاعة' WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = 'صلاحيات طلب البضاعة') RETURNING id`
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name = 'صلاحيات طلب البضاعة' LIMIT 1`)[0]
  const legacyCategory = (await sql`SELECT id FROM access_category WHERE name = 'صلاحيات طلب الصناعة' LIMIT 1`)[0]
  if (legacyCategory && Number(legacyCategory.id) !== Number(category.id)) {
    await sql`UPDATE access_list SET category_id = ${category.id} WHERE category_id = ${legacyCategory.id}`
    await sql`DELETE FROM access_category WHERE id = ${legacyCategory.id}`
  }
  const createdKeys: InternalManufacturingPermission[] = []
  for (const key of INTERNAL_MANUFACTURING_PERMISSION_KEYS) {
    const name = ACTION_PERMISSIONS[key]
    const rows = await sql`INSERT INTO access_list (name, category_id) SELECT ${name}, ${category.id} WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${name}) RETURNING id`
    if (rows[0]?.id) createdKeys.push(key)
    const accessId = rows[0]?.id || (await sql`SELECT id FROM access_list WHERE name = ${name} LIMIT 1`)[0]?.id
    if (accessId) await sql`INSERT INTO role_permissions (role_id, access_id, is_granted) SELECT id, ${accessId}, TRUE FROM job_roles WHERE LOWER(name) = LOWER('مدير') ON CONFLICT (role_id, access_id) DO NOTHING`
  }
  for (const key of createdKeys.filter((candidate) => INHERIT_FROM_CREATE.includes(candidate))) {
    await copyPermissionGrants(ACTION_PERMISSIONS.create, ACTION_PERMISSIONS[key])
  }
  await migrateLegacyPermission("استلام طلب الصناعة", ACTION_PERMISSIONS.receive)
  await migrateLegacyPermission("تدقيق الصناعة", ACTION_PERMISSIONS.requestAudit)
  await migrateLegacyPermission("استلام الصناعة من الفرع", ACTION_PERMISSIONS.receive)
  await migrateLegacyPermission("إنشاء طلب صناعة داخلي", ACTION_PERMISSIONS.create)
  await migrateLegacyPermission("تدقيق طلب الصناعة", ACTION_PERMISSIONS.requestAudit)
  await migrateLegacyPermission("تجهيز طلبات البضاعة", ACTION_PERMISSIONS.prepare)
  await migrateLegacyPermission("إرسال طلب الصناعة", ACTION_PERMISSIONS.send)
  await sql`ALTER TABLE access_list ADD COLUMN IF NOT EXISTS sort_order INTEGER`
  for (const [sortOrder, key] of INTERNAL_MANUFACTURING_PERMISSION_KEYS.entries()) {
    await sql`UPDATE access_list SET sort_order = ${sortOrder + 1}, category_id = ${category.id}, updated_at = CURRENT_TIMESTAMP WHERE name = ${ACTION_PERMISSIONS[key]}`
  }
}

async function copyPermissionGrants(sourceName: string, targetName: string) {
  const source = (await sql`SELECT id FROM access_list WHERE name = ${sourceName} LIMIT 1`)[0]
  const target = (await sql`SELECT id FROM access_list WHERE name = ${targetName} LIMIT 1`)[0]
  if (!source || !target || Number(source.id) === Number(target.id)) return
  await sql`INSERT INTO role_permissions (role_id, access_id, is_granted) SELECT role_id, ${target.id}, is_granted FROM role_permissions WHERE access_id = ${source.id} ON CONFLICT (role_id, access_id) DO NOTHING`
  await sql`INSERT INTO role_branch_permissions (role_id, branch_id, access_id, is_granted) SELECT role_id, branch_id, ${target.id}, is_granted FROM role_branch_permissions WHERE access_id = ${source.id} ON CONFLICT (role_id, branch_id, access_id) DO NOTHING`
  await sql`INSERT INTO user_branch_permissions (user_id, branch_id, access_id, is_granted) SELECT user_id, branch_id, ${target.id}, is_granted FROM user_branch_permissions WHERE access_id = ${source.id} ON CONFLICT (user_id, branch_id, access_id) DO NOTHING`
  await sql`INSERT INTO user_access (user_id, access_id, is_granted) SELECT user_id, ${target.id}, is_granted FROM user_access WHERE access_id = ${source.id} ON CONFLICT (user_id, access_id) DO NOTHING`
}

async function migrateLegacyPermission(legacyName: string, currentName: string) {
  const legacy = (await sql`SELECT id FROM access_list WHERE name = ${legacyName} LIMIT 1`)[0]
  const current = (await sql`SELECT id FROM access_list WHERE name = ${currentName} LIMIT 1`)[0]
  if (!legacy || !current || Number(legacy.id) === Number(current.id)) return
  await sql`INSERT INTO role_permissions (role_id, access_id, is_granted) SELECT role_id, ${current.id}, is_granted FROM role_permissions WHERE access_id = ${legacy.id} ON CONFLICT (role_id, access_id) DO UPDATE SET is_granted = role_permissions.is_granted OR EXCLUDED.is_granted`
  await sql`INSERT INTO role_branch_permissions (role_id, branch_id, access_id, is_granted) SELECT role_id, branch_id, ${current.id}, is_granted FROM role_branch_permissions WHERE access_id = ${legacy.id} ON CONFLICT (role_id, branch_id, access_id) DO UPDATE SET is_granted = role_branch_permissions.is_granted OR EXCLUDED.is_granted`
  await sql`INSERT INTO user_branch_permissions (user_id, branch_id, access_id, is_granted) SELECT user_id, branch_id, ${current.id}, is_granted FROM user_branch_permissions WHERE access_id = ${legacy.id} ON CONFLICT (user_id, branch_id, access_id) DO UPDATE SET is_granted = user_branch_permissions.is_granted OR EXCLUDED.is_granted`
  await sql`INSERT INTO user_access (user_id, access_id, is_granted) SELECT user_id, ${current.id}, is_granted FROM user_access WHERE access_id = ${legacy.id} ON CONFLICT (user_id, access_id) DO UPDATE SET is_granted = user_access.is_granted OR EXCLUDED.is_granted`
  await sql`DELETE FROM access_list WHERE id = ${legacy.id}`
}

const LEGACY_PERMISSION_NAMES: Partial<Record<InternalManufacturingPermission, string>> = {
  requestAudit: "تدقيق طلب الصناعة",
  create: "إنشاء طلب صناعة داخلي",
  prepare: "تجهيز طلبات البضاعة",
  send: "إرسال طلب الصناعة",
}

export async function hasInternalManufacturingPermission(userId: string, branchId: number, permission: InternalManufacturingPermission) {
  if (!Number(branchId)) return false
  const names = [ACTION_PERMISSIONS[permission], LEGACY_PERMISSION_NAMES[permission]].filter(Boolean) as string[]
  const accessRows = (await Promise.all(names.map((name) => sql`SELECT id FROM access_list WHERE name = ${name} LIMIT 1`))).flat()
  const granted = await Promise.all(accessRows.map((access) => hasEffectivePermission(userId, Number(access.id), branchId)))
  return granted.some(Boolean)
}

export async function authorizeInternalManufacturing(userId: string, branchId: number, permission: InternalManufacturingPermission) {
  if (!Number(branchId)) throw new Error("يجب تحديد الفرع")
  if (!(await hasInternalManufacturingPermission(userId, branchId, permission))) {
    throw new Error(`لا يوجد لديك صلاحية "${ACTION_PERMISSIONS[permission]}" في هذا الفرع`)
  }
}

export async function getInternalManufacturingPermissions(userId: string, branchId: number) {
  const entries = await Promise.all(INTERNAL_MANUFACTURING_PERMISSION_KEYS.map(async (key) => [key, await hasInternalManufacturingPermission(userId, branchId, key)] as const))
  return Object.fromEntries(entries) as Record<InternalManufacturingPermission, boolean>
}

// عدد الطلبات المنتظرة في كل مرحلة للفرع النشط — كل مرحلة تُعدّ من جهة الفرع المنفِّذ لها فقط.
export async function countInternalManufacturingStages(branchId: number) {
  const result = await (await getTenantPool()).query(
    `SELECT internal_status,
       COUNT(*) FILTER (WHERE branch_id = $1)::int AS requester_count,
       COUNT(*) FILTER (WHERE manufacturing_branch_id = $1)::int AS supplier_count
     FROM voucher_header_tbl
     WHERE vch_type = 20 AND status <> 3 AND (branch_id = $1 OR manufacturing_branch_id = $1)
     GROUP BY internal_status`,
    [branchId],
  )
  const counts: Record<number, number> = {}
  for (const row of result.rows) {
    const status = Number(row.internal_status)
    const action = STATUS_ACTIONS[status]
    counts[status] = action && internalManufacturingActingSide(action) === "supplier" ? Number(row.supplier_count) : Number(row.requester_count)
  }
  return counts
}

export const STATUS_ACTIONS: Record<number, Exclude<InternalManufacturingAction, "create">> = { 2: "requestAudit", 3: "prepare", 4: "readyAudit", 5: "send", 6: "receive", 7: "receivedAudit" }

export async function getInternalManufacturingSettings() {
  const rows = await sql`SELECT value FROM system_settings WHERE id = 'internal_manufacturing_settings' LIMIT 1`
  if (!rows.length) return DEFAULT_SETTINGS
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(String(rows[0].value || "{}")) } as InternalManufacturingSettings } catch { return DEFAULT_SETTINGS }
}

export async function saveInternalManufacturingSettings(value: Partial<InternalManufacturingSettings>) {
  const settings = { ...DEFAULT_SETTINGS, ...value }
  await sql`INSERT INTO system_settings (id, description, value) VALUES ('internal_manufacturing_settings', 'إعدادات طلب الصناعة', ${JSON.stringify(settings)}) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value`
  return settings
}

export function nextInternalManufacturingStatus(current: InternalManufacturingStatus, settings: InternalManufacturingSettings, action: InternalManufacturingAction): InternalManufacturingStatus {
  if (action === "create") return settings.requestAudit ? INTERNAL_MANUFACTURING_STATUS.RequestAudit : INTERNAL_MANUFACTURING_STATUS.Preparation
  if (action === "requestAudit") return INTERNAL_MANUFACTURING_STATUS.Preparation
  if (action === "prepare") return settings.readyAudit ? INTERNAL_MANUFACTURING_STATUS.ReadyAudit : settings.send ? INTERNAL_MANUFACTURING_STATUS.Send : INTERNAL_MANUFACTURING_STATUS.Receive
  if (action === "readyAudit") return settings.send ? INTERNAL_MANUFACTURING_STATUS.Send : INTERNAL_MANUFACTURING_STATUS.Receive
  if (action === "send") return INTERNAL_MANUFACTURING_STATUS.Receive
  if (action === "receive") return settings.receivedAudit ? INTERNAL_MANUFACTURING_STATUS.ReceivedAudit : INTERNAL_MANUFACTURING_STATUS.Completed
  if (action === "receivedAudit") return INTERNAL_MANUFACTURING_STATUS.Completed
  return current
}

// side: "requester" = طلبات الفرع نفسه، "supplier" = الطلبات الواردة إليه من فروع أخرى.
export async function listInternalManufacturingRequests(options: { status?: number; branchId: number; side: "requester" | "supplier" }) {
  const pool = await getTenantPool()
  const values: unknown[] = [options.branchId]
  const conditions = ["vh.vch_type = 20", "vh.status <> 3", options.side === "supplier" ? "vh.manufacturing_branch_id = $1" : "vh.branch_id = $1"]
  if (options.status) { values.push(options.status); conditions.push(`vh.internal_status = $${values.length}`) }
  const rows = (await pool.query(
    `SELECT vh.*, requester.full_name AS requester_name,
       (SELECT MAX(e.created_at) FROM internal_manufacturing_events e WHERE e.voucher_id = vh.id) AS stage_since
     FROM voucher_header_tbl vh
     LEFT JOIN user_settings requester ON requester.user_id = vh.insert_user
     WHERE ${conditions.join(" AND ")}
     ORDER BY vh.id DESC`,
    values,
  )).rows
  if (!rows.length) return rows
  const items = (await pool.query(
    `SELECT vi.*, COALESCE(vi.item_name, p.product_name, '') AS item_name, u.unit_name, p.product_image AS product_image
     FROM voucher_items_tbl vi LEFT JOIN units u ON u.id = vi.unit_id LEFT JOIN products p ON p.id = vi.item_id
     WHERE vi.voucher_id = ANY($1::int[]) ORDER BY vi.id`,
    [rows.map((row: any) => Number(row.id))],
  )).rows
  const byVoucher = new Map<number, any[]>()
  for (const item of items) {
    const list = byVoucher.get(Number(item.voucher_id)) || []
    list.push(item)
    byVoucher.set(Number(item.voucher_id), list)
  }
  for (const row of rows) row.items = byVoucher.get(Number(row.id)) || []
  return rows
}

export async function getInternalManufacturingDashboard(branchId: number, overdueDays = 2) {
  const pool = await getTenantPool()
  const query = async (text: string, values: unknown[] = []) => (await pool.query(text, [branchId, ...values])).rows
  const scope = "vh.vch_type = 20 AND vh.status <> 3 AND (vh.branch_id = $1 OR vh.manufacturing_branch_id = $1)"
  const [stageRows, kpiRows, overdue, trend, topItems, recent, partners] = await Promise.all([
    query(`SELECT vh.internal_status AS status,
        COUNT(*) FILTER (WHERE vh.branch_id = $1)::int AS outgoing,
        COUNT(*) FILTER (WHERE vh.manufacturing_branch_id = $1)::int AS incoming
      FROM voucher_header_tbl vh WHERE ${scope} GROUP BY vh.internal_status`),
    query(`WITH done AS (
        SELECT vh.id, vh.branch_id, vh.manufacturing_branch_id,
          (SELECT MIN(e.created_at) FROM internal_manufacturing_events e WHERE e.voucher_id = vh.id AND e.action = 'create') AS created_at,
          (SELECT MAX(e.created_at) FROM internal_manufacturing_events e WHERE e.voucher_id = vh.id AND e.to_status = 8) AS completed_at
        FROM voucher_header_tbl vh WHERE ${scope} AND vh.internal_status = 8)
      SELECT
        COUNT(*) FILTER (WHERE completed_at >= date_trunc('month', CURRENT_DATE))::int AS completed_month,
        COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE completed_at >= CURRENT_DATE - 30)::numeric, 1), 0) AS avg_hours,
        (SELECT COALESCE(ROUND(100 * SUM(vi.received_quantity)::numeric / NULLIF(SUM(vi.qnty), 0)::numeric, 1), 0)
           FROM voucher_items_tbl vi JOIN done d ON d.id = vi.voucher_id WHERE d.completed_at >= CURRENT_DATE - 30) AS fill_rate
      FROM done`),
    query(`SELECT vh.id, vh.vch_code, vh.vch_date, vh.internal_status, vh.branch_id, vh.manufacturing_branch_id,
        CASE WHEN vh.branch_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
        COALESCE((SELECT MAX(e.created_at) FROM internal_manufacturing_events e WHERE e.voucher_id = vh.id), vh.vch_date) AS stage_since
      FROM voucher_header_tbl vh
      WHERE ${scope} AND vh.internal_status BETWEEN 2 AND 7
        AND COALESCE((SELECT MAX(e.created_at) FROM internal_manufacturing_events e WHERE e.voucher_id = vh.id), vh.vch_date) < NOW() - make_interval(days => $2::int)
      ORDER BY stage_since ASC LIMIT 12`, [overdueDays]),
    query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
        (SELECT COUNT(*) FROM internal_manufacturing_events e JOIN voucher_header_tbl vh ON vh.id = e.voucher_id
          WHERE ${scope} AND e.action = 'create' AND e.created_at::date = d::date)::int AS created,
        (SELECT COUNT(*) FROM internal_manufacturing_events e JOIN voucher_header_tbl vh ON vh.id = e.voucher_id
          WHERE ${scope} AND e.to_status = 8 AND e.from_status <> 8 AND e.created_at::date = d::date)::int AS completed
      FROM generate_series((CURRENT_DATE - 13)::timestamp, CURRENT_DATE::timestamp, INTERVAL '1 day') d ORDER BY d`),
    query(`SELECT vi.item_id, MAX(COALESCE(vi.item_name, p.product_name, '')) AS item_name, MAX(u.unit_name) AS unit_name,
        MAX(p.product_image) AS product_image, SUM(vi.qnty)::float AS quantity, COUNT(DISTINCT vh.id)::int AS requests
      FROM voucher_items_tbl vi JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
      LEFT JOIN products p ON p.id = vi.item_id LEFT JOIN units u ON u.id = vi.unit_id
      WHERE ${scope} AND vh.vch_date >= CURRENT_DATE - 30
      GROUP BY vi.item_id ORDER BY quantity DESC LIMIT 8`),
    query(`SELECT e.id, e.action, e.to_status, e.created_at, vh.vch_code, vh.id AS voucher_id,
        COALESCE(actor.full_name, actor.username, CAST(e.user_id AS TEXT)) AS user_name
      FROM internal_manufacturing_events e JOIN voucher_header_tbl vh ON vh.id = e.voucher_id
      LEFT JOIN user_settings actor ON actor.user_id = e.user_id
      WHERE ${scope} ORDER BY e.created_at DESC, e.id DESC LIMIT 10`),
    query(`SELECT CASE WHEN vh.branch_id = $1 THEN vh.manufacturing_branch_id ELSE vh.branch_id END AS branch_id,
        COUNT(*) FILTER (WHERE vh.branch_id = $1)::int AS outgoing,
        COUNT(*) FILTER (WHERE vh.manufacturing_branch_id = $1)::int AS incoming
      FROM voucher_header_tbl vh WHERE ${scope} AND vh.vch_date >= CURRENT_DATE - 90
      GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 6`),
  ])
  const stages: Record<number, { outgoing: number; incoming: number }> = {}
  for (const row of stageRows) stages[Number(row.status)] = { outgoing: Number(row.outgoing), incoming: Number(row.incoming) }
  const kpi = kpiRows[0] || {}
  return {
    stages,
    completedThisMonth: Number(kpi.completed_month || 0),
    averageHours: Number(kpi.avg_hours || 0),
    fillRate: Number(kpi.fill_rate || 0),
    overdueDays,
    overdue,
    trend,
    topItems,
    recent,
    partners,
  }
}

function itemSnapshot(items: any[]) {
  return items.map((item) => ({
    id: Number(item.id || 0),
    item_id: Number(item.item_id || item.product_id || 0),
    item_name: item.item_name || item.product_name || "",
    unit_id: Number(item.unit_id || 0) || null,
    unit_name: item.unit_name || null,
    requested_quantity: Number(item.qnty ?? item.quantity ?? 0),
    prepared_quantity: Number(item.prepared_quantity || 0),
    received_quantity: Number(item.received_quantity || 0),
  }))
}

function requestSnapshot(request: any) {
  return {
    vch_code: request.vch_code,
    vch_date: request.vch_date,
    branch_id: Number(request.branch_id || 0),
    manufacturing_branch_id: Number(request.manufacturing_branch_id || 0),
    source_warehouse_id: Number(request.to_store_id || 0) || null,
    destination_warehouse_id: Number(request.destination_warehouse_id || 0) || null,
  }
}

export async function listInternalManufacturingArchive(filters: { from?: string; to?: string; search?: string; branchId?: number } = {}) {
  const search = String(filters.search || "").trim()
  const values: unknown[] = []
  const conditions = ["vh.vch_type = 20"]
  if (filters.from) { values.push(filters.from); conditions.push(`vh.vch_date >= $${values.length}::date`) }
  if (filters.to) { values.push(filters.to); conditions.push(`vh.vch_date < ($${values.length}::date + INTERVAL '1 day')`) }
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`(vh.branch_id = $${values.length} OR vh.manufacturing_branch_id = $${values.length})`) }
  if (search) { values.push(`%${search}%`); conditions.push(`(vh.vch_code ILIKE $${values.length} OR COALESCE(requester.full_name, '') ILIKE $${values.length})`) }
  const result = await (await getTenantPool()).query(`
    SELECT vh.id, vh.vch_code, vh.vch_date, vh.internal_status, vh.status, vh.branch_id,
      vh.manufacturing_branch_id, vh.to_store_id, vh.destination_warehouse_id,
      requester.full_name AS requester_name,
      COALESCE(json_agg(json_build_object(
        'id', e.id, 'action', e.action, 'from_status', e.from_status, 'to_status', e.to_status,
        'created_at', e.created_at, 'user_id', e.user_id,
        'user_name', COALESCE(actor.full_name, actor.username, CAST(e.user_id AS TEXT)),
        'before_snapshot', e.before_snapshot, 'after_snapshot', e.after_snapshot,
        'request_snapshot', e.request_snapshot
      ) ORDER BY e.created_at, e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::json) AS events
    FROM voucher_header_tbl vh
    LEFT JOIN user_settings requester ON requester.user_id = vh.insert_user
    LEFT JOIN internal_manufacturing_events e ON e.voucher_id = vh.id
    LEFT JOIN user_settings actor ON actor.user_id = e.user_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY vh.id, requester.full_name
    ORDER BY vh.vch_date DESC, vh.id DESC`, values)
  const rows = result.rows
  for (const row of rows) {
    row.items = await sql`SELECT vi.id, vi.item_id, vi.item_name, vi.qnty AS requested_quantity, vi.prepared_quantity, vi.received_quantity, u.unit_name, p.product_image AS product_image FROM voucher_items_tbl vi LEFT JOIN units u ON u.id=vi.unit_id LEFT JOIN products p ON p.id=vi.item_id WHERE vi.voucher_id=${row.id} ORDER BY vi.id`
  }
  return rows
}

export async function createInternalManufacturingRequest(input: any, userId: number) {
  const items = Array.isArray(input.items) ? input.items.filter((item: any) => Number(item.product_id) > 0 && Number(item.quantity) > 0) : []
  if (!Number(input.branch_id)) throw new Error("يجب تحديد فرع مقدم الطلب")
  if (!Number(input.manufacturing_branch_id)) throw new Error("يجب اختيار الفرع المطلوب منه البضاعة")
  if (!items.length) throw new Error("يجب اضافة صنف واحد على الأقل")
  if (!Number(input.source_warehouse_id) || !Number(input.destination_warehouse_id)) throw new Error("يجب اختيار مستودع مقدم الطلب والمستودع المطلوب منه البضاعة")
  if (Number(input.source_warehouse_id) === Number(input.destination_warehouse_id)) throw new Error("لا يمكن أن يكون نفس المستودع")
  const settings = await getInternalManufacturingSettings()
  const status = settings.requestAudit
    ? INTERNAL_MANUFACTURING_STATUS.RequestAudit
    : INTERNAL_MANUFACTURING_STATUS.Preparation
  const client = await (await getTenantPool()).connect()
  try {
    await client.query("BEGIN")
    const currencyResult = await client.query("SELECT id FROM currency ORDER BY id ASC LIMIT 1")
    if (!currencyResult.rowCount) throw new Error("يجب تعريف عملة أساسية قبل حفظ طلب البضاعة")
    const currencyId = Number(currencyResult.rows[0].id)
    const yearCode = String(new Date().getFullYear()).slice(-2)
    const codePrefix = `IM${yearCode}`
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [codePrefix])
    const codeResult = await client.query("SELECT vch_code FROM voucher_header_tbl WHERE vch_type = 20 AND vch_code LIKE $1", [`${codePrefix}%`])
    const lastSerial = codeResult.rows.reduce((highest: number, row: any) => {
      const match = String(row.vch_code).match(new RegExp(`^${codePrefix}(\\d{6})$`))
      return match ? Math.max(highest, Number(match[1])) : highest
    }, 0)
    const nextSerial = lastSerial + 1
    if (nextSerial > 999999) throw new Error(`تم تجاوز الحد الأقصى لأرقام طلبات البضاعة لسنة ${yearCode}`)
    const vchCode = `${codePrefix}${String(nextSerial).padStart(6, "0")}`
    const header = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,currency_id,rate,branch_id,to_branch_id,to_store_id,manufacturing_branch_id,destination_warehouse_id,note,status,vch_status,insert_user,internal_status) VALUES (20,$1,$2::date + LOCALTIME,$3,$4,$5,$6,$7,$8,$9,$10,1,1,$11,$12) RETURNING *`, [vchCode, input.vch_date || new Date().toISOString().slice(0, 10), currencyId, 1, input.branch_id, input.manufacturing_branch_id, input.source_warehouse_id || null, input.manufacturing_branch_id, input.destination_warehouse_id || null, input.note || null, userId, status])
    for (const item of items) await client.query(`INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,barcode,item_properties,free_quantity,received_quantity,prepared_quantity) VALUES ($1,$2,$3,COALESCE($4,(SELECT unit_id FROM product_units WHERE product_id=$2 ORDER BY id LIMIT 1)),$5,$6,$7,$8,COALESCE((SELECT available_stock FROM product_stock WHERE product_id=$2),0),0,0)`, [header.rows[0].id, item.product_id, item.product_name || null, Number(item.unit_id ?? item.unitId ?? 0) || null, input.destination_warehouse_id || null, Number(item.quantity), item.barcode || null, item.properties || item.features || item.attributes ? JSON.stringify(item.properties || item.features || item.attributes) : null])
    const createdItems = (await client.query(`SELECT * FROM voucher_items_tbl WHERE voucher_id=$1 ORDER BY id`, [header.rows[0].id])).rows
    await client.query(`INSERT INTO internal_manufacturing_events (voucher_id,action,to_status,user_id,after_snapshot,request_snapshot) VALUES ($1,'create',$2,$3,$4,$5)`, [header.rows[0].id, status, userId, JSON.stringify(itemSnapshot(createdItems)), JSON.stringify(requestSnapshot(header.rows[0]))])
    await client.query("COMMIT")
    return header.rows[0]
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}

export async function processInternalManufacturingAction(id: number, action: Exclude<InternalManufacturingAction, "create">, userId: number, input: any = {}) {
  const settings = await getInternalManufacturingSettings()
  const expected: Record<Exclude<InternalManufacturingAction, "create">, number> = { requestAudit: 2, prepare: 3, readyAudit: 4, send: 5, receive: 6, receivedAudit: 7 }
  const client = await (await getTenantPool()).connect()
  try {
    await client.query("BEGIN")
    const result = await client.query(`SELECT * FROM voucher_header_tbl WHERE id=$1 AND vch_type=20 FOR UPDATE`, [id])
    if (!result.rowCount || Number(result.rows[0].internal_status) !== expected[action]) throw new Error("الطلب غير موجود أو ليس في المرحلة المطلوبة")
    const request = result.rows[0]
    const items = (await client.query(`SELECT * FROM voucher_items_tbl WHERE voucher_id=$1 FOR UPDATE`, [id])).rows
    const beforeSnapshot = itemSnapshot(items)
    if (action === "prepare" || action === "readyAudit") {
      const preparedItems = Array.isArray(input.prepared_items) ? input.prepared_items : []
      for (const item of items) {
        const value = Number(preparedItems.find((candidate: any) => Number(candidate.id) === Number(item.id))?.prepared_quantity)
        if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error("الكمية المجهزة يجب أن تكون بين 0 و100000")
        await client.query(`UPDATE voucher_items_tbl SET prepared_quantity=$1 WHERE id=$2`, [value, item.id])
      }
    }
    if (action === "receive") {
      const receivedItems = Array.isArray(input.received_items) ? input.received_items : []
      for (const item of items) {
        const value = Number(receivedItems.find((candidate: any) => Number(candidate.id) === Number(item.id))?.received_quantity)
        if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error("الكمية المستلمة غير صالحة")
        await client.query(`UPDATE voucher_items_tbl SET received_quantity=$1 WHERE id=$2`, [value, item.id])
        item.received_quantity = value
      }
    }
    const next = nextInternalManufacturingStatus(Number(request.internal_status) as InternalManufacturingStatus, settings, action)
    const updated = await client.query(`UPDATE voucher_header_tbl SET internal_status=$1,update_user=$2,last_update_date=CURRENT_TIMESTAMP WHERE id=$3 AND internal_status=$4 RETURNING id`, [next, userId, id, request.internal_status])
    if (!updated.rowCount) throw new Error("تمت معالجة الطلب من مستخدم آخر")
    const afterItems = (await client.query(`SELECT * FROM voucher_items_tbl WHERE voucher_id=$1 ORDER BY id`, [id])).rows
    await client.query(`INSERT INTO internal_manufacturing_events (voucher_id,action,from_status,to_status,user_id,before_snapshot,after_snapshot,request_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, action, request.internal_status, next, userId, JSON.stringify(beforeSnapshot), JSON.stringify(itemSnapshot(afterItems)), JSON.stringify(requestSnapshot(request))])
    if (action === "receive") {
      const currencyResult = await client.query("SELECT id FROM currency ORDER BY id ASC LIMIT 1")
      if (!currencyResult.rowCount) throw new Error("يجب تعريف عملة قبل اعتماد الارسالية الداخلية")
      const priceCategoryResult = await client.query("SELECT id FROM pricecategory ORDER BY CASE WHEN id = 1 THEN 0 ELSE 1 END, id ASC LIMIT 1")
      if (!priceCategoryResult.rowCount) throw new Error("يجب تعريف فئة سعر قبل اعتماد الارسالية الداخلية")
      // دفتر السندات الافتراضي للمستخدم المنفِّذ على نوع "ارسالية داخلية" (10) — وإن لم يوجد يُحفظ على الدفتر 0.
      const hasBookPermissions = (await client.query("SELECT to_regclass('voucher_book_user_permissions_tbl') IS NOT NULL AND to_regclass('voucher_books_tbl') IS NOT NULL AS ok")).rows[0]?.ok
      const defaultBook = !hasBookPermissions ? null : (await client.query(
        `SELECT p.vch_book_id, b.name FROM voucher_book_user_permissions_tbl p JOIN voucher_books_tbl b ON b.id = p.vch_book_id
         WHERE p.user_id = $1 AND p.voucher_type_id = $2 AND COALESCE(p.is_default, 0) = 1
         ORDER BY p.vch_book_id LIMIT 1`,
        [userId, INTERNAL_DELIVERY_VCH_TYPE],
      )).rows[0]
      const voucherBookId = Number(defaultBook?.vch_book_id || 0)
      let transferCode: string
      if (voucherBookId) {
        // نفس صيغة ترقيم سندات المخزون: بادئة الإعدادات + رمز الدفتر + تسلسل.
        const { prefix, startNumber } = await getStockVoucherNumberSettings("", INTERNAL_DELIVERY_VCH_TYPE)
        const codePrefix = `${prefix}${String(defaultBook?.name || "").trim().toUpperCase()}`
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`stock-voucher:${INTERNAL_DELIVERY_VCH_TYPE}:${codePrefix}`])
        const codeResult = await client.query("SELECT vch_code FROM voucher_header_tbl WHERE vch_type = $1 AND vch_code LIKE $2", [INTERNAL_DELIVERY_VCH_TYPE, `${codePrefix}%`])
        const lastSerial = codeResult.rows.reduce((highest: number, row: any) => {
          const match = String(row.vch_code || "").slice(codePrefix.length).match(/^[A-Za-z]?([0-9]+)$/)
          return match ? Math.max(highest, Number(match[1])) : highest
        }, 0)
        transferCode = buildVoucherCode(prefix, String(defaultBook?.name || ""), lastSerial >= startNumber ? lastSerial + 1 : startNumber)
      } else {
        const codePrefix = "T0"
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [codePrefix])
        const codeResult = await client.query("SELECT vch_code FROM voucher_header_tbl WHERE vch_type = 10 AND vch_code LIKE $1", [`${codePrefix}%`])
        const lastSerial = codeResult.rows.reduce((highest: number, row: any) => { const match = String(row.vch_code).match(/^T0(\d+)$/); return match ? Math.max(highest, Number(match[1])) : highest }, 0)
        const nextSerial = lastSerial + 1
        if (nextSerial > 99999999) throw new Error("تم تجاوز الحد الأقصى لأرقام الارساليات الداخلية")
        transferCode = `${codePrefix}${String(nextSerial).padStart(8, "0")}`
      }
      for (const item of items) {
        const priceResult = await client.query(`SELECT pu.unit_id, COALESCE(pp_selected.price, pp_fallback.price, 0) AS price FROM product_units pu LEFT JOIN product_prices pp_selected ON pp_selected.product_id=pu.product_id AND pp_selected.unit_id=pu.unit_id AND pp_selected.price_category_id=$3 LEFT JOIN product_prices pp_fallback ON pp_fallback.product_id=pu.product_id AND pp_fallback.unit_id=pu.unit_id AND pp_fallback.price_category_id=1 WHERE pu.product_id=$1 AND ($2::int IS NULL OR pu.unit_id=$2) ORDER BY CASE WHEN $2::int IS NOT NULL AND pu.unit_id=$2 THEN 0 ELSE 1 END, pu.id LIMIT 1`, [item.item_id, Number(item.unit_id ?? item.unitId ?? 0) || null, priceCategoryResult.rows[0].id])
        item.unit_id = Number(priceResult.rows[0]?.unit_id || item.unit_id || item.unitId || 0) || null
        item.price = Number(priceResult.rows[0]?.price || 0)
      }
      const transferTotal = items.reduce((total: number, item: any) => total + Number(item.received_quantity || 0) * Number(item.price || 0), 0)
      const transfer = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,vch_book_id,currency_id,rate,branch_id,to_store_id,from_store_id,amount,status,vch_status,insert_user,internal_voucher_id,note) VALUES (10,$1,CURRENT_TIMESTAMP,$2,$3,1,$4,$5,$6,$7,1,1,$8,$9,$10) RETURNING id`, [transferCode, voucherBookId, currencyResult.rows[0].id, request.branch_id, request.to_store_id || null, request.destination_warehouse_id || null, transferTotal, userId, id, `طلب بضاعة داخلي ${request.vch_code}`])
      for (const item of items) await client.query(`INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,price,barcode,item_properties) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [transfer.rows[0].id, item.item_id, item.item_name, Number(item.unit_id ?? item.unitId ?? 0) || null, request.to_store_id || null, Number(item.received_quantity), Number(item.price || 0), item.barcode, item.item_properties ? JSON.stringify(item.item_properties) : null])
    }
    await client.query("COMMIT")
    return { status: next }
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}

export function canEditInternalManufacturingRequest(status: number, settings: InternalManufacturingSettings) {
  return status === INTERNAL_MANUFACTURING_STATUS.RequestAudit || (!settings.requestAudit && status === INTERNAL_MANUFACTURING_STATUS.Preparation)
}

export async function updateInternalManufacturingRequest(id: number, input: any, userId: number) {
  const items = Array.isArray(input.items) ? input.items.filter((item: any) => Number(item.product_id) > 0 && Number(item.quantity) > 0) : []
  if (!Number(input.branch_id)) throw new Error("يجب تحديد فرع مقدم الطلب")
  if (!Number(input.manufacturing_branch_id)) throw new Error("يجب اختيار الفرع المطلوب منه البضاعة")
  if (!items.length) throw new Error("يجب اضافة صنف واحد على الأقل")
  if (!Number(input.source_warehouse_id)) throw new Error("يجب اختيار مستودع مقدم الطلب")
  if (!Number(input.destination_warehouse_id)) throw new Error("يجب اختيار المستودع المطلوب منه البضاعة")
  if (Number(input.source_warehouse_id) === Number(input.destination_warehouse_id)) throw new Error("لا يمكن أن يكون نفس المستودع")
  const settings = await getInternalManufacturingSettings()
  const client = await (await getTenantPool()).connect()
  try {
    await client.query("BEGIN")
    const result = await client.query("SELECT * FROM voucher_header_tbl WHERE id=$1 AND vch_type=20 AND status<>3 FOR UPDATE", [id])
    if (!result.rowCount) throw new Error("الطلب غير موجود")
    const request = result.rows[0]
    if (!canEditInternalManufacturingRequest(Number(request.internal_status), settings)) throw new Error("لا يمكن تعديل طلب بدأ سيره")
    if (Number(request.branch_id) !== Number(input.branch_id)) throw new Error("فرع مقدم الطلب غير مطابق")
    await client.query("UPDATE voucher_header_tbl SET vch_date=$1::date + vch_date::time, to_store_id=$2, manufacturing_branch_id=$3, destination_warehouse_id=$4, update_user=$5, last_update_date=CURRENT_TIMESTAMP WHERE id=$6", [input.vch_date, input.source_warehouse_id, input.manufacturing_branch_id, input.destination_warehouse_id, userId, id])
    const beforeItems = (await client.query("SELECT * FROM voucher_items_tbl WHERE voucher_id=$1 ORDER BY id", [id])).rows
    await client.query("DELETE FROM voucher_items_tbl WHERE voucher_id=$1", [id])
    for (const item of items) await client.query("INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,barcode,item_properties,free_quantity,received_quantity,prepared_quantity) VALUES ($1,$2,$3,COALESCE($4,(SELECT unit_id FROM product_units WHERE product_id=$2 ORDER BY id LIMIT 1)),$5,$6,$7,$8,0,0,0)", [id, item.product_id, item.product_name || null, item.unit_id || null, input.destination_warehouse_id, Number(item.quantity), item.barcode || null, item.properties || item.features || item.attributes ? JSON.stringify(item.properties || item.features || item.attributes) : null])
    const afterItems = (await client.query("SELECT * FROM voucher_items_tbl WHERE voucher_id=$1 ORDER BY id", [id])).rows
    await client.query(`INSERT INTO internal_manufacturing_events (voucher_id,action,from_status,to_status,user_id,before_snapshot,after_snapshot,request_snapshot) VALUES ($1,'update',$2,$2,$3,$4,$5,$6)`, [id, request.internal_status, userId, JSON.stringify(itemSnapshot(beforeItems)), JSON.stringify(itemSnapshot(afterItems)), JSON.stringify(requestSnapshot({ ...request, vch_date: input.vch_date, to_store_id: input.source_warehouse_id, manufacturing_branch_id: input.manufacturing_branch_id, destination_warehouse_id: input.destination_warehouse_id }))])
    await client.query("COMMIT")
    return { success: true }
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}
