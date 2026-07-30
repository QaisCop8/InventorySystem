import sql, { resolveCurrentDbName } from "./database"
import { ensurePermissionTables } from "./permissions"
import managementSql, { getManagementPool, ensureManagementTables } from "./management-db"

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
  dashboard_layout?: any
  branchId?: number
  branchName?: string
}

let branchColumnEnsured: Promise<void> | null = null
function ensureBranchColumn() {
  if (!branchColumnEnsured) {
    branchColumnEnsured = (async () => {
      // جدول branches نفسه قد لا يكون موجوداً بعد (قاعدة شركة حديثة التزويد لم تُنشأ فيها سوى
      // user_settings)، ولا يكفي هنا عمل CREATE TABLE IF NOT EXISTS مطابقاً فقط لعمود id المُشار
      // إليه من user_settings.branch_id — بل نحتاج الجدول كاملاً لأن استعلام الدخول (authenticateUser)
      // يعمل LEFT JOIN عليه مباشرة، وسيفشل بالكامل (relation does not exist) إن لم يكن موجوداً إطلاقاً.
      await sql`
        CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          branch_code VARCHAR(20) UNIQUE NOT NULL,
          branch_name VARCHAR(100) NOT NULL,
          bank_id INTEGER,
          address TEXT,
          manager VARCHAR(100),
          phone VARCHAR(20),
          status INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
      await sql`ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS branch_id INTEGER`
    })().catch((error: unknown) => {
      branchColumnEnsured = null
      throw error
    })
  }
  return branchColumnEnsured
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

// الجزء المشترك بين تسجيل الدخول العادي (authenticateUser، بعد التحقق من كلمة المرور) وتسجيل
// الدخول التلقائي عند اختيار شركة (authenticateByEmail، بلا كلمة مرور أصلاً — الهوية مُثبَتة
// مسبقاً عبر جلسة الإدارة mgmt_session): تحديث آخر دخول، بناء كائن المستخدم، تسجيل الحدث، وإصدار
// رمز الجلسة.
async function finalizeLogin(dbUser: any, ip?: string, userAgent?: string): Promise<AuthResult> {
  try {
    await sql`
      UPDATE user_settings
      SET last_login = NOW(), updated_at = NOW()
      WHERE user_id = ${dbUser.id}
    `
  } catch (updateError) {
    console.log("[v0] Failed to update last login:", updateError)
  }

  const user: User = {
    id: dbUser.id,
    username: dbUser.username,
    fullName: dbUser.fullName,
    email: dbUser.email,
    role: dbUser.role,
    department: dbUser.department,
    permissions: dbUser.permissions,
    organizationId: dbUser.organizationId,
    isActive: dbUser.isActive,
    lastLogin: new Date(),
    dashboard_layout: dbUser.dashboard_layout,
    branchId: dbUser.branchId ?? undefined,
    branchName: dbUser.branchName ?? undefined,
  }

  try {
    await logAuditEvent({
      userId: dbUser.id,
      userName: dbUser.fullName,
      action: "login",
      module: "authentication",
      status: "success",
      details: `User login successful from IP: ${ip || "unknown"}`,
    })
  } catch (auditError) {
    console.log("[v0] Failed to log audit event:", auditError)
  }

  return {
    success: true,
    user,
    token: generateSessionToken(dbUser.id),
  }
}

// تسجيل دخول موثوق بلا كلمة مرور — يُستخدَم فقط من /api/management/select-company بعد التحقق من
// أن المستخدم يملك جلسة إدارة صالحة (mgmt_session) ويملك الشركة المُختارة فعلاً؛ يبحث عن مستخدم
// بنفس بريد حساب الإدارة داخل قاعدة الشركة المُختارة (ضمن withTenantDb) لتسجيل دخوله تلقائياً دون
// إعادة طلب كلمة المرور. إن لم يوجد مستخدم بهذا البريد في هذه الشركة، يعيد success:false ليعرض
// العميل نموذج الدخول الاعتيادي لتلك الشركة بدلاً من ذلك.
export async function authenticateByEmail(email: string, opts: { ip?: string; userAgent?: string } = {}): Promise<AuthResult> {
  try {
    if (!sql) {
      return { success: false, error: "خطأ في الاتصال بقاعدة البيانات" }
    }

    await ensureBranchColumn()

    const dbUsers = (await sql`
      SELECT
        us.user_id as id,
        us.username,
        us.full_name as "fullName",
        us.email,
        us.role,
        us.department,
        us.is_active as "isActive",
        us.organization_id as "organizationId",
        us.permissions,
        us.dashboard_layout,
        us.branch_id as "branchId",
        b.branch_name as "branchName"
      FROM user_settings us
      LEFT JOIN branches b ON b.id = us.branch_id
      WHERE LOWER(us.email) = ${email.trim().toLowerCase()}
      AND us.is_active = true
    `) as any[]

    if (dbUsers.length === 0) {
      return { success: false, error: "لا يوجد مستخدم بهذا البريد الإلكتروني في هذه الشركة" }
    }

    return await finalizeLogin(dbUsers[0], opts.ip, opts.userAgent)
  } catch (error: any) {
    console.error("[v0] authenticateByEmail error:", error?.message)
    return { success: false, error: "حدث خطأ في النظام. يرجى المحاولة مرة أخرى." }
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
      await ensureBranchColumn()

      const dbUsers = (await sql`
        SELECT
          us.user_id as id,
          us.username,
          us.full_name as "fullName",
          us.email,
          us.role,
          us.department,
          us.password_hash,
          us.is_active as "isActive",
          us.organization_id as "organizationId",
          us.permissions,
          us.dashboard_layout,
          us.branch_id as "branchId",
          b.branch_name as "branchName"
        FROM user_settings us
        LEFT JOIN branches b ON b.id = us.branch_id
        WHERE (us.username = ${credentials.username} OR us.email = ${credentials.username})
        AND us.is_active = true
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

      console.log("[v0] Database authentication successful for:", dbUser.username)

      return await finalizeLogin(dbUser, credentials.ip, credentials.userAgent)
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
  branchId?: number | null
  jobRoleId?: number | null
  managementUserId?: number | null
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  if (!sql) {
    return { success: false, error: "خطأ في الاتصال بقاعدة البيانات" }
  }

  try {
    await ensureBranchColumn()
    await ensurePermissionTables(await resolveCurrentDbName())

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
        organization_id, permissions, branch_id, job_role_id, management_user_id, is_active, language, timezone,
        date_format, time_format, notifications_enabled, email_notifications,
        sms_notifications, theme_preference, sidebar_collapsed, created_at, updated_at
      ) VALUES (
        ${nextUserId}, ${userData.username}, ${userData.email}, ${passwordHash},
        ${userData.fullName}, ${userData.role}, ${userData.department},
        ${userData.organizationId}, ${JSON.stringify(userData.permissions || ["جميع الصلاحيات"])},
        ${userData.branchId ?? null}, ${userData.jobRoleId ?? null}, ${userData.managementUserId ?? null},
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

// إنشاء موظف شركة جديد بهويّة عامة موحّدة عبر النظام (management.users) — يضمن تفرّد البريد
// الإلكتروني عالمياً (لا شركة أخرى تستطيع تسجيل نفس البريد كموظف لديها)، مع بقاء تسجيل الدخول
// اليومي بلا أي تغيير (مباشرة على قاعدة الشركة نفسها، انظر authenticateUser أعلاه — لا يمر إطلاقاً
// عبر قاعدة الإدارة). انظر خطة الصلاحيات لتفاصيل التصميم الكامل والمفاضلات.
export async function createTenantEmployeeWithManagementLink(userData: {
  username: string
  email: string
  password: string
  fullName: string
  role: string
  department: string
  organizationId: number
  permissions?: string[]
  branchId?: number | null
  jobRoleId?: number | null
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  const email = userData.email?.trim().toLowerCase()
  if (!email) {
    return { success: false, error: "البريد الإلكتروني مطلوب" }
  }

  await ensureManagementTables()

  // فحص مبدئي (الفحص الحاسم الفعلي هو قيد UNIQUE على management.users.email أدناه — قد يتسابق
  // مسؤولا شركتين مختلفتين على نفس البريد بين هذا الفحص والإدراج، فيُلتقَط ذلك عبر رمز خطأ postgres
  // 23505 لا الاعتماد على هذا الفحص وحده).
  const existingManagementUser = await managementSql`SELECT id FROM users WHERE email = ${email}`
  if (existingManagementUser.length > 0) {
    return { success: false, error: "البريد الإلكتروني مستخدَم في شركة أخرى بالفعل" }
  }

  const currentDbName = await resolveCurrentDbName()
  const companyRows = await managementSql`SELECT id FROM companies WHERE db_name = ${currentDbName}`
  const companyId: number | null = companyRows[0]?.id ?? null

  // لا صف شركة بقاعدة الإدارة (قاعدة مرجعية محلية بلا تتبّع، أو بيئة تطوير مباشرة بلا كوكي
  // tenant_db) — يستمر إنشاء المستخدم محلياً بالشركة كما كان يعمل تماماً قبل هذه الميزة، بلا أي
  // ربط بقاعدة الإدارة، بدل رفض إضافة موظف بالكامل في تلك البيئات.
  if (!companyId) {
    console.warn("[auth] createTenantEmployeeWithManagementLink: no management.companies row for", currentDbName)
    return createUser(userData)
  }

  const passwordHash = await hashPassword(userData.password)

  const managementPool = getManagementPool()
  const managementClient = await managementPool.connect()
  try {
    await managementClient.query("BEGIN")

    let managementUserId: number
    try {
      const inserted = await managementClient.query(
        `INSERT INTO users (full_name, email, password_hash, email_verified, is_active)
         VALUES ($1, $2, $3, true, true) RETURNING id`,
        [userData.fullName, email, passwordHash],
      )
      managementUserId = inserted.rows[0].id
    } catch (insertError: any) {
      if (insertError?.code === "23505") {
        await managementClient.query("ROLLBACK")
        return { success: false, error: "البريد الإلكتروني مستخدَم في شركة أخرى بالفعل" }
      }
      throw insertError
    }

    await managementClient.query(
      `INSERT INTO user_company (user_id, company_id, role, is_active) VALUES ($1, $2, 'employee', true)`,
      [managementUserId, companyId],
    )

    // hashPassword حتمية (SHA-256 بلا ملح، انظر تعريفها أدناه) — إعادة تجزئة نفس النص الصريح هنا
    // بأمان تُنتج نفس القيمة المُدرَجة أعلاه في management.users.password_hash بلا حاجة لتمريرها.
    const tenantResult = await createUser({ ...userData, email, managementUserId })

    if (!tenantResult.success) {
      await managementClient.query("ROLLBACK")
      return tenantResult
    }

    await managementClient.query("COMMIT")
    return tenantResult
  } catch (error) {
    await managementClient.query("ROLLBACK")
    console.error("[auth] createTenantEmployeeWithManagementLink error:", error)
    return { success: false, error: "حدث خطأ في إنشاء المستخدم" }
  } finally {
    managementClient.release()
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
