import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { Pool } from "pg"

let sql: any = null

try {
  if (!process.env.DATABASE_URL) {
    console.error("[v0] DATABASE_URL environment variable is not set")
  } else {
    const dbUrl = process.env.DATABASE_URL

    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
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

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || '1' // default to customer (1), supplier (2)

    if (!code) {
      console.log("[v0] Missing customer code")
      return NextResponse.json({ error: "رمز العميل مطلوب" }, { status: 400 })
    }

    console.log("[v0] Fetching customer with code:", code, "type:", type)

    const result = await sql`
      SELECT * FROM customers 
      WHERE customer_code = ${code} 
      AND type = ${type} 
      AND isDeleted = false
    `

    if (result.length === 0) {
      console.log("[v0] Customer not found with code:", code)
      return NextResponse.json({ found: false, message: "العميل غير موجود" }, { status: 404 })
    }

    console.log("[v0] Customer fetched successfully:", result[0])

    return NextResponse.json({ found: true, customer: result[0] })
  } catch (error) {
    console.error("[v0] Error fetching customer by code:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء البحث عن العميل" }, { status: 500 })
  }
}