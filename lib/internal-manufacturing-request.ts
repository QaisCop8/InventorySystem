import sql, { getTenantPool, resolveCurrentDbName } from "@/lib/database"
import { ensureTables as ensureReceiptTables } from "@/app/api/receipts/_lib"
import { ensureTables as ensureStockTables } from "@/app/api/stock-vouchers/_lib"
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

export type InternalManufacturingSettings = {
  requestAudit: boolean
  preparation: boolean
  readyAudit: boolean
  send: boolean
  receive: boolean
  receivedAudit: boolean
}

const DEFAULT_SETTINGS: InternalManufacturingSettings = { requestAudit: true, preparation: true, readyAudit: true, send: true, receive: true, receivedAudit: true }
const ACTION_PERMISSIONS: Record<InternalManufacturingAction, string> = {
  create: "إنشاء طلب صناعة داخلي",
  requestAudit: "تدقيق طلب الصناعة",
  prepare: "تجهيز طلبات البضاعة",
  readyAudit: "تدقيق الطلبات الجاهزة",
  send: "إرسال طلب الصناعة",
  receive: "استلام طلبات البضاعة",
  receivedAudit: "تدقيق البضاعة المستلمة",
}

export async function ensureInternalManufacturingTables() {
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
  await sql`CREATE TABLE IF NOT EXISTS internal_manufacturing_events (id SERIAL PRIMARY KEY, voucher_id INTEGER NOT NULL REFERENCES voucher_header_tbl(id) ON DELETE CASCADE, action VARCHAR(40) NOT NULL, from_status INTEGER, to_status INTEGER, user_id INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  await sql`CREATE INDEX IF NOT EXISTS idx_internal_manufacturing_events_voucher ON internal_manufacturing_events(voucher_id, created_at)`
  await ensureInternalManufacturingPermissions()
}

async function ensureInternalManufacturingPermissions() {
  await ensurePermissionTables(await resolveCurrentDbName())
  const categoryRows = await sql`INSERT INTO access_category (name) SELECT 'صلاحيات طلب الصناعة' WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = 'صلاحيات طلب الصناعة') RETURNING id`
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name = 'صلاحيات طلب الصناعة' LIMIT 1`)[0]
  for (const name of Object.values(ACTION_PERMISSIONS)) {
    const rows = await sql`INSERT INTO access_list (name, category_id) SELECT ${name}, ${category.id} WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${name}) RETURNING id`
    const accessId = rows[0]?.id || (await sql`SELECT id FROM access_list WHERE name = ${name} LIMIT 1`)[0]?.id
    if (accessId) await sql`INSERT INTO role_permissions (role_id, access_id, is_granted) SELECT id, ${accessId}, TRUE FROM job_roles WHERE LOWER(name) = LOWER('مدير') ON CONFLICT (role_id, access_id) DO NOTHING`
  }
}

export async function authorizeInternalManufacturing(userId: string, branchId: number, action: InternalManufacturingAction) {
  const access = (await sql`SELECT id FROM access_list WHERE name = ${ACTION_PERMISSIONS[action]} LIMIT 1`)[0]
  if (!access || !(await hasEffectivePermission(userId, Number(access.id), branchId))) throw new Error("لا توجد صلاحية لتنفيذ هذه المرحلة")
}

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

