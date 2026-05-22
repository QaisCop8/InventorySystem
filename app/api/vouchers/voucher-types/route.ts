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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
export async function GET(request: NextRequest) {
  
  try {
    const query = `
      SELECT id, name, status
       FROM voucher_types
       WHERE status = 1
       ORDER BY id`
    ;

  const result = await pool.query(query);
  return NextResponse.json(result.rows)
  } catch (err: any) {
    console.error("voucher-types error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
