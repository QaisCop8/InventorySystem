import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"

export async function GET(req: NextRequest) {
    try {
        if (!(await getSessionUser(req))) {
            return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
        }
        const { searchParams } = new URL(req.url)
        const userId = searchParams.get("userId")
        let branchId = Number(searchParams.get("branchId") || req.headers.get("x-branch-id"))

        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 })
        }

        // توافق مع مستهلكي الصلاحيات الحاليين (مثل auth-context): إن لم يرسلوا فرعاً، نستخدم
        // الفرع الأساسي للمستخدم. شاشة الإدارة ترسل branchId صراحة لعرض أي فرع يختاره المسؤول.
        if (!Number.isInteger(branchId) || branchId <= 0) {
            const userRows = await sql`SELECT branch_id FROM user_settings WHERE user_id = ${userId} LIMIT 1`
            // الصفر يعني سياقاً عاماً لمستخدم قديم غير مرتبط بفرع؛ يحافظ على صلاحياته الحالية
            // من user_access/role_permissions إلى أن يُسند إليه فرع من شاشة المستخدمين.
            branchId = Number(userRows[0]?.branch_id) || 0
        }

        await ensurePermissionTables(await resolveCurrentDbName())

        const rows = await sql`
      SELECT
        al.id AS access_id,
        al.name AS access_name,
        ac.name AS category_name,
        COALESCE(ubp.is_granted, ua.is_granted, rbp.is_granted, rp.is_granted, FALSE) AS is_granted,
        CASE
          WHEN ubp.access_id IS NOT NULL THEN 'branch_user'
          WHEN ua.access_id IS NOT NULL THEN 'user'
          WHEN rbp.access_id IS NOT NULL THEN 'branch_role'
          WHEN rp.access_id IS NOT NULL THEN 'role'
          ELSE 'none'
        END AS permission_source
      FROM access_list al
      LEFT JOIN access_category ac ON al.category_id = ac.id
      LEFT JOIN user_settings us ON us.user_id = ${userId}
      LEFT JOIN user_branch_permissions ubp
        ON ubp.access_id = al.id AND ubp.user_id = ${userId} AND ubp.branch_id = ${branchId}
      LEFT JOIN user_access ua ON ua.access_id = al.id AND ua.user_id = ${userId}
      LEFT JOIN role_branch_permissions rbp
        ON rbp.role_id = us.job_role_id AND rbp.access_id = al.id AND rbp.branch_id = ${branchId}
      LEFT JOIN role_permissions rp ON rp.role_id = us.job_role_id AND rp.access_id = al.id
      ORDER BY ac.id, al.id
    `

        // Normalize rows to plain JS objects
        const data = Array.isArray(rows) ? rows : rows?.rows || []

        return NextResponse.json(data)
    } catch (err) {
        console.error(err)
        return NextResponse.json({ error: "Failed to fetch access" }, { status: 500 })
    }
}
