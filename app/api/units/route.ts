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
      console.log("[v0] Using local PostgreSQL with pg Pool")
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

export async function GET() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        unit_code VARCHAR(10) UNIQUE NOT NULL,
        unit_name VARCHAR(50) NOT NULL,
        unit_name_en VARCHAR(50),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE units ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`

    const existingUnits = await sql`SELECT COUNT(*) as count FROM units`

    if (existingUnits[0].count === 0) {
      const defaultUnits = [
        { code: "PCS", name: "قطعة", name_en: "Piece" },
        { code: "KG", name: "كيلو", name_en: "Kilogram" },
        { code: "G", name: "جرام", name_en: "Gram" },
        { code: "L", name: "لتر", name_en: "Liter" },
        { code: "M", name: "متر", name_en: "Meter" },
        { code: "BOX", name: "صندوق", name_en: "Box" },
        { code: "CTN", name: "كرتون", name_en: "Carton" },
        { code: "CAN", name: "علبة", name_en: "Can" },
        { code: "BTL", name: "زجاجة", name_en: "Bottle" },
        { code: "BAG", name: "كيس", name_en: "Bag" },
        { code: "PKT", name: "باكيت", name_en: "Packet" },
        { code: "SET", name: "طقم", name_en: "Set" },
        { code: "ROLL", name: "لفة", name_en: "Roll" },
        { code: "SHEET", name: "ورقة", name_en: "Sheet" },
        { code: "PAIR", name: "زوج", name_en: "Pair" },
      ]

      for (const unit of defaultUnits) {
        await sql`
          INSERT INTO units (unit_code, unit_name, unit_name_en, is_active, status)
          VALUES (${unit.code}, ${unit.name}, ${unit.name_en}, true, 1)
        `
      }
    }

    const units = await sql`
      SELECT 
        id,
        unit_name,
        unit_name_en,
        description,
        is_active,
        status,
        created_at,
        updated_at
      FROM units
      WHERE status != 3
      ORDER BY unit_name
    `

    return NextResponse.json(units)
  } catch (error) {
    console.error("Error fetching units:", error)
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.unit_name) {
      return NextResponse.json({ error: "اسم الوحدة مطلوب" }, { status: 400 })
    }

    const existingUnit = await sql`
      SELECT id FROM units WHERE unit_name = ${data.unit_name}
    `

    if (existingUnit.length > 0) {
      return NextResponse.json({ error: "اسم الوحدة موجود مسبقاً" }, { status: 400 })
    }

    if (data.unit_name_e === "" || data.unit_name_e === undefined) data.unit_name_en = data.unit_name
    const newStatus = Number(data.status ?? 1)

    const result = await sql`
      INSERT INTO units (
        unit_name, unit_name_en, description, is_active, status
      ) VALUES ( 
        ${data.unit_name}, 
        ${data.unit_name_en || ""}, 
        ${data.description || ""}, 
        ${newStatus === 1}, 
        ${newStatus}
      ) RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating unit:", error)
    return NextResponse.json({ error: "Failed to create unit" }, { status: 500 })
  }
}
