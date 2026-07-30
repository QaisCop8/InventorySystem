import { type NextRequest, NextResponse } from "next/server"

import { createTenantEmployeeWithManagementLink, hashPassword } from "@/lib/auth"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { ensurePermissionTables } from "@/lib/permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import managementSql from "@/lib/management-db"

let branchColumnEnsured: Promise<void> | null = null
// شركات زُوِّدت قبل توحيد بنية user_settings (عبر النسخة القديمة من lib/provisioning.ts) قد
// تفتقد أعمدة مثل phone/avatar_url رغم استخدامها في استعلام GET أدناه — بلا هذا الإصلاح الذاتي
// تفشل الصفحة بكاملها (relation/column does not exist) على أي شركة أُنشئت بتلك النسخة القديمة.
function ensureBranchColumn() {
  if (!branchColumnEnsured) {
    branchColumnEnsured = (async () => {
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS branch_id INTEGER`
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS avatar_url TEXT`
    })().catch((error: unknown) => {
      branchColumnEnsured = null
      throw error
    })
  }
  return branchColumnEnsured
}

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] User API GET request started")
    await ensureBranchColumn()

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")

    if (userId) {
      console.log("[v0] Fetching specific user:", userId)
      const user = await sql`
        SELECT us.*, b.branch_name
        FROM user_settings us
        LEFT JOIN branches b ON b.id = us.branch_id
        WHERE us.user_id = ${userId} AND us.is_active = true
        LIMIT 1
      `

      if (user.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      return NextResponse.json(user[0])
    }

    console.log("[v0] Fetching all users from database...")
    const users = await sql`
      SELECT
        us.id,
        us.user_id,
        us.organization_id,
        us.username,
        us.email,
        us.full_name,
        us.role,
        us.department,
        us.phone,
        us.avatar_url,
        us.language,
        us.timezone,
        us.date_format,
        us.time_format,
        us.notifications_enabled,
        us.email_notifications,
        us.sms_notifications,
        us.theme_preference,
        us.sidebar_collapsed,
        us.dashboard_layout,
        us.permissions,
        us.branch_id,
        b.branch_name,
        us.last_login,
        us.is_active,
        us.created_at,
        us.updated_at
      FROM user_settings us
      LEFT JOIN branches b ON b.id = us.branch_id
      WHERE us.is_active = true
      ORDER BY us.created_at DESC
    `
    return NextResponse.json(users)
  } catch (error) {
    console.error("[v0] Database query error:", error)
    console.error("[v0] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    })

    return NextResponse.json(
      {
        error: "فشل في جلب بيانات المستخدمين",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] User API POST request started")
    if (!(await getSessionUser(request))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    await ensureBranchColumn()
    const data = await request.json()

    console.log("[v0] Creating user with data:", {
      username: data.username,
      email: data.email,
      full_name: data.full_name,
    })

    if (!data.email || !String(data.email).trim()) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب" }, { status: 400 })
    }

    // يضيف الموظف أولاً إلى management.users (هوية عامة موحَّدة، تفرّد البريد الإلكتروني عبر كل
    // الشركات) ثم يربطه بهذه الشركة عبر management.user_company، وأخيراً يُنشئ صفه المحلي بقاعدة
    // الشركة كما كان يعمل تماماً من قبل — انظر lib/auth.ts وخطة الصلاحيات لتفاصيل التصميم الكامل.
    const result = await createTenantEmployeeWithManagementLink({
      username: data.username,
      email: data.email,
      password: data.password,
      fullName: data.full_name,
      role: data.role || "مدير النظام",
      department: data.department || "الإدارة",
      organizationId: data.organization_id || 1,
      permissions: data.permissions || ["جميع الصلاحيات"],
      branchId: data.branch_id ? Number(data.branch_id) : null,
      jobRoleId: data.job_role_id ? Number(data.job_role_id) : null,
    })

    if (!result.success) {
      console.error("[v0] User creation failed:", result.error)
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Fetch the created user to return complete data
    const createdUser = await sql`
      SELECT * FROM user_settings 
      WHERE user_id = ${result.userId}
      LIMIT 1
    `

    console.log("[v0] User created successfully with sequential ID:", result.userId)
    return NextResponse.json({
      success: true,
      user: createdUser[0],
    });
  } catch (error) {
    console.error("Database insert error:", error)
    return NextResponse.json({ error: "فشل في حفظ المستخدم" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    await ensureBranchColumn()
    await ensurePermissionTables(await resolveCurrentDbName())
    const data = await request.json()
    console.log("[v0] PUT request data:", data)

    if (!data?.user_id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (data.permissions && Object.keys(data).length === 2 && data.user_id) {
      const result = await sql`
        UPDATE user_settings
        SET
          permissions = ${JSON.stringify(data.permissions)},
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${data.user_id}
        RETURNING *
      `

      if (result.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      return NextResponse.json(result[0])
    }

    if (data.language !== undefined && Object.keys(data).filter((key) => key !== "user_id" && key !== "language").length === 0) {
      const result = await sql`
        UPDATE user_settings
        SET
          language = ${data.language},
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${data.user_id}
        RETURNING *
      `

      if (result.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      return NextResponse.json({ success: true, user: result[0] })
    }

    if (data.avatar_url !== undefined && Object.keys(data).filter((key) => key !== "user_id" && key !== "avatar_url").length === 0) {
      const result = await sql`
        UPDATE user_settings
        SET
          avatar_url = ${data.avatar_url},
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ${data.user_id}
        RETURNING *
      `

      if (result.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      return NextResponse.json({ success: true, user: result[0] })
    }

    const hasProfileFields =
      data.username !== undefined ||
      data.email !== undefined ||
      data.full_name !== undefined ||
      data.role !== undefined ||
      data.department !== undefined ||
      data.phone !== undefined ||
      data.branch_id !== undefined ||
      data.job_role_id !== undefined ||
      data.password_hash !== undefined ||
      data.password !== undefined

    const hasPreferenceFields =
      data.avatar_url !== undefined ||
      data.language !== undefined ||
      data.timezone !== undefined ||
      data.date_format !== undefined ||
      data.time_format !== undefined ||
      data.notifications_enabled !== undefined ||
      data.email_notifications !== undefined ||
      data.sms_notifications !== undefined ||
      data.theme_preference !== undefined ||
      data.sidebar_collapsed !== undefined ||
      data.dashboard_layout !== undefined ||
      data.permissions !== undefined ||
      data.is_active !== undefined

    if (!hasProfileFields && !hasPreferenceFields) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 })
    }

    const rawPassword =
      typeof data.password_hash === "string" && data.password_hash.trim().length > 0
        ? data.password_hash
        : typeof data.password === "string" && data.password.trim().length > 0
          ? data.password
          : null

    const passwordHash = rawPassword ? await hashPassword(rawPassword) : null

    const result = await sql`
      UPDATE user_settings
      SET
        username = ${data.username ?? null},
        email = ${data.email ?? null},
        full_name = ${data.full_name ?? null},
        role = ${data.role ?? null},
        department = ${data.department ?? null},
        phone = ${data.phone ?? null},
        avatar_url = ${data.avatar_url ?? null},
        language = ${data.language ?? null},
        timezone = ${data.timezone ?? null},
        date_format = ${data.date_format ?? null},
        time_format = ${data.time_format ?? null},
        notifications_enabled = ${data.notifications_enabled ?? null},
        email_notifications = ${data.email_notifications ?? null},
        sms_notifications = ${data.sms_notifications ?? null},
        theme_preference = ${data.theme_preference ?? null},
        sidebar_collapsed = ${data.sidebar_collapsed ?? null},
        dashboard_layout = ${data.dashboard_layout ? JSON.stringify(data.dashboard_layout) : null},
        permissions = ${data.permissions ? JSON.stringify(data.permissions) : null},
        is_active = ${data.is_active ?? null},
        password_hash = COALESCE(${passwordHash}, password_hash),
        branch_id = ${data.branch_id ?? null},
        job_role_id = ${data.job_role_id ?? null},
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${data.user_id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // مزامنة كلمة المرور/حالة النشاط مع قاعدة الإدارة إن كان هذا المستخدم مرتبطاً بحساب عام هناك
    // (management_user_id — مضبوط فقط للموظفين المُنشَأين عبر المسار الثنائي أعلاه، NULL لكل من
    // سبقهم) — مجهود أفضل (best effort): فشلها لا يُسقِط حفظ المستخدم محلياً، إذ تسجيل الدخول
    // اليومي لا يمر بقاعدة الإدارة إطلاقاً أصلاً (authenticateUser). التنشيط/الإيقاف يُقيَّد بعلاقة
    // هذه الشركة تحديداً (user_company.is_active) لا بالحساب العام (users.is_active، محجوز لمسؤول
    // المنصة فقط بلوحة التحكم).
    const updatedUser = result[0]
    if (updatedUser.management_user_id) {
      try {
        if (passwordHash) {
          await managementSql`UPDATE users SET password_hash = ${passwordHash}, updated_at = CURRENT_TIMESTAMP WHERE id = ${updatedUser.management_user_id}`
        }
        if (data.is_active !== undefined) {
          const currentDbName = await resolveCurrentDbName()
          await managementSql`
            UPDATE user_company SET is_active = ${data.is_active}
            WHERE user_id = ${updatedUser.management_user_id}
              AND company_id = (SELECT id FROM companies WHERE db_name = ${currentDbName})
          `
        }
      } catch (syncError) {
        console.error("[settings/user PUT] Failed to sync management DB:", syncError)
      }
    }

    return NextResponse.json({ success: true, user: result[0] })
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json(
      {
        error: "Failed to update user settings",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    await sql`
      UPDATE user_settings 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
    `

    return NextResponse.json({ message: "User deactivated successfully" })
  } catch (error) {
    console.error("Error deactivating user:", error)
    return NextResponse.json({ error: "Failed to deactivate user" }, { status: 500 })
  }
}
