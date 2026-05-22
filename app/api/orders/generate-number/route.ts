
import { NextRequest, NextResponse } from "next/server"

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


export async function GET(request: NextRequest) {
  try {
    console.log("[v0] API: Starting order number generation")

    if (!process.env.DATABASE_URL) {
      console.error("[v0] API: DATABASE_URL not found")
      return NextResponse.json({ error: "DATABASE_URL environment variable is not set" }, { status: 500 })
    }
    const { searchParams } = new URL(request.url);
    const vch_book = searchParams.get("vch_book") ?? "0";
    const vch_type = Number(searchParams.get("vch_type") ?? 1);

    
   

    const prefix = vch_type === 1 ? "O" + vch_book : "T" + vch_book

    // Compute from the true max numeric suffix for this prefix.
    const result = await sql`
      SELECT COALESCE(MAX(
        CAST(NULLIF(regexp_replace(SUBSTRING(order_number FROM ${prefix.length + 1}), '[^0-9]', '', 'g'), '') AS INTEGER)
      ), 0) AS max_number
      FROM orders
      WHERE order_number LIKE ${prefix + "%"}
    `

    console.log("[v0] API: Query result:", result)

    const maxNumber = Number(result?.[0]?.max_number ?? 0)
    const nextNumber = Number.isFinite(maxNumber) ? maxNumber + 1 : 1
    const paddedNumber = nextNumber.toString().padStart(6, "0")
    const orderNumber = `${prefix}${paddedNumber}`

    return NextResponse.json({
      orderNumber,
      autoNumbering: true,
      prefix,
    })
  } catch (error) {
    console.error("[v0] API: Error generating sales order number:", error)

    const catchParams = new URL(request.url).searchParams
    const fallbackBook = catchParams.get("vch_book") ?? "0"
    const fallbackType = Number(catchParams.get("vch_type") ?? 1)
    const fallbackPrefix = fallbackType === 1 ? `O${fallbackBook}` : `T${fallbackBook}`
    const fallbackNumber = `${fallbackPrefix}000001`

    console.log("[v0] API: Using fallback number:", fallbackNumber)

    return NextResponse.json({
      orderNumber: fallbackNumber,
      autoNumbering: true,
      warning: "Generated fallback number due to database error",
    })
  }
}
