import sql from "@/lib/database"
import bcrypt from "bcryptjs"
import { cookies } from "next/headers"
import { shouldUseSecureCookies } from "./cookie-security"
import crypto from "crypto"

// Create Neon client
export interface CustomerUser {
  id: number
  customer_id: number
  username: string
  email: string | null
  is_active: boolean
  last_login: Date | null
  created_at: Date
}

export interface CustomerPermissions {
  can_view_orders: boolean
  can_create_orders: boolean
  can_view_balance: boolean
  can_view_products: boolean
  can_view_prices: boolean
  can_view_stock: boolean
}

export interface CustomerSession {
  user: CustomerUser
  customer: any
  permissions: CustomerPermissions
}

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

// Generate secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

// Create customer user
export async function createCustomerUser(
  customerId: number,
  username: string,
  password: string,
  email?: string,
): Promise<CustomerUser> {
  console.log("[v0] createCustomerUser called:", { customerId, username, email })

  if (!username || username.trim().length === 0) {
    throw new Error("اسم المستخدم مطلوب")
  }

  if (!password || password.length < 6) {
    throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    console.log("[v0] Password hashed successfully")

    // Use Neon SQL with template literals
    const result = await sql`
      INSERT INTO customer_users (customer_id, username, password_hash, email)
      VALUES (${customerId}, ${username.trim()}, ${passwordHash}, ${email || null})
      RETURNING id, customer_id, username, email, is_active, last_login, created_at
    `

    console.log("[v0] User inserted successfully:", result[0])

    const user = result[0] as CustomerUser

    // Create default permissions
    await sql`
      INSERT INTO customer_permissions (customer_user_id)
      VALUES (${user.id})
    `

    console.log("[v0] Customer user created successfully:", { userId: user.id, username: user.username })

    return user
  } catch (error) {
    console.error("[v0] Error creating customer user:", error)
    throw error
  }
}

// Authenticate customer user
export async function authenticateCustomer(
  username: string,
  password: string,
): Promise<{ success: boolean; session?: CustomerSession; error?: string }> {
  try {
    console.log("[v0] Authenticating customer:", username)

    if (!username || !password) {
      return { success: false, error: "اسم المستخدم وكلمة المرور مطلوبان" }
    }

    // Get user with password hash
    const userResult = await sql`
      SELECT id, customer_id, username, password_hash, email, is_active, last_login, created_at
      FROM customer_users
      WHERE username = ${username.trim()}
    `

    console.log("[v0] User query result:", { found: userResult.length > 0 })

    if (userResult.length === 0) {
      return { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }
    }

    const user = userResult[0]

    if (!user.is_active) {
      console.log("[v0] User account is inactive")
      return { success: false, error: "الحساب غير مفعل. الرجاء التواصل مع الإدارة" }
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash)
    console.log("[v0] Password verification:", { isValid })

    if (!isValid) {
      return { success: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" }
    }

    // Get customer info
    const customerResult = await sql`
      SELECT id, customer_code, customer_name, email, mobile1, status
      FROM customers
      WHERE id = ${user.customer_id}
    `

    console.log("[v0] Customer query result:", { found: customerResult.length > 0 })

    if (customerResult.length === 0) {
      return { success: false, error: "بيانات العميل غير موجودة" }
    }

    const customer = customerResult[0]

    // Get permissions
    const permissionsResult = await sql`
      SELECT can_view_orders, can_create_orders, can_view_balance, 
             can_view_products, can_view_prices, can_view_stock
      FROM customer_permissions
      WHERE customer_user_id = ${user.id}
    `

    const permissions = permissionsResult[0] as CustomerPermissions

    // Create session
    const sessionToken = generateSessionToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION)

    await sql`
      INSERT INTO customer_sessions (customer_user_id, session_token, expires_at)
      VALUES (${user.id}, ${sessionToken}, ${expiresAt})
    `

    // Update last login
    await sql`
      UPDATE customer_users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ${user.id}
    `

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set("customer_session", sessionToken, {
      httpOnly: true,
      secure: await shouldUseSecureCookies(),
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    })

    console.log("[v0] Authentication successful for user:", username)

    // Remove password hash from user object
    const { password_hash, ...userWithoutPassword } = user

    return {
      success: true,
      session: {
        user: userWithoutPassword as CustomerUser,
        customer: {
          id: customer.id,
          code: customer.customer_code,
          name: customer.customer_name,
          email: customer.email,
          phone: customer.mobile1,
          status: customer.status,
        },
        permissions,
      },
    }
  } catch (error) {
    console.error("[v0] Customer authentication error:", error)
    return { success: false, error: "حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى" }
  }
}

