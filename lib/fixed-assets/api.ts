import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { AutoJournalError } from "@/lib/auto-journals"
import { authorizeTransaction, type TransactionAction } from "@/lib/transaction-permissions"
import { ensureAutoJournalSchema } from "@/app/api/auto-journals/_lib"
import { ensureFixedAssetSchema } from "./schema"
import { FixedAssetError } from "./service"

export type FixedAssetAuth = { userId: string; branchId: number; branchIds: number[] }

// view → every branch the user may query; other actions → the requested branch (or default).
// "post" additionally requires the journal create+post permissions, because those operations
// generate posted journal vouchers through lib/auto-journals.
export async function authorizeFixedAssets(request: NextRequest, action: TransactionAction, branchValue?: unknown) {
  const result = await authorizeTransaction(request, "fixed_asset", action, action === "view" ? branchValue ?? null : branchValue)
  if (!result.ok) return result
  if (action === "post") {
    for (const journalAction of ["create", "post"] as const) {
      const journal = await authorizeTransaction(request, "journal", journalAction, result.branchId)
      if (!journal.ok) return journal
    }
  }
  return result
}

export async function handleFixedAssets<T>(
  request: NextRequest,
  action: TransactionAction,
  run: (auth: FixedAssetAuth) => Promise<T | NextResponse>,
  options: { branch?: () => Promise<unknown> | unknown; fallback?: string } = {},
) {
  try {
    await ensureAutoJournalSchema()
    await ensureFixedAssetSchema()
    return await withTenantTransaction(async () => {
      const auth = await authorizeFixedAssets(request, action, options.branch ? await options.branch() : undefined)
      if (!auth.ok) return auth.response
      const result = await run({ userId: auth.userId, branchId: auth.branchId, branchIds: auth.branchIds })
      return result instanceof NextResponse ? result : NextResponse.json(result)
    })
  } catch (error) {
    if (error instanceof FixedAssetError || error instanceof AutoJournalError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if ((error as any)?.code === "23505") return NextResponse.json({ error: "القيمة مستخدمة مسبقاً (رمز مكرر)" }, { status: 400 })
    console.error(options.fallback ?? "fixed assets", error)
    return NextResponse.json({ error: options.fallback ?? "تعذر تنفيذ العملية" }, { status: 500 })
  }
}

export const readJson = async (request: NextRequest) => {
  try {
    return (await request.json()) as Record<string, any>
  } catch {
    throw new FixedAssetError("بيانات الطلب غير صالحة")
  }
}

export async function assetBranch(id: number) {
  const row = (await sql`SELECT branch_id FROM fa_assets_tbl WHERE id = ${id}`)[0]
  if (!row) throw new FixedAssetError("الأصل غير موجود")
  return Number(row.branch_id)
}

export const routeId = (value: string) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new FixedAssetError("معرّف غير صالح")
  return id
}
