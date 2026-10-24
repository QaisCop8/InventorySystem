import type { NextRequest } from "next/server"
import sql, { memoInTransaction } from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getSessionUser } from "@/lib/tenant-auth"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// صلاحيات المستخدمين على الحسابات (أدوات ← صلاحيات المستخدمين على الحسابات): الافتراضي أن كل الحسابات
// مسموحة؛ الجدول يحفظ **المنع** فقط — صف (مستخدم، حساب، فرع) يُخفي الحساب عن المستخدم في البحث والاختيار
// بالحركات والتقارير. branch_id = 0 يعني كل الفروع، وإلا فرعاً محدداً (الفرع النشط للطلب: x-branch-id).
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const ALL_BRANCHES = 0

export async function ensureAccountAccessTable() {
  return runSchemaOnce("lib/account-access.ts#ensureAccountAccessTable", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS user_account_restrictions (
        user_id VARCHAR(50) NOT NULL,
        account_id INTEGER NOT NULL REFERENCES account_tbl(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL DEFAULT 0,
        created_by VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, account_id, branch_id)
      )`
    await sql`CREATE INDEX IF NOT EXISTS idx_user_account_restrictions_user ON user_account_restrictions(user_id, branch_id)`
  })
}

const requestBranch = (request: NextRequest, branchId?: unknown) => {
  const explicit = Number(branchId)
  if (Number.isInteger(explicit) && explicit > 0) return explicit
  const header = Number(request.headers.get("x-branch-id"))
  return Number.isInteger(header) && header > 0 ? header : 0
}

/** الحسابات الممنوعة على مستخدم في فرع (ومنعه على كل الفروع). */
export async function deniedAccountIdsFor(userId: string | number | null | undefined, branchId = 0): Promise<Set<number>> {
  if (userId == null || userId === "") return new Set()
  await ensureAccountAccessTable()
  const rows = await memoInTransaction(`account-denials:${userId}:${branchId}`, () => sql`
    SELECT DISTINCT account_id FROM user_account_restrictions
    WHERE user_id = ${String(userId)} AND (branch_id = 0 OR branch_id = ${Number(branchId) || 0})
  ` as Promise<any[]>)
  return new Set(rows.map((row: any) => Number(row.account_id)))
}

/** الحسابات الممنوعة على مستخدم الجلسة في الفرع النشط للطلب. */
export async function deniedAccountIds(request: NextRequest, branchId?: unknown): Promise<Set<number>> {
  const user = await getSessionUser(request).catch(() => null)
  if (!user) return new Set()
  return deniedAccountIdsFor(user.user_id, requestBranch(request, branchId))
}

/** يُسقط من قائمة الحسابات ما مُنع عن المستخدم (key = عمود معرّف الحساب بالصف). */
export async function filterAccessibleAccounts<T extends Record<string, any>>(request: NextRequest, rows: T[], key = "id", branchId?: unknown): Promise<T[]> {
  if (!rows?.length) return rows
  const denied = await deniedAccountIds(request, branchId)
  if (!denied.size) return rows
  return rows.filter((row) => !denied.has(Number(row[key])))
}

/** رسالة رفض إن طلب المستخدم (تقرير/استعلام) حساباً ممنوعاً عنه، وإلا null. */
export async function accountAccessError(request: NextRequest, accountIds: number[], branchId?: unknown): Promise<string | null> {
  const ids = accountIds.map(Number).filter((id) => id > 0)
  if (!ids.length) return null
  const denied = await deniedAccountIds(request, branchId)
  return ids.some((id) => denied.has(id)) ? "لا تملك صلاحية على أحد الحسابات المحددة" : null
}
