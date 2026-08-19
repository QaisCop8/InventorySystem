import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import {
  ensureTransactionPermission,
  TRANSACTION_FAMILIES,
  transactionPermissionName,
  type TransactionAction,
  type TransactionFamily,
} from "@/lib/transaction-permissions"
import { hasEffectivePermission } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })

  const family = new URL(request.url).searchParams.get("family") as TransactionFamily
  const action = (new URL(request.url).searchParams.get("action") || "view") as TransactionAction
  if (!TRANSACTION_FAMILIES[family] || !["view", "create", "update", "delete", "post"].includes(action)) {
    return NextResponse.json({ error: "نوع الحركة أو الإجراء غير صالح" }, { status: 400 })
  }

  await ensureTransactionPermission(family, action)
  const permissionName = transactionPermissionName(family, action)
  const access = (await sql`SELECT id FROM access_list WHERE name = ${permissionName} ORDER BY id LIMIT 1`)[0]
  const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
  const membershipIds = new Set(memberships.map((row: any) => Number(row.branch_id)))
  const branches = await sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) != 3 ORDER BY branch_name`
  const allowed = []
  for (const branch of branches) {
    const branchId = Number(branch.id)
    if (membershipIds.size > 0 && !membershipIds.has(branchId)) continue
    if (await hasEffectivePermission(user.user_id, Number(access.id), branchId)) allowed.push(branch)
  }
  const userRow = (await sql`SELECT branch_id FROM user_settings WHERE user_id = ${user.user_id} LIMIT 1`)[0]
  return NextResponse.json({ branches: allowed, default_branch_id: userRow?.branch_id ?? null })
}
