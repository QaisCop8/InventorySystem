import { type NextRequest, NextResponse } from "next/server"

import { createUser, hashPassword } from "@/lib/auth"

import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
      console.log("[v0] Using local PostgreSQL with pg Pool")
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query =
            strings.reduce(
              (prev, curr, i) =>
                prev + curr + (i < values.length ? `$${i + 1}` : ""),
              ""
            )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      console.log("[v0] Using Neon serverless client")
      sql = neon(dbUrl)
    }

    console.log("[v0] Database client initialized successfully")
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}


export async function GET(request: NextRequest) {
  try {
    console.log("[v0] User API GET request started")

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("user_id")

    if (userId) {
      console.log("[v0] Fetching specific user:", userId)
      const user = await sql`
        SELECT * FROM user_settings 
        WHERE user_id = ${userId} AND is_active = true
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
        id,
        user_id,
        organization_id,
        username,
        email,
        full_name,
        role,
        department,
        phone,
        avatar_url,
        language,
        timezone,
        date_format,
        time_format,
        notifications_enabled,
        email_notifications,
        sms_notifications,
        theme_preference,
        sidebar_collapsed,
        dashboard_layout,
        permissions,
        last_login,
        is_active,
        created_at,
        updated_at
      FROM user_settings 
      WHERE is_active = true
      ORDER BY created_at DESC
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
    const data = await request.json()

    console.log("[v0] Creating user with data:", {
      username: data.username,
      email: data.email,
      full_name: data.full_name,
    })

    const result = await createUser({
      username: data.username,
      email: data.email,
      password: data.password,
      fullName: data.full_name,
      role: data.role || "مدير النظام",
      department: data.department || "الإدارة",
      organizationId: data.organization_id || 1,
      permissions: data.permissions || ["جميع الصلاحيات"],
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
    const data = await request.json()
    console.log("[v0] PUT request data:", data)
    
    if (data.permissions && Object.keys(data).length === 2 && data.user_id) {
      // Only update permissions
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

    if (!data.username || !data.email) {
      return NextResponse.json({ error: "Username and email are required" }, { status: 400 })
    }

    // Update password only when a new non-empty password is explicitly provided.
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
        username = ${data.username},
        email = ${data.email},
        full_name = ${data.full_name},
        role = ${data.role},
        department = ${data.department},
        phone = ${data.phone},
        avatar_url = ${data.avatar_url},
        language = ${data.language},
        timezone = ${data.timezone},
        date_format = ${data.date_format},
        time_format = ${data.time_format},
        notifications_enabled = ${data.notifications_enabled},
        email_notifications = ${data.email_notifications},
        sms_notifications = ${data.sms_notifications},
        theme_preference = ${data.theme_preference},
        sidebar_collapsed = ${data.sidebar_collapsed},
        dashboard_layout = ${JSON.stringify(data.dashboard_layout || {})},
        permissions = ${JSON.stringify(data.permissions || {})},
        is_active = ${data.is_active},
        password_hash = COALESCE(${passwordHash}, password_hash),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${data.user_id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

     return NextResponse.json({
      success: true,
      user: result[0],
    });
  } catch (error) {
    console.error("Database update error:", error)
    return NextResponse.json({ error: "Failed to update user settings" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
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
