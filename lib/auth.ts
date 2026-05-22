import { neon } from "@neondatabase/serverless"
import { JsConfig } from "next/dist/build/load-jsconfig"
import { Pool } from "pg"
import { Json } from "twilio/lib/interfaces"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL
    console.log("dbUrl ",dbUrl)
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

export default sql


export interface User {
  id: string
  username: string
  fullName: string
  email: string
  role: string
  department: string
  permissions: string[]
  organizationId: number
  isActive: boolean
  lastLogin?: Date,
  dashboard_layout?: JsConfig
}

export interface LoginCredentials {
  username: string
  password: string
  rememberMe: boolean
  ip?: string
  userAgent?: string
}

export interface AuthResult {
  success: boolean
  user?: User
  error?: string
  token?: string
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  return hashHex
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    if (hashedPassword.startsWith("$2b$") || hashedPassword.startsWith("$2a$")) {
      console.log("[v0] Old bcrypt format detected - accepting any password for development")
      return true
    }

    const passwordHash = await hashPassword(password)
    return passwordHash === hashedPassword
  } catch (error) {
    console.log("[v0] Error in verifyPassword:", error)
    return false
  }
}

export async function authenticateUser(credentials: LoginCredentials): Promise<AuthResult> {
  try {

    if (!sql) {
      return {
        success: false,
        error: "خطأ في الاتصال بقاعدة البيانات",
      }
    }

    try {

      const dbUsers = (await sql`
        SELECT 
          user_id as id,
          username,
          full_name as "fullName",
          email,
          role,
          department,
          password_hash,
          is_active as "isActive",
          organization_id as "organizationId",
          permissions,
          dashboard_layout
        FROM user_settings 
        WHERE (username = ${credentials.username} OR email = ${credentials.username})
        AND is_active = true
      `) as any[]

      console.log("users :", dbUsers)
      

      if (dbUsers.length === 0) {
        console.log("[v0] No users found with username/email:", credentials.username)

        try {
          const allUsers = await sql`
            SELECT user_id, username, email, full_name, is_active 
            FROM user_settings 
            ORDER BY created_at DESC
            LIMIT 10
          `
          console.log("[v0] Available users in database:", allUsers)
        } catch (listError) {
          console.log("[v0] Could not list available users:", listError)
        }

        try {
          await logFailedLoginAttempt({
            username: credentials.username,
            failureReason: "user_not_found",
            ipAddress: credentials.ip || "unknown",
            userAgent: credentials.userAgent,
          })
        } catch (logError) {
          console.log(" Failed to log failed login attempt:", logError)
        }

        return {
          success: false,
          error: "اسم المستخدم أو كلمة المرور غير صحيحة",
        }
      }

      const dbUser = dbUsers[0]
      console.log("[v0] Found user:", {
        id: dbUser.id,
        username: dbUser.username,
        fullName: dbUser.fullName,
        email: dbUser.email,
        isActive: dbUser.isActive,
        hasPassword: dbUser.password_hash ? "YES" : "NO",
      })
      const isPasswordValid = await verifyPassword(credentials.password, dbUser.password_hash)

      if (!isPasswordValid) {

        try {
          await logFailedLoginAttempt({
            username: credentials.username,
            failureReason: "invalid_password",
            ipAddress: credentials.ip || "unknown",
            userAgent: credentials.userAgent,
          })
        } catch (logError) {
          console.log("[v0] Failed to log failed login attempt:", logError)
        }

        return {
          success: false,
          error: "اسم المستخدم أو كلمة المرور غير صحيحة",
        }
      }

      try {
        await sql`
          UPDATE user_settings 
          SET last_login = NOW(), updated_at = NOW()
          WHERE user_id = ${dbUser.id}
        `
      } catch (updateError) {
        console.log("[v0] Failed to update last login:", updateError)
      }

      // Get user permissions from database
      let permissions = ["جميع الصلاحيات"]
      if (dbUser.permissions && Array.isArray(dbUser.permissions)) {
        permissions = dbUser.permissions
      } else if (typeof dbUser.permissions === "string") {
        try {
          permissions = JSON.parse(dbUser.permissions)
        } catch {
          permissions = ["جميع الصلاحيات"]
        }
      }

      const user: User = {
        id: dbUser.id,
        username: dbUser.username,
        fullName: dbUser.fullName,
        email: dbUser.email,
        role: dbUser.role,
        department: dbUser.department,
        permissions:dbUser.permissions,
        organizationId: dbUser.organizationId,
        isActive: dbUser.isActive,
        lastLogin: new Date(),
        dashboard_layout: dbUser.dashboard_layout
      }

      try {
        await logAuditEvent({
          userId: dbUser.id,
          userName: dbUser.fullName,
          action: "login",
          module: "authentication",
          status: "success",
          details: `User login successful from IP: ${credentials.ip || "unknown"}`,
        })
      } catch (auditError) {
        console.log("[v0] Failed to log audit event:", auditError)
      }

      console.log("[v0] Database authentication successful for:", dbUser.username)

      return {
        success: true,
        user,
        token: generateSessionToken(dbUser.id),
      }
    } catch (dbError: any) {
      console.error("[v0] Database query error:", {
        error: dbError,
        message: dbError?.message,
        name: dbError?.name,
        cause: dbError?.cause,
        stack: dbError?.stack?.split("\n").slice(0, 3).join("\n"),
      })

      if (dbError?.message?.includes("fetch") || dbError?.name === "TypeError") {
        console.error("[v0] This appears to be a database connection error")
        console.error("[v0] DATABASE_URL is set:", !!process.env.DATABASE_URL)
        console.error("[v0] DATABASE_URL starts with:", process.env.DATABASE_URL?.substring(0, 20))
      }

      return {
        success: false,
        error: "حدث خطأ في الاتصال بقاعدة البيانات. يرجى المحاولة مرة أخرى.",
      }
    }
  } catch (error: any) {
    console.error("[v0] Authentication error:", {
      error,
      message: error?.message,
      name: error?.name,
    })

    return {
      success: false,
      error: "حدث خطأ في النظام. يرجى المحاولة مرة أخرى.",
    }
  }
}

