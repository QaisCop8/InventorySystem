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

export async function GET() {
  try {
    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        branch_code VARCHAR(20) UNIQUE NOT NULL,
        branch_name VARCHAR(100) NOT NULL,
        address TEXT,
        manager VARCHAR(100),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    const branches = await sql`
      SELECT * FROM branches
      ORDER BY branch_name
    `
    return NextResponse.json(branches)
  } catch (error) {
    console.error("Error fetching branches:", error)
    return NextResponse.json({ error: "Failed to fetch branches" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.branch_name || !data.branch_code) {
      return NextResponse.json({ error: "اسم الفرع ورمزه مطلوبان" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO branches (branch_code, branch_name, address, manager, phone, is_active)
      VALUES (
        ${data.branch_code},
        ${data.branch_name},
        ${data.address || ""},
        ${data.manager || ""},
        ${data.phone || ""},
        ${data.is_active !== false}
      )
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating branch:", error)
    return NextResponse.json({ error: "Failed to create branch" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف الفرع مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE branches
      SET 
        branch_name = ${data.branch_name},
        address = ${data.address || ""},
        manager = ${data.manager || ""},
        phone = ${data.phone || ""},
        is_active = ${data.is_active !== false},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating branch:", error)
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 })
  }
}

