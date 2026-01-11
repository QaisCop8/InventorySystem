/**
 * Utility functions for generating standardized entity numbers
 * All numbers are 8 characters: PREFIX + 7 digits (padded with zeros)
 */

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

export default sql

async function getPrefixFromSettings(type: "customer" | "supplier" | "item_group"): Promise<string> {
  try {
    if (!process.env.DATABASE_URL) {
      // Return default prefixes if database is not available
      return type === "customer" ? "C" : type === "supplier" ? "S" : "G"
    }

    //const sql = neon(process.env.DATABASE_URL)
    
    const result = await sql`
      SELECT customer_prefix, supplier_prefix, item_group_prefix 
      FROM system_settings 
      LIMIT 1
    `

    if (result.length > 0) {
      const prefix =
        type === "customer"
          ? result[0].customer_prefix
          : type === "supplier"
            ? result[0].supplier_prefix
            : result[0].item_group_prefix
      return prefix || (type === "customer" ? "C" : type === "supplier" ? "S" : "G")
    }

    // Return default if no settings found
    return type === "customer" ? "C" : type === "supplier" ? "S" : "G"
  } catch (error) {
    console.error("[v0] Error fetching prefix from settings:", error)
    // Return default prefix on error
    return type === "customer" ? "C" : type === "supplier" ? "S" : "G"
  }
}

export async function generateCustomerNumber(isSupplier: boolean = false): Promise<string> {
  // Use different prefixes based on type
  const typeKey = isSupplier ? "supplier" : "customer";
  const prefix = await getPrefixFromSettings(typeKey);

  // Table is still "customers", column is "customer_code"
  return await getNextSequentialNumber(prefix, "customers", "customer_code",isSupplier ? 2:1);
}


export async function generateSupplierNumber(): Promise<string> {
  const prefix = await getPrefixFromSettings("supplier")
  return await getNextSequentialNumber(prefix, "suppliers", "supplier_code")
}

export async function generateSalesOrderNumber(
  vchBook: string
): Promise<string> {
  return await getNextSequentialNumber("O"+vchBook, "orders", "order_number");
}

export async function generatePurchaseOrderNumber(
  vchBook: string
): Promise<string> {
  return await getNextSequentialNumber("T"+vchBook, "orders", "order_number");
}


export async function generateItemGroupNumber(): Promise<string> {
  const prefix = await getPrefixFromSettings("item_group")
  return await getNextSequentialNumber(prefix, "item_groups", "group_code")
}

// Helper function to validate number format
export function validateNumberFormat(number: string, prefix: string): boolean {
  const regex = new RegExp(`^${prefix}\\d{7}$`)
  return regex.test(number)
}

async function getNextSequentialNumber(prefix: string, tableName: string, columnName: string,type?:number): Promise<string> {
  try {

    if (!process.env.DATABASE_URL) {
      
      throw new Error("DATABASE_URL environment variable is not set")
    }


    let result: any[] = []

    // Use proper SQL template literals based on table name
    if (tableName === "customers") {
      console.log("[v0] Querying customers table...")
      console.log("[v0] Query: SELECT customer_code FROM customers WHERE customer_code LIKE", prefix + "%")
      result = await sql`
        SELECT customer_code as code 
        FROM customers 
        WHERE customer_code LIKE ${prefix + "%"} 
        AND TYPE= ${type}
        ORDER BY customer_code DESC 
        LIMIT 1
      `
      console.log("[v0] Customers query completed")
    } else if (tableName === "suppliers") {
      console.log("[v0] Querying suppliers table...")
      result = await sql`
        SELECT supplier_code as code 
        FROM suppliers 
        WHERE supplier_code LIKE ${prefix + "%"} 
        ORDER BY supplier_code DESC 
        LIMIT 1
      `
      console.log("[v0] Suppliers query completed")
    } else if (tableName === "orders") {
      result = await sql`
        SELECT order_number as code 
        FROM orders 
        WHERE order_number LIKE ${prefix + "%"} 
        ORDER BY order_number DESC 
        LIMIT 1
      `
      console.log("[v0] Sales orders query completed")
    } else if (tableName === "purchase_orders") {
      console.log("[v0] Querying purchase_orders table...")
      result = await sql`
        SELECT order_number as code 
        FROM orders 
        WHERE order_number LIKE ${prefix + "%"} 
        ORDER BY order_number DESC 
        LIMIT 1
      `
      console.log("[v0] Purchase orders query completed")
    } else if (tableName === "item_groups") {
      console.log("[v0] Querying item_groups table...")
      result = await sql`
        SELECT group_code as code 
        FROM item_groups 
        WHERE group_code LIKE ${prefix + "%"} 
        ORDER BY group_code DESC 
        LIMIT 1
      `
    }


    let nextNumber = 1
    let nextCode = "0000001";
    if(tableName === "orders")
      nextCode = "000001";
    if (result.length > 0 && result[0].code) {
      // Extract the numeric part and increment
      const currentCode = result[0].code as string
      console.log(`[v0] Found existing code: ${currentCode}`)
      let numericPart = currentCode.substring(1) // Remove prefix
      if(tableName === "orders")
        numericPart = currentCode.substring(2)
      console.log(`[v0] Numeric part: ${numericPart}`)
      nextCode = getNextCode(numericPart);

      console.log(`[v0] Next number will be: ${nextNumber}`)
    } else {
      console.log("[v0] No existing codes found, starting with 1")
      if (tableName === "sales_orders") {
        nextNumber = 1
      }
    }

    // Format as 7-digit padded number with prefix
    //const paddedNumber = nextNumber.toString().padStart(7, "0")
    const finalNumber = `${prefix}${nextCode}`
    console.log(`[v0] Generated final number: ${finalNumber}`)
    console.log(`[v0] ========== END getNextSequentialNumber (SUCCESS) ==========`)

    return finalNumber
  } catch (error) {
    console.error("[v0] ========== ERROR in getNextSequentialNumber ==========")
    console.error("[v0] Error generating sequential number:", error)
    console.error("[v0] Error type:", error instanceof Error ? error.constructor.name : typeof error)
    console.error("[v0] Error message:", error instanceof Error ? error.message : String(error))
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : undefined)

    if (error instanceof Error) {
      if (error.message.includes("DATABASE_URL")) {
        throw new Error("Database configuration error: " + error.message)
      } else if (error.message.includes("connect")) {
        throw new Error("Database connection failed: " + error.message)
      } else {
        throw new Error("Database query failed: " + error.message)
      }
    }

    // Return proper starting number as fallback
    console.log("[v0] Returning fallback number due to error")
    return `${prefix}0000001`
  }
}

function getNextCode(currentCode: string) {
  // Separate prefix (non-digits) and numeric part
  const match = currentCode.match(/^([^\d]*)(\d+)$/);
  if (!match) return currentCode; // fallback if no number found

  const prefix = match[1];       // e.g., "RB"
  const numberPart = match[2];   // e.g., "010"

  // Increment number and preserve leading zeros
  const nextNumber = (parseInt(numberPart, 10) + 1).toString().padStart(numberPart.length, "0");

  return prefix + nextNumber;     // e.g., "RB011"
}


// Legacy functions for backward compatibility
export function generateCustomerNumberSync(): string {
  const timestamp = Date.now().toString()
  const lastSeven = timestamp.slice(-7).padStart(7, "0")
  return `C${lastSeven}`
}

export function generateSupplierNumberSync(): string {
  const timestamp = Date.now().toString()
  const lastSeven = timestamp.slice(-7).padStart(7, "0")
  return `S${lastSeven}`
}