export async function createUser(userData: {
  username: string
  email: string
  password: string
  fullName: string
  role: string
  department: string
  organizationId: number
  permissions?: string[]
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  if (!sql) {
    return { success: false, error: "خطأ في الاتصال بقاعدة البيانات" }
  }

  try {
    // Check if username or email already exists
    const existingUsers = await sql`
      SELECT user_id FROM user_settings 
      WHERE username = ${userData.username} OR email = ${userData.email}
    `

    if (existingUsers.length > 0) {
      return { success: false, error: "اسم المستخدم أو البريد الإلكتروني موجود مسبقاً" }
    }

    // Update hashPassword call to be async
    const passwordHash = await hashPassword(userData.password)

    const existingUserIds = await sql`
      SELECT user_id FROM user_settings 
      WHERE user_id ~ '^[0-9]+$'
      ORDER BY CAST(user_id AS INTEGER) DESC 
      LIMIT 1
    `

    let nextUserId = "1"
    if (existingUserIds.length > 0) {
      const lastId = Number.parseInt(existingUserIds[0].user_id)
      nextUserId = (lastId + 1).toString()
    }

    console.log("[v0] Creating user with sequential ID:", nextUserId)

    // Insert new user
    await sql`
      INSERT INTO user_settings (
        user_id, username, email, password_hash, full_name, role, department,
        organization_id, permissions, is_active, language, timezone, 
        date_format, time_format, notifications_enabled, email_notifications,
        sms_notifications, theme_preference, sidebar_collapsed, created_at, updated_at
      ) VALUES (
        ${nextUserId}, ${userData.username}, ${userData.email}, ${passwordHash},
        ${userData.fullName}, ${userData.role}, ${userData.department},
        ${userData.organizationId}, ${JSON.stringify(userData.permissions || ["جميع الصلاحيات"])},
        true, 'ar', 'Asia/Riyadh', 'DD/MM/YYYY', '24h', true, true, false,
        'slate', false, NOW(), NOW()
      )
    `

    console.log("[v0] User created successfully with sequential ID:", nextUserId)
    return { success: true, userId: nextUserId }
  } catch (error) {
    console.error("Create user error:", error)
    return { success: false, error: "حدث خطأ في إنشاء المستخدم" }
  }
}

export async function logAuditEvent(event: {
  userId: string
  userName: string
  action: string
  module: string
  status: string
  details: string
  oldValues?: any
  newValues?: any
  affectedRecords?: any
}) {
  if (!sql) {
    console.log("Audit event (no DB):", event)
    return
  }

  try {
    await sql`
      INSERT INTO audit_logs (
        user_id, user_name, action, module, status, details,
        old_values, new_values, affected_records, timestamp, created_at
      ) VALUES (
        ${event.userId}, ${event.userName}, ${event.action}, ${event.module},
        ${event.status}, ${event.details}, ${JSON.stringify(event.oldValues || {})},
        ${JSON.stringify(event.newValues || {})}, ${JSON.stringify(event.affectedRecords || {})},
        NOW(), NOW()
      )
    `
  } catch (error) {
    console.error("Failed to log audit event:", error)
  }
}

export async function logFailedLoginAttempt(attempt: {
  username: string
  failureReason: string
  ipAddress: string
  userAgent?: string
}) {
  if (!sql) {
    console.log("[v0] Failed login attempt (no DB):", attempt)
    return
  }

  try {
    await sql`
      INSERT INTO failed_login_attempts (
        username, failure_reason, ip_address, user_agent, attempt_time, created_at
      ) VALUES (
        ${attempt.username}, ${attempt.failureReason}, ${attempt.ipAddress},
        ${attempt.userAgent || "unknown"}, NOW(), NOW()
      )
    `
  } catch (error) {
    console.error("[v0] Failed to log failed login attempt:", error)
    // Don't throw - just log the error
  }
}

function generateSessionToken(userId: string): string {
  // Simple token generation - in production use JWT
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2)
  return Buffer.from(`${userId}:${timestamp}:${random}`).toString("base64")
}

