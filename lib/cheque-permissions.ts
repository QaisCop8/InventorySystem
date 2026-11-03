import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { hasEffectivePermission, syncPermissionDefinitions } from "@/lib/permissions"
import { CHEQUE_OPERATION_PERMISSIONS, chequeOperationPermissionName } from "@/lib/transaction-permission-definitions"

// صلاحيات عمليات الشيكات: كل عملية تُفحص على فرع سند الشيك (الفرع الذي يُنشأ فيه قيد العملية).

async function accessIds(names: string[]) {
  await syncPermissionDefinitions(await resolveCurrentDbName())
  const rows = await sql`SELECT id, name FROM access_list WHERE name = ANY(${names}::text[])`
  return new Map<string, number>(rows.map((row: any) => [String(row.name), Number(row.id)]))
}

/** يتحقق من صلاحية عملية شيك على فرع معيّن؛ يعيد استجابة 403 باسم الصلاحية عند المنع. */
export async function authorizeChequeOperation(userId: string, code: string, branchId: number | null): Promise<NextResponse | null> {
  const name = chequeOperationPermissionName(code)
  if (!name) return NextResponse.json({ error: "عملية الشيك غير معروفة" }, { status: 400 })
  const id = (await accessIds([name])).get(name)
  if (!id || !(await hasEffectivePermission(userId, id, branchId))) {
    return NextResponse.json({ error: `لا يوجد لديك صلاحية ${name}`, permission_required: name }, { status: 403 })
  }
  return null
}

/** رموز العمليات المسموحة للمستخدم في الفرع النشط — لإخفاء أزرار العمليات الممنوعة (الخادم يفرضها عند التنفيذ بفرع الشيك). */
export async function permittedChequeOperationCodes(userId: string, branchId: number | null): Promise<Set<string>> {
  const entries = Object.entries(CHEQUE_OPERATION_PERMISSIONS)
  const ids = await accessIds(entries.map(([, name]) => name))
  const allowed = await Promise.all(entries.map(async ([code, name]) => {
    const id = ids.get(name)
    return id && (await hasEffectivePermission(userId, id, branchId)) ? code : null
  }))
  return new Set(allowed.filter((code): code is string => Boolean(code)))
}

export const requestBranchId = (request: NextRequest) => {
  const value = Number(request.headers.get("x-branch-id"))
  return Number.isInteger(value) && value > 0 ? value : null
}
