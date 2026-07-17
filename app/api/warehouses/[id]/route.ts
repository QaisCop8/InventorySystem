import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
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

async function ensureWarehousesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS warehouses (
      id SERIAL PRIMARY KEY,
      warehouse_code VARCHAR(10) UNIQUE NOT NULL,
      warehouse_name VARCHAR(100) NOT NULL,
      warehouse_name_en VARCHAR(100),
      description TEXT,
      location VARCHAR(200),
      is_active BOOLEAN DEFAULT true,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureWarehousesTable()

    const id = Number(params.id)
    const data = await request.json()
    const status = Number(data.status ?? 1)
    const isActive = status === 1

    const result = await sql`
      UPDATE warehouses
      SET
        warehouse_code = ${data.warehouse_code},
        warehouse_name = ${data.warehouse_name},
        warehouse_name_en = ${data.warehouse_name_en || ""},
        description = ${data.description || ""},
        location = ${data.location || ""},
        is_active = ${isActive},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating warehouse:", error)
    return NextResponse.json({ error: "Failed to update warehouse" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureWarehousesTable()

    const id = Number(params.id)
    const result = await sql`
      UPDATE warehouses
      SET status = 3, is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting warehouse:", error)
    return NextResponse.json({ error: "Failed to delete warehouse" }, { status: 500 })
  }
}

