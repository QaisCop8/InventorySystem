import { NextResponse, type NextRequest } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensureFilePermissions, LEGACY_FULL_ACCESS_SQL } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { filePermissionName, hasFilePermissionEntries, type FileAction, type FileFamily } from "@/lib/file-permission-definitions"
import { TRANSACTION_FAMILIES, transactionPermissionName, type TransactionFamily } from "@/lib/transaction-permission-definitions"
export type { FileFamily, FileAction } from "@/lib/file-permission-definitions"

type AccessContext = { userId: string; branchId: number; entries: { access_id: number; access_name: string; is_granted: boolean }[] }
type Denied = { ok: false; response: NextResponse }
type Granted = { ok: true; userId: string; branchId: number; accessId: number }

async function accessContext(request: NextRequest): Promise<AccessContext | Denied> {
  const user = await getSessionUser(request)
  if (!user) return { ok: false, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  await ensureFilePermissions(await resolveCurrentDbName())
  const rawBranch = request.headers.get("x-branch-id")
  const requested = Number(rawBranch)
  if (rawBranch && (!Number.isInteger(requested) || requested <= 0)) {
    return { ok: false, response: NextResponse.json({ error: "الفرع غير صالح" }, { status: 400 }) }
  }
  const userRow = (await sql`SELECT branch_id FROM user_settings WHERE user_id=${user.user_id} LIMIT 1`)[0]
  const branchId = requested || Number(userRow?.branch_id) || 0
  const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id=${user.user_id}`
  if (memberships.length && !memberships.some((row: any) => Number(row.branch_id) === branchId)) {
    return { ok: false, response: NextResponse.json({ error: "المستخدم غير مخول للعمل على هذا الفرع" }, { status: 403 }) }
  }
  const entries = await sql`
    SELECT al.id access_id,al.name access_name,
      COALESCE(ubp.is_granted,ua.is_granted,rbp.is_granted,rp.is_granted,${sql.unsafe(LEGACY_FULL_ACCESS_SQL)}) is_granted
    FROM access_list al
    JOIN user_settings us ON us.user_id=${user.user_id}
    LEFT JOIN user_branch_permissions ubp ON ubp.user_id=us.user_id AND ubp.branch_id=${branchId} AND ubp.access_id=al.id
    LEFT JOIN user_access ua ON ua.user_id=us.user_id AND ua.access_id=al.id
    LEFT JOIN role_branch_permissions rbp ON rbp.role_id=us.job_role_id AND rbp.branch_id=${branchId} AND rbp.access_id=al.id
    LEFT JOIN role_permissions rp ON rp.role_id=us.job_role_id AND rp.access_id=al.id
  `
  return { userId: user.user_id, branchId, entries }
}

function denial(family: FileFamily, action: FileAction): Denied {
  return { ok: false, response: NextResponse.json({ error: `لا توجد لديك صلاحية ${filePermissionName(family, action)} في الفرع الحالي` }, { status: 403 }) }
}

export async function authorizeFile(request: NextRequest, family: FileFamily, action: FileAction): Promise<(Granted & { lookupOnly: false }) | Denied> {
  const context = await accessContext(request)
  if ("ok" in context) return context
  if (!hasFilePermissionEntries(context.entries, family, action)) {
    return denial(family, hasFilePermissionEntries(context.entries, family, "access") ? action : "access")
  }
  return { ok: true, userId: context.userId, branchId: context.branchId, lookupOnly: false, accessId: Number(context.entries.find(entry => entry.access_name === filePermissionName(family, action))?.access_id) || 0 }
}

const SALES: TransactionFamily[] = ["sales_order", "sales_invoice", "sales_delivery", "sales_return", "consignment_delivery", "consignment_return"]
const PURCHASES: TransactionFamily[] = ["purchase_order", "purchase_invoice", "purchase_delivery", "purchase_return"]
const LOOKUP_TRANSACTIONS: Record<FileFamily, TransactionFamily[]> = {
  customers: [...SALES, "receipt", "payment", "credit_note", "debit_note"],
  suppliers: [...PURCHASES, "receipt", "payment", "cheque_payment", "credit_note", "debit_note"],
  subscribers: [...SALES, "receipt", "payment"],
  items: [...SALES, ...PURCHASES, "stock_in", "stock_out", "internal_delivery", "stock_use"],
  services: [...SALES, ...PURCHASES], cars: [...SALES, ...PURCHASES], drivers: [...SALES, ...PURCHASES],
  accounts: Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[],
  banks: ["receipt", "payment", "cheque_payment", "journal"],
  "bank-accounts": ["receipt", "payment", "cheque_payment", "journal"],
  "credit-cards": ["receipt", "payment", "sales_invoice"],
  employees: ["journal"], branches: Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[],
}

/** Shared pickers receive selector metadata; only primary-family query grants return full records. */
export async function authorizeFileRead(request: NextRequest, families: FileFamily[]): Promise<(Granted & { lookupOnly: boolean }) | Denied> {
  const primary = families[0]
  if (!primary) return { ok: false, response: NextResponse.json({ error: "نوع الملف غير صالح" }, { status: 400 }) }
  const context = await accessContext(request)
  if ("ok" in context) return context
  const full = hasFilePermissionEntries(context.entries, primary, "view")
  const fileLookup = families.some(family => ["view", "create", "update"].some(action => hasFilePermissionEntries(context.entries, family, action as FileAction)))
  const transactionLookup = LOOKUP_TRANSACTIONS[primary].some(family => ["view", "create", "update"].some(action => {
    const name = transactionPermissionName(family, action as "view" | "create" | "update")
    return context.entries.some(entry => entry.access_name === name && entry.is_granted === true)
  }))
  // Branch selectors bootstrap login, permission management and the branch switcher.
  const branchLookup = primary === "branches"
  if (!full && !fileLookup && !transactionLookup && !branchLookup) return denial(primary, "view")
  return { ok: true, userId: context.userId, branchId: context.branchId, lookupOnly: !full, accessId: Number(context.entries.find(entry => entry.access_name === filePermissionName(primary, "view"))?.access_id) }
}

const COMMON_LOOKUP_FIELDS = ["id", "code", "name", "name_en", "name_lang2", "other_name", "is_active", "status", "type", "currency_id", "currency_code", "currency_name"]
const LOOKUP_FIELDS: Record<FileFamily, string[]> = {
  customers: ["customer_code", "customer_name", "account_id", "account_code", "pricecategory", "priceCategory", "price_category_id", "credit_limit"],
  suppliers: ["supplier_code", "supplier_name", "customer_code", "customer_name", "account_id", "account_code", "pricecategory", "priceCategory", "price_category_id", "credit_limit"],
  subscribers: ["customer_code", "customer_name", "account_id", "account_code", "pricecategory", "priceCategory", "price_category_id"],
  employees: ["employee_code", "full_name", "department_id", "branch_id"],
  items: ["product_code", "product_name", "product_number", "item_code", "item_name", "barcode", "main_barcode", "item_type", "product_type", "is_service", "unit_id", "unit_name", "unit_code", "to_main_unit_qty", "price", "selling_price", "sale_price", "vat_rate", "tax_rate", "store_id", "store_name", "warehouse_id", "has_expiry", "has_batch", "has_serial", "track_expiry", "track_batches", "track_serials", "has_lots", "has_units", "category_id"],
  services: ["product_code", "product_name", "product_number", "item_code", "item_name", "barcode", "item_type", "product_type", "is_service", "unit_id", "unit_name", "price", "selling_price", "sale_price", "vat_rate", "tax_rate", "category_id"],
  cars: ["car_number", "car_code", "car_name", "plate_number", "driver_id"], drivers: ["driver_number", "driver_code", "driver_name", "full_name"],
  accounts: ["account_code", "account_name", "account_id", "classification_type_id", "type_name", "classification_type_name", "father_id", "parent_account_id", "finanical_list_id", "has_deliveries", "has_orders", "has_children"],
  banks: ["bank_code", "bank_name"], branches: ["branch_code", "branch_name", "bank_id"],
  "bank-accounts": ["bank_id", "branch_id", "bank_branch_id", "account_id", "bank_name", "branch_name", "account_name", "account_code"],
  "credit-cards": ["main_type", "main_type_id", "credit_card_type_id", "card_name", "card_code", "account_id"],
}

export function projectFileLookup(family: FileFamily, rows: any[]): any[] {
  const fields = [...COMMON_LOOKUP_FIELDS, ...LOOKUP_FIELDS[family]]
  if (family === "items" || family === "services") fields.push("first_unit", "first_barcode", "first_price", "first_price_name", "unit_price", "main_unit", "secondary_unit", "conversion_factor", "default_store", "default_store_name", "batch_tracking", "expiry_tracking", "has_serial_number", "measurment_id", "minimum_order_quantity", "related_items_mode", "pos_sold_using_scale")
  return rows.map(row => {
    const result: Record<string, any> = {}
    for (const field of fields) if (Object.prototype.hasOwnProperty.call(row, field)) result[field] = row[field]
    if (family === "items" || family === "services" || family === "accounts") {
      for (const key of ["units", "prices", "cost_centers", "stop_transactions"]) if (Array.isArray(row[key])) {
        const allowed = ["id", "unit_id", "unit_name", "unit_code", "barcode", "primary_barcode", "barcode_list", "to_main_unit_qty", "to_main_qnty", "unit_price", "price", "sale_price", "selling_price", "currency_id", "price_category_id", "price_category", "is_main", "is_default", "cost_center_type_id", "default_cost_center_id", "required_in_transactions", "voucher_types_id", "stop_date"]
        result[key] = row[key].map((child: any) => Object.fromEntries(allowed.filter(field => Object.prototype.hasOwnProperty.call(child, field)).map(field => [field, child[field]])))
      }
    }
    return result
  })
}
