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
    const bankId = request.nextUrl.searchParams.get("bankId")

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id ASC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3
              ORDER BY id ASC
              LIMIT 1
            `
        break
      case "last":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id DESC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3
              ORDER BY id DESC
              LIMIT 1
            `
        break
      case "previous":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id < ${currentId || 0} AND status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id DESC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id < ${currentId || 0} AND status != 3
              ORDER BY id DESC
              LIMIT 1
            `
        break
      case "next":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id > ${currentId || 0} AND status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id ASC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id > ${currentId || 0} AND status != 3
              ORDER BY id ASC
              LIMIT 1
            `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No branch found" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error navigating branches:", error)
    return NextResponse.json({ error: "Failed to navigate branches" }, { status: 500 })
  }
}
