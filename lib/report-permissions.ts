import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { hasEffectivePermission } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportDefinitionFor, reportPermissionName } from "@/lib/report-permission-definitions"

/**
 * يتحقق من صلاحية "استعلام <التقرير>" على الفرع النشط (x-branch-id). sections: التقارير التي يخدمها هذا
 * المسار — يكفي امتلاك أيٍّ منها. صلاحية غير معرَّفة بعد (قبل أول مزامنة) لا تمنع الوصول.
 * يعيد NextResponse جاهزة عند الرفض، أو null عند السماح.
 */
export async function reportAccessDenied(request: NextRequest, sections: string[]): Promise<NextResponse | null> {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  const branchId = Number(request.headers.get("x-branch-id") || 0) || null
  const definitions = sections.map(reportDefinitionFor).filter(Boolean) as { section: string; title: string }[]
  if (!definitions.length) return null
  const names = definitions.map((definition) => reportPermissionName(definition.title))
  const rows = await sql`SELECT id, name FROM access_list WHERE name = ANY(${names}::text[])`
  if (!rows.length) return null
  for (const row of rows) {
    if (await hasEffectivePermission(user.user_id, Number(row.id), branchId)) return null
  }
  return NextResponse.json({ error: `لا يوجد لديك صلاحية ${names.length === 1 ? names[0] : "عرض هذا التقرير"}` }, { status: 403 })
}
