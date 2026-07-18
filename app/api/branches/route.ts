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

export async function GET(request: NextRequest) {
  try {
    // Create table if not exists and migrate existing schema if necessary
    await sql`
      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        branch_code VARCHAR(20) UNIQUE NOT NULL,
        branch_name VARCHAR(100) NOT NULL,
        bank_id INTEGER,
        address TEXT,
        manager VARCHAR(100),
        phone VARCHAR(20),
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS bank_id INTEGER`
    await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

    const { searchParams } = new URL(request.url)
    const bankIdParam = searchParams.get("bank_id")
    const bankId = bankIdParam ? Number(bankIdParam) : undefined

    const branches = bankId !== undefined && !Number.isNaN(bankId)
      ? await sql`
          SELECT id, branch_code, branch_name, bank_id, address, manager, phone, status
          FROM branches
          WHERE status != 3 AND bank_id = ${bankId}
          ORDER BY branch_name
        `
      : await sql`
          SELECT id, branch_code, branch_name, bank_id, address, manager, phone, status
          FROM branches
          WHERE status != 3
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
      INSERT INTO branches (branch_code, branch_name, bank_id, address, manager, phone, status)
      VALUES (
        ${data.branch_code},
        ${data.branch_name},
        ${data.bank_id || null},
        ${data.address || ""},
        ${data.manager || ""},
        ${data.phone || ""},
        ${Number(data.status || 1)}
      )
      RETURNING id, branch_code, branch_name, bank_id, address, manager, phone, status
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

    if (!data.branch_code || String(data.branch_code).trim().length > 4) {
      return NextResponse.json({ error: "رمز الفرع يجب أن يتكون من 1 إلى 4 أحرف" }, { status: 400 })
    }

    const result = await sql`
      UPDATE branches
      SET 
        branch_code = ${String(data.branch_code).trim()},
        branch_name = ${data.branch_name},
        bank_id = ${data.bank_id || null},
        address = ${data.address || ""},
        manager = ${data.manager || ""},
        phone = ${data.phone || ""},
        status = ${Number(data.status || 1)},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING id, branch_code, branch_name, bank_id, address, manager, phone, status
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

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف الفرع مطلوب" }, { status: 400 })
    }

    const result = await sql`
      DELETE FROM branches
      WHERE id = ${data.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting branch:", error)
    return NextResponse.json({ error: "Failed to delete branch" }, { status: 500 })
  }
}
