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
      console.log("[v0] Using local PostgreSQL with pg Pool")
      const pool = new Pool({ connectionString: dbUrl })
      sql = async (strings: TemplateStringsArray, ...values: any[]) => {
        const client = await pool.connect()
        try {
          const query = strings.reduce(
            (prev, curr, i) => prev + curr + (i < values.length ? `$${i + 1}` : ""),
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

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tax_classifications (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        tax_percent DECIMAL(5,2) DEFAULT 0,
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Ensure columns exist for older deployments
    await sql`ALTER TABLE tax_classifications ADD COLUMN IF NOT EXISTS tax_percent DECIMAL(5,2) DEFAULT 0`
    await sql`ALTER TABLE tax_classifications ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

    const categories = await sql`
      SELECT id, name, tax_percent, COALESCE(NULLIF(status,0),1) AS status FROM tax_classifications WHERE COALESCE(status,1) != 3 ORDER BY id
    `

    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching tax classifications:", error)
    return NextResponse.json({ error: "Failed to fetch tax classifications" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, tax_percent = 0, status = 1 } = body

    if (!name) {
      return NextResponse.json({ error: "Tax classification name is required" }, { status: 400 })
    }

    const percent = Number(tax_percent || 0)
    if (isNaN(percent) || percent < 0 || percent > 100) {
      return NextResponse.json({ error: "tax_percent must be a number between 0 and 100" }, { status: 400 })
    }

    // If id provided -> update
    if (id) {
      const updated = await sql`
        UPDATE tax_classifications
        SET name = ${name}, tax_percent = ${tax_percent}, status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING *
      `
      return NextResponse.json({ category: updated[0] }, { status: 200 })
    }

    const existing = await sql`
      SELECT id FROM tax_classifications WHERE LOWER(name) = LOWER(${name})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "Tax classification already exists" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO tax_classifications (name, tax_percent, status)
      VALUES (${name}, ${tax_percent}, ${status})
      RETURNING *
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error creating tax classification:", error)
    return NextResponse.json({ error: "Failed to create tax classification" }, { status: 500 })
  }
}
