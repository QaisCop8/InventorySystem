import { NextResponse, type NextRequest } from "next/server"
import sql, { memoInTransaction, resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { hasEffectivePermission, syncPermissionDefinitions } from "@/lib/permissions"
import { USER_ADMIN_PERMISSION, isAdminRoleName } from "@/lib/transaction-permission-definitions"

// إعدادات المستخدمين والصلاحيات: عمليات الحفظ (إضافة/تعديل/حذف مستخدم، الصلاحيات، الأدوار، دفاتر السندات،
// الإعدادات الافتراضية للمستخدمين) مسموحة فقط للمسؤول — دور "مدير"/admin (حقل role أو الدور الوظيفي) أو
// "جميع الصلاحيات" — أو لمن مُنح صلاحية "إدارة المستخدمين والصلاحيات".

export async function isUserAdmin(userId: string | number): Promise<boolean> {
  const row = ((await memoInTransaction(`user-admin:${userId}`, () => sql`
    SELECT us.role, jr.name AS job_role_name,
      (COALESCE(us.permissions::text, '') LIKE '%جميع الصلاحيات%') AS all_permissions
    FROM user_settings us LEFT JOIN job_roles jr ON jr.id = us.job_role_id
    WHERE us.user_id::text = ${String(userId)} LIMIT 1
  ` as Promise<any[]>)) as any[])[0]
  if (!row) return false
  if (row.all_permissions || isAdminRoleName(row.role) || isAdminRoleName(row.job_role_name)) return true
  await syncPermissionDefinitions(await resolveCurrentDbName())
  const access = ((await sql`SELECT id FROM access_list WHERE name = ${USER_ADMIN_PERMISSION} ORDER BY id LIMIT 1`) as any[])[0]
  return access ? hasEffectivePermission(String(userId), Number(access.id), null) : false
}

/** يرفض الطلب (403) إن لم يكن المستخدم مسؤولاً ولا يملك صلاحية إدارة المستخدمين والصلاحيات. */
export async function authorizeUserAdmin(request: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const user = await getSessionUser(request)
  if (!user) return { ok: false, response: NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 }) }
  if (await isUserAdmin(user.user_id)) return { ok: true, userId: String(user.user_id) }
  return { ok: false, response: NextResponse.json({ error: `لا توجد لديك صلاحية ${USER_ADMIN_PERMISSION} — تواصل مع مسؤول النظام` }, { status: 403 }) }
}

/** حقول يعدّلها المستخدم لنفسه دون صلاحية إدارة (الصورة، الخطوط، شكل الجداول، تخطيط اللوحة). */
const SELF_SERVICE_KEYS = new Set(["user_id", "avatar_url", "font_family", "font_size", "datagrid_settings", "dashboard_layout"])
export const isSelfServiceUpdate = (data: Record<string, unknown>, sessionUserId: string | number) =>
  String(data?.user_id ?? "") === String(sessionUserId) && Object.keys(data || {}).every((key) => SELF_SERVICE_KEYS.has(key))
