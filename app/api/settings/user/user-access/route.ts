import { type NextRequest, NextResponse } from "next/server"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const userId = searchParams.get("userId")

        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 })
        }

        await ensurePermissionTables(await resolveCurrentDbName())

        // الصلاحية الفعّالة = تخصيص صريح على المستخدم (user_access) إن وُجد، وإلا صلاحية دوره
        // الوظيفي (role_permissions عبر user_settings.job_role_id)، وإلا رفض. انظر lib/permissions.ts
        // (hasEffectivePermission يطبّق نفس المنطق لكل صلاحية مفردة، هنا استعلام دفعي لكل الصلاحيات معاً).
        const rows = await sql`
      SELECT
        al.id AS access_id,
        al.name AS access_name,
        ac.name AS category_name,
        COALESCE(ua.is_granted, rp.is_granted, FALSE) AS is_granted
      FROM access_list al
      LEFT JOIN access_category ac ON al.category_id = ac.id
      LEFT JOIN user_settings us ON us.user_id = ${userId}
      LEFT JOIN role_permissions rp ON rp.role_id = us.job_role_id AND rp.access_id = al.id
      LEFT JOIN user_access ua
        ON ua.access_id = al.id AND ua.user_id = ${userId}
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
