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
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
            "",
          )
          const result = await client.query(query, values)
          return result.rows
        } finally {
          client.release()
        }
      }
    } else {
      sql = neon(dbUrl)
    }
  }
} catch (error) {
  console.error("[v0] Failed to initialize DB client:", error)
  sql = null
}

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    if (!sql) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`
          SELECT id, bank_code, bank_name, bank_name_en, status
          FROM banks
          WHERE status != 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      case "last":
        rows = await sql`
          SELECT id, bank_code, bank_name, bank_name_en, status
          FROM banks
          WHERE status != 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "previous":
        rows = await sql`
          SELECT id, bank_code, bank_name, bank_name_en, status
          FROM banks
          WHERE id < ${currentId || 0} AND status != 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "next":
        rows = await sql`
          SELECT id, bank_code, bank_name, bank_name_en, status
          FROM banks
          WHERE id > ${currentId || 0} AND status != 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No bank found" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error navigating banks:", error)
    return NextResponse.json({ error: "Failed to navigate banks" }, { status: 500 })
  }
}