// Get current customer session
export async function getCustomerSession(): Promise<CustomerSession | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("customer_session")?.value

    if (!sessionToken) {
      return null
    }

    // Get session
    const sessionResult = await sql`
      SELECT customer_user_id, expires_at
      FROM customer_sessions
      WHERE session_token = ${sessionToken}
    `

    if (sessionResult.length === 0) {
      return null
    }

    const session = sessionResult[0]

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await sql`DELETE FROM customer_sessions WHERE session_token = ${sessionToken}`
      cookieStore.delete("customer_session")
      return null
    }

    // Get user
    const userResult = await sql`
      SELECT id, customer_id, username, email, is_active, last_login, created_at
      FROM customer_users
      WHERE id = ${session.customer_user_id}
    `

    if (userResult.length === 0 || !userResult[0].is_active) {
      return null
    }

    const user = userResult[0] as CustomerUser

    // Get customer
    const customerResult = await sql`
      SELECT id, customer_code, customer_name, email, mobile1, status
      FROM customers WHERE id = ${user.customer_id}
    `

    // Get permissions
    const permissionsResult = await sql`
      SELECT can_view_orders, can_create_orders, can_view_balance,
             can_view_products, can_view_prices, can_view_stock
      FROM customer_permissions
      WHERE customer_user_id = ${user.id}
    `

    return {
      user,
      customer: customerResult[0],
      permissions: permissionsResult[0] as CustomerPermissions,
    }
  } catch (error) {
    console.error("Get customer session error:", error)
    return null
  }
}

// Logout customer
export async function logoutCustomer(): Promise<void> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("customer_session")?.value

    if (sessionToken) {
      await sql`DELETE FROM customer_sessions WHERE session_token = ${sessionToken}`
    }

    cookieStore.delete("customer_session")
  } catch (error) {
    console.error("Customer logout error:", error)
  }
}

// Update customer permissions
export async function updateCustomerPermissions(
  customerUserId: number,
  permissions: Partial<CustomerPermissions>,
): Promise<void> {
  try {
    console.log("[v0] updateCustomerPermissions called:", { customerUserId, permissions })

    // Build update object with only provided permissions
    const updates: any = {}

    if (permissions.can_view_orders !== undefined) updates.can_view_orders = permissions.can_view_orders
    if (permissions.can_create_orders !== undefined) updates.can_create_orders = permissions.can_create_orders
    if (permissions.can_view_balance !== undefined) updates.can_view_balance = permissions.can_view_balance
    if (permissions.can_view_products !== undefined) updates.can_view_products = permissions.can_view_products
    if (permissions.can_view_prices !== undefined) updates.can_view_prices = permissions.can_view_prices
    if (permissions.can_view_stock !== undefined) updates.can_view_stock = permissions.can_view_stock

    console.log("[v0] Updates to apply:", updates)

    if (Object.keys(updates).length > 0) {
      // Use Neon SQL template literals for each field
      await sql`
        UPDATE customer_permissions
        SET 
          can_view_orders = ${updates.can_view_orders ?? sql`can_view_orders`},
          can_create_orders = ${updates.can_create_orders ?? sql`can_create_orders`},
          can_view_balance = ${updates.can_view_balance ?? sql`can_view_balance`},
          can_view_products = ${updates.can_view_products ?? sql`can_view_products`},
          can_view_prices = ${updates.can_view_prices ?? sql`can_view_prices`},
          can_view_stock = ${updates.can_view_stock ?? sql`can_view_stock`}
        WHERE customer_user_id = ${customerUserId}
      `

      console.log("[v0] Permissions updated successfully")
    }
  } catch (error) {
    console.error("[v0] Error updating customer permissions:", error)
    throw error
  }
}

// Get all customer users for a customer
export async function getCustomerUsers(customerId: number) {
  console.log("[v0] ========== START getCustomerUsers ==========")
  console.log("[v0] getCustomerUsers called with customerId:", customerId)
  console.log("[v0] customerId type:", typeof customerId)
  console.log("[v0] customerId is valid number:", !isNaN(customerId))

  try {
    console.log("[v0] Executing SQL query...")
    const result = await sql`
      SELECT cu.id, cu.customer_id, cu.username, cu.email, cu.is_active, 
             cu.last_login, cu.created_at,
             cp.can_view_orders, cp.can_create_orders, cp.can_view_balance,
             cp.can_view_products, cp.can_view_prices, cp.can_view_stock
      FROM customer_users cu
      LEFT JOIN customer_permissions cp ON cu.id = cp.customer_user_id
      WHERE cu.customer_id = ${customerId}
      ORDER BY cu.created_at DESC
    `

    console.log("[v0] SQL query executed successfully")
    console.log("[v0] Query result row count:", result.length)
    console.log("[v0] Query result rows:", JSON.stringify(result, null, 2))
    console.log("[v0] ========== END getCustomerUsers (SUCCESS) ==========")

    return result
  } catch (error) {
    console.error("[v0] ========== ERROR in getCustomerUsers ==========")
    console.error("[v0] SQL query error:", error)
    console.error("[v0] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Toggle customer user active status
export async function toggleCustomerUserStatus(userId: number): Promise<void> {
  await sql`
    UPDATE customer_users
    SET is_active = NOT is_active
    WHERE id = ${userId}
  `
}

// Update customer user password
export async function updateCustomerPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, 10)

  await sql`
    UPDATE customer_users
    SET password_hash = ${passwordHash}
    WHERE id = ${userId}
  `
}
