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
      CREATE TABLE IF NOT EXISTS banks (
        id SERIAL PRIMARY KEY,
        bank_code VARCHAR(10) UNIQUE NOT NULL,
        bank_name VARCHAR(100) NOT NULL,
        bank_name_en VARCHAR(100),
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    const banks = await sql`
      SELECT id, bank_code, bank_name, bank_name_en, status, created_at, updated_at
      FROM banks
      WHERE status != 3
      ORDER BY id
    `

    return NextResponse.json(banks)
  } catch (error) {
    console.error("Error fetching banks:", error)
    return NextResponse.json({ error: "Failed to fetch banks" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.bank_code || !data.bank_name) {
      return NextResponse.json({ error: "رمز البنك واسم البنك مطلوبان" }, { status: 400 })
    }

    const existingBank = await sql`
      SELECT id FROM banks WHERE bank_code = ${data.bank_code}
    `

    if (existingBank.length > 0) {
      return NextResponse.json({ error: "رمز البنك موجود مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    const result = await sql`
      INSERT INTO banks (bank_code, bank_name, bank_name_en, status)
      VALUES (${data.bank_code}, ${data.bank_name}, ${data.bank_name_en || ""}, ${status})
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating bank:", error)
    return NextResponse.json({ error: "Failed to create bank" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف البنك مطلوب" }, { status: 400 })
    }

    if (!data.bank_code || String(data.bank_code).trim().length > 4) {
      return NextResponse.json({ error: "رمز البنك يجب أن يتكون من 1 إلى 4 أحرف" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)

    if (status === 3) {
      await sql`
        CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          branch_code VARCHAR(20),
          branch_name VARCHAR(100),
          bank_id INTEGER,
          status INTEGER DEFAULT 1
        )
      `

      await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS bank_id INTEGER`
      await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

      const linkedBranches = await sql`
        SELECT id
        FROM branches
        WHERE bank_id = ${data.id}
          AND status != 3
        LIMIT 1
      `

      if (linkedBranches.length > 0) {
        return NextResponse.json(
          { error: "يوجد فروع مرتبطة مع البنك لا يمكن حذفه" },
          { status: 409 },
        )
      }
    }

    const result = await sql`
      UPDATE banks
      SET
        bank_code = ${String(data.bank_code).trim()},
        bank_name = ${data.bank_name},
        bank_name_en = ${data.bank_name_en || ""},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating bank:", error)
    return NextResponse.json({ error: "Failed to update bank" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id) {
      return NextResponse.json({ error: "معرف البنك مطلوب" }, { status: 400 })
    }

    const result = await sql`
      DELETE FROM banks
      WHERE id = ${data.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البنك غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting bank:", error)
    return NextResponse.json({ error: "Failed to delete bank" }, { status: 500 })
  }
}
