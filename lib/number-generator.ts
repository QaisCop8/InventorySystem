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

async function getPrefixFromSettings(type: "customer" | "supplier" | "salesman" | "subscriber" | "item_group"): Promise<string> {
  try {
    if (!process.env.DATABASE_URL) {
      return type === "customer"
        ? "C"
        : type === "supplier"
          ? "S"
          : type === "salesman"
            ? "C"
            : type === "subscriber"
              ? "G"
              : "G"
    }

    const result = await sql`
      SELECT id, value
      FROM system_settings
      WHERE id IN (${["customer_prefix", "supplier_prefix", "salesman_prefix", "subscriber_prefix", "item_group_prefix"]})
      ORDER BY id ASC
    `

    const prefixMap = Object.fromEntries(result.map((row: any) => [row.id, row.value]))
    const prefix =
      type === "customer"
        ? prefixMap.customer_prefix
        : type === "supplier"
          ? prefixMap.supplier_prefix
          : type === "salesman"
            ? prefixMap.salesman_prefix ?? prefixMap.customer_prefix
            : type === "subscriber"
              ? prefixMap.subscriber_prefix ?? prefixMap.customer_prefix
              : prefixMap.item_group_prefix

    return String(prefix || (type === "customer" ? "C" : type === "supplier" ? "S" : type === "salesman" ? "C" : type === "subscriber" ? "G" : "G"))
  } catch (error) {
    console.error("[v0] Error fetching prefix from settings:", error)
    return type === "customer" ? "C" : type === "supplier" ? "S" : type === "salesman" ? "C" : type === "subscriber" ? "G" : "G"
  }
}

export async function generateCustomerNumber(entityTypeOrSupplier: boolean | number = false, isSalesman: boolean = false, isSubscriber: boolean = false): Promise<string> {
  const entityType = typeof entityTypeOrSupplier === "number"
    ? entityTypeOrSupplier
    : isSubscriber
      ? 4
      : isSalesman
        ? 3
        : entityTypeOrSupplier
          ? 2
          : 1

  const typeKey = entityType === 2 ? "supplier" : entityType === 3 ? "salesman" : entityType === 4 ? "subscriber" : "customer"
  const prefix = await getPrefixFromSettings(typeKey)

  return await getNextSequentialNumber(prefix, "customers", "customer_code", entityType)
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
        ORDER BY customer_code ASC
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
        ORDER BY group_code ASC
      `
    }


    let nextCode = "0000001";
    if (tableName === "orders") {
      nextCode = "000001";
    }

    if (result.length > 0) {
      const matchingCodes = result
        .map((row: any) => String(row?.code || ""))
        .filter((code: string) => code && code.startsWith(prefix))

      if (matchingCodes.length > 0) {
        const parsedNumbers = matchingCodes
          .map((code: string) => {
            const match = code.match(/^([^\d]*)(\d+)$/)
            return match ? { code, value: Number(match[2]), width: match[2].length } : null
          })
          .filter(Boolean) as Array<{ code: string; value: number; width: number }>

        if (parsedNumbers.length > 0) {
          const maxEntry = parsedNumbers.reduce((best, current) => {
            if (current.value > best.value) return current
            if (current.value === best.value && current.width > best.width) return current
            return best
          }, parsedNumbers[0])

          nextCode = adjustCodePlusOne(maxEntry.code, 8)
          console.log(`[v0] Highest matching code: ${maxEntry.code}`)
        }
      }
    } else {
      console.log("[v0] No existing codes found, starting with 1")
    }

    const finalNumber = nextCode.startsWith(prefix) ? nextCode : `${prefix}${nextCode}`
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
  return currentCode
}

function adjustCodePlusOne(code: string, codeLen = 8): string {
  if (!code || !code.trim()) return ""

  const normalizedCode = String(code).trim().toUpperCase()
  const match = normalizedCode.match(/^([^\d]*)(\d+)$/)
  if (!match) return normalizedCode

  const prefix = match[1] || ""
  const numericPart = match[2]
  const nextValue = (Number(numericPart) + 1).toString()
  const digitsLength = Math.max(1, codeLen - prefix.length)

  return `${prefix}${nextValue.padStart(digitsLength, "0")}`.slice(0, codeLen)
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
