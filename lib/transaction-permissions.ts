import { NextResponse, type NextRequest } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables, getGrantedBranchIds, hasEffectivePermission } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import {
  legacyTransactionPermissionName,
  TRANSACTION_ACTION_LABELS,
  TRANSACTION_FAMILIES,
  TRANSACTION_PERMISSION_CATEGORY,
  transactionPermissionName,
  type TransactionAction,
  type TransactionFamily,
} from "@/lib/transaction-permission-definitions"

export { TRANSACTION_FAMILIES, transactionPermissionName }
export type { TransactionAction, TransactionFamily }

const VOUCHER_FAMILIES: Record<number, TransactionFamily> = {
  1: "journal",
  4: "receipt",
  5: "payment",
  6: "credit_note",
  7: "debit_note",
  8: "stock_in",
  9: "stock_out",
  10: "internal_delivery",
  11: "stock_use",
  12: "sales_invoice",
  13: "sales_delivery",
  14: "consignment_delivery",
  15: "consignment_return",
  16: "sales_return",
  17: "purchase_invoice",
  18: "purchase_delivery",
  19: "purchase_return",
}

export function transactionFamilyForVoucherType(vchType: number): TransactionFamily | null {
  return VOUCHER_FAMILIES[Number(vchType)] || null
}

export async function ensureTransactionPermission(family: TransactionFamily, action: TransactionAction): Promise<number> {
  await ensurePermissionTables(await resolveCurrentDbName())
  await sql`
    SELECT setval(
      pg_get_serial_sequence('access_category', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM access_category), 0), 1),
      true
    )
  `
  const categoryName = TRANSACTION_PERMISSION_CATEGORY
  const permissionName = transactionPermissionName(family, action)
  const legacyName = legacyTransactionPermissionName(family, action)
  const categoryRows = await sql`
    INSERT INTO access_category (name)
    SELECT ${categoryName}
    WHERE NOT EXISTS (SELECT 1 FROM access_category WHERE name = ${categoryName})
    RETURNING id
  `
  const category = categoryRows[0] || (await sql`SELECT id FROM access_category WHERE name = ${categoryName} ORDER BY id LIMIT 1`)[0]
  if (legacyName) {
    await sql`
      UPDATE access_list
      SET name = ${permissionName}, category_id = ${category.id}, updated_at = CURRENT_TIMESTAMP
      WHERE name = ${legacyName}
        AND NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${permissionName})
    `
  }
  const inserted = await sql`
    INSERT INTO access_list (name, category_id)
    SELECT ${permissionName}, ${category.id}
    WHERE NOT EXISTS (SELECT 1 FROM access_list WHERE name = ${permissionName})
    RETURNING id
  `
  const access = inserted[0] || (await sql`SELECT id FROM access_list WHERE name = ${permissionName} ORDER BY id LIMIT 1`)[0]

  // Preserve access for legacy full-access users and the built-in manager role.
  await sql`
    INSERT INTO role_permissions (role_id, access_id, is_granted)
    SELECT id, ${access.id}, TRUE FROM job_roles WHERE LOWER(name) = LOWER('مدير')
    ON CONFLICT (role_id, access_id) DO NOTHING
  `
  await sql`
    INSERT INTO user_access (user_id, access_id, is_granted)
    SELECT user_id, ${access.id}, TRUE
    FROM user_settings
    WHERE permissions::text LIKE '%جميع الصلاحيات%'
    ON CONFLICT (user_id, access_id) DO NOTHING
  `
  return Number(access.id)
}

async function userHasBranchMembership(userId: string, branchId: number): Promise<boolean> {
  const rows = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${userId}`
  return rows.length === 0 || rows.some((row: any) => Number(row.branch_id) === branchId)
}

export async function authorizeTransaction(
  request: NextRequest,
  family: TransactionFamily,
  action: TransactionAction,
  branchValue?: unknown,
): Promise<{ ok: true; userId: string; branchId: number; branchIds: number[]; accessId: number } | { ok: false; response: NextResponse }> {
  const user = await getSessionUser(request)
  if (!user) return { ok: false, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }

  const rawRequested = branchValue ?? request.headers.get("x-branch-id")
  const requested = Number(rawRequested)
  const userRow = (await sql`SELECT branch_id FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]
  const accessId = await ensureTransactionPermission(family, action)

  // A list/query without an explicit branch must include every branch where
  // the user has the requested view permission, not only their default branch.
  if (action === "view" && (rawRequested == null || rawRequested === "")) {
    const membershipRows = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const memberships = new Set(membershipRows.map((row: any) => Number(row.branch_id)))
    const granted = await getGrantedBranchIds(user.user_id, accessId)
    const branchIds = membershipRows.length ? granted.filter((id) => memberships.has(id)) : granted
    if (!branchIds.length) {
      return {
        ok: false,
        response: NextResponse.json({ error: `لا توجد لديك صلاحية ${transactionPermissionName(family, action)}` }, { status: 403 }),
      }
    }
    const defaultBranch = Number(userRow?.branch_id)
    return {
      ok: true,
      userId: user.user_id,
      branchId: branchIds.includes(defaultBranch) ? defaultBranch : branchIds[0],
      branchIds,
      accessId,
    }
  }

  const branchId = Number.isInteger(requested) && requested > 0 ? requested : Number(userRow?.branch_id)
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return { ok: false, response: NextResponse.json({ error: "يجب تحديد الفرع" }, { status: 400 }) }
  }
  if (!(await userHasBranchMembership(user.user_id, branchId))) {
    return { ok: false, response: NextResponse.json({ error: "المستخدم غير مخول للعمل على هذا الفرع" }, { status: 403 }) }
  }
  if (!(await hasEffectivePermission(user.user_id, accessId, branchId))) {
    return {
      ok: false,
      response: NextResponse.json({ error: `لا توجد لديك صلاحية ${transactionPermissionName(family, action)} على هذا الفرع` }, { status: 403 }),
    }
  }
  return { ok: true, userId: user.user_id, branchId, branchIds: [branchId], accessId }
}

export async function authorizeStoredVoucher(request: NextRequest, voucherId: number, action: TransactionAction) {
  const row = (await sql`SELECT vch_type, branch_id FROM voucher_header_tbl WHERE id = ${voucherId} LIMIT 1`)[0]
  if (!row) return { ok: false as const, response: NextResponse.json({ error: "السند غير موجود" }, { status: 404 }) }
  const family = transactionFamilyForVoucherType(Number(row.vch_type))
  if (!family) return { ok: false as const, response: NextResponse.json({ error: "نوع الحركة غير صالح" }, { status: 400 }) }
  return authorizeTransaction(request, family, action, row.branch_id)
}

export async function ensureAllTransactionPermissions() {
  for (const family of Object.keys(TRANSACTION_FAMILIES) as TransactionFamily[]) {
    for (const action of Object.keys(TRANSACTION_ACTION_LABELS) as TransactionAction[]) {
      await ensureTransactionPermission(family, action)
    }
  }
}