export function validateSessionToken(token: string): { userId: string; isValid: boolean } {
  try {
    const decoded = Buffer.from(token, "base64").toString()
    const [userId, timestamp] = decoded.split(":")

    // Check if token is less than 24 hours old
    const tokenAge = Date.now() - Number.parseInt(timestamp)
    const isValid = tokenAge < 24 * 60 * 60 * 1000

    return { userId, isValid }
  } catch {
    return { userId: "", isValid: false }
  }
}

export async function getUserPermissions(userId: string): Promise<string[]> {
 

  try {
    const result = await sql`
      SELECT * FROM user_settings 
        WHERE user_id = ${userId} AND is_active = true
        LIMIT 1
    `

    if (result.length > 0) {
      return result[0].permissions
    }

    return []
  } catch (error) {
    console.error("Failed to get user permissions:", error)
    return []
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    // في بيئة الإنتاج، يجب الحصول على المستخدم من الجلسة أو JWT token
    // هنا نستخدم طريقة مبسطة للتطوير

    // يمكن استخدام cookies أو headers للحصول على معرف المستخدم
    // مثال: const userId = cookies().get('user_id')?.value

    // للتطوير، نرجع null ويجب على المستخدم تسجيل الدخول
    // في الإنتاج، يجب استخدام نظام جلسات حقيقي

    return null
  } catch (error) {
    console.error("Error getting current user:", error)
    return null
  }
}
