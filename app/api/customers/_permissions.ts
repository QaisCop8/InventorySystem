import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { authorizeFile, authorizeFileRead, type FileAction, type FileFamily } from "@/lib/file-permissions"

export function customerFileFamily(type: unknown): FileFamily | null {
  if (Number(type) === 2) return "suppliers"
  if (Number(type) === 4) return "subscribers"
  // Sales representatives have their own existing screen outside this matrix.
  if (Number(type) === 3) return null
  return "customers"
}

export async function authorizeCustomerType(request: NextRequest, type: unknown, action: FileAction | "lookup") {
  const family = customerFileFamily(type)
  if (family) return action === "lookup" ? authorizeFileRead(request, [family]) : authorizeFile(request, family, action)
  const user = await getSessionUser(request)
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  return { ok: true as const, userId: user.user_id, branchId: Number(request.headers.get("x-branch-id")) || 0, lookupOnly: false }
}

export async function authorizeStoredCustomer(request: NextRequest, id: unknown, action: FileAction | "lookup", nextType?: unknown) {
  const customerId = Number(id)
  if (!Number.isInteger(customerId) || customerId <= 0) return { ok: false as const, response: NextResponse.json({ error: "معرف الجهة غير صالح" }, { status: 400 }) }
  const stored = (await sql`SELECT type FROM customers WHERE id = ${customerId} LIMIT 1`)[0]
  if (!stored) return { ok: false as const, response: NextResponse.json({ error: "الجهة غير موجودة" }, { status: 404 }) }
  const permission = await authorizeCustomerType(request, stored.type, action)
  if (!permission.ok) return permission
  if (nextType !== undefined && customerFileFamily(nextType) !== customerFileFamily(stored.type)) {
    const target = await authorizeCustomerType(request, nextType, "create")
    if (!target.ok) return target
  }
  return permission
}