export async function listInternalManufacturingRequests(status?: number) {
  const rows = await sql`SELECT voucher_header_tbl.*, requester.full_name AS requester_name FROM voucher_header_tbl LEFT JOIN user_settings requester ON requester.user_id = CAST(voucher_header_tbl.insert_user AS TEXT) WHERE voucher_header_tbl.vch_type = 20 AND voucher_header_tbl.status <> 3 ${status ? sql`AND voucher_header_tbl.internal_status = ${status}` : sql``} ORDER BY voucher_header_tbl.id DESC`
  for (const row of rows) row.items = await sql`SELECT * FROM voucher_items_tbl WHERE voucher_id = ${row.id} ORDER BY id`
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
  const status = nextInternalManufacturingStatus(INTERNAL_MANUFACTURING_STATUS.Created, settings, "create")
  const client = await (await getTenantPool()).connect()
  try {
    await client.query("BEGIN")
    const currencyResult = await client.query("SELECT id FROM currency ORDER BY id ASC LIMIT 1")
    if (!currencyResult.rowCount) throw new Error("يجب تعريف عملة أساسية قبل حفظ طلب البضاعة")
    const currencyId = Number(currencyResult.rows[0].id)
    const codeResult = await client.query("SELECT vch_code FROM voucher_header_tbl WHERE vch_type = 20")
    const usedCodes = new Set(codeResult.rows.map((row: any) => String(row.vch_code)))
    let codeNumber = Number(String(Date.now()).slice(-8))
    let vchCode = `IM${String(codeNumber).padStart(8, "0")}`
    while (usedCodes.has(vchCode)) {
      codeNumber = (codeNumber + 1) % 100000000
      vchCode = `IM${String(codeNumber).padStart(8, "0")}`
    }
    const header = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,currency_id,rate,branch_id,to_branch_id,to_store_id,manufacturing_branch_id,destination_warehouse_id,note,status,vch_status,insert_user,internal_status) VALUES (20,$1,CURRENT_DATE,$2,$3,$4,$5,$6,$7,$8,$9,1,1,$10,$11) RETURNING *`, [vchCode, currencyId, 1, input.manufacturing_branch_id, input.branch_id, input.source_warehouse_id || null, input.manufacturing_branch_id, input.destination_warehouse_id || null, input.note || null, userId, status])
    for (const item of items) await client.query(`INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,barcode,free_quantity,received_quantity,prepared_quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE((SELECT available_stock FROM product_stock WHERE product_id=$2),0),0,0)`, [header.rows[0].id, item.product_id, item.product_name || null, item.unit_id || null, input.destination_warehouse_id || null, Number(item.quantity), item.barcode || null])
    await client.query(`INSERT INTO internal_manufacturing_events (voucher_id,action,to_status,user_id) VALUES ($1,'create',$2,$3)`, [header.rows[0].id, status, userId])
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
    if (action === "prepare") {
      const preparedItems = Array.isArray(input.prepared_items) ? input.prepared_items : []
      for (const item of items) {
        const value = Number(preparedItems.find((candidate: any) => Number(candidate.id) === Number(item.id))?.prepared_quantity)
        if (!Number.isFinite(value) || value < 0 || value > Number(item.qnty)) throw new Error("الكمية المجهزة غير صالحة")
        await client.query(`UPDATE voucher_items_tbl SET prepared_quantity=$1 WHERE id=$2`, [value, item.id])
      }
    }
    if (action === "receive") {
      const receivedItems = Array.isArray(input.received_items) ? input.received_items : []
      for (const item of items) {
        const value = Number(receivedItems.find((candidate: any) => Number(candidate.id) === Number(item.id))?.received_quantity)
        if (!Number.isFinite(value) || value < 0 || value > Number(item.qnty)) throw new Error("الكمية المستلمة غير صالحة")
        await client.query(`UPDATE voucher_items_tbl SET received_quantity=$1 WHERE id=$2`, [value, item.id])
      }
    }
    const next = nextInternalManufacturingStatus(Number(request.internal_status) as InternalManufacturingStatus, settings, action)
    const updated = await client.query(`UPDATE voucher_header_tbl SET internal_status=$1,update_user=$2,last_update_date=CURRENT_TIMESTAMP WHERE id=$3 AND internal_status=$4 RETURNING id`, [next, userId, id, request.internal_status])
    if (!updated.rowCount) throw new Error("تمت معالجة الطلب من مستخدم آخر")
    await client.query(`INSERT INTO internal_manufacturing_events (voucher_id,action,from_status,to_status,user_id) VALUES ($1,$2,$3,$4,$5)`, [id, action, request.internal_status, next, userId])
    if (next === INTERNAL_MANUFACTURING_STATUS.Completed) {
      const transfer = await client.query(`INSERT INTO voucher_header_tbl (vch_type,vch_code,vch_date,branch_id,to_store_id,status,vch_status,insert_user,internal_voucher_id,note) VALUES (10,$1,CURRENT_DATE,$2,$3,1,1,$4,$5,$6) RETURNING id`, [`TR-${request.vch_code}`, request.branch_id, request.destination_warehouse_id || null, userId, id, `طلب بضاعة داخلي ${request.vch_code}`])
      for (const item of items) await client.query(`INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,barcode) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [transfer.rows[0].id, item.item_id, item.item_name, item.unit_id, request.destination_warehouse_id || null, Number(item.received_quantity), item.barcode])
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
    const result = await client.query("SELECT branch_id, internal_status FROM voucher_header_tbl WHERE id=$1 AND vch_type=20 AND status<>3 FOR UPDATE", [id])
    if (!result.rowCount) throw new Error("الطلب غير موجود")
    const request = result.rows[0]
    if (!canEditInternalManufacturingRequest(Number(request.internal_status), settings)) throw new Error("لا يمكن تعديل طلب بدأ سيره")
    if (Number(request.branch_id) !== Number(input.branch_id)) throw new Error("فرع مقدم الطلب غير مطابق")
    await client.query("UPDATE voucher_header_tbl SET vch_date=$1, to_store_id=$2, manufacturing_branch_id=$3, destination_warehouse_id=$4, update_user=$5, last_update_date=CURRENT_TIMESTAMP WHERE id=$6", [input.vch_date, input.source_warehouse_id, input.manufacturing_branch_id, input.destination_warehouse_id, userId, id])
    await client.query("DELETE FROM voucher_items_tbl WHERE voucher_id=$1", [id])
    for (const item of items) await client.query("INSERT INTO voucher_items_tbl (voucher_id,item_id,item_name,unit_id,store_id,qnty,barcode,free_quantity,received_quantity,prepared_quantity) VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,0)", [id, item.product_id, item.product_name || null, item.unit_id || null, input.destination_warehouse_id, Number(item.quantity), item.barcode || null])
    await client.query("COMMIT")
    return { success: true }
  } catch (error) { await client.query("ROLLBACK"); throw error } finally { client.release() }
}