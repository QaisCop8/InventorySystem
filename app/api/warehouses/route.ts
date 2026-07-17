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

type Warehouse = {
  id: number
  warehouse_code: string
  warehouse_name: string
  warehouse_name_en?: string
  description?: string
  location?: string
  is_active: boolean
  status: number
  created_at: string
  updated_at: string
}

export async function GET() {
  try {
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

    const existingWarehouses = await sql`SELECT COUNT(*) as count FROM warehouses`

    if (existingWarehouses[0].count === 0) {
      const defaultWarehouses = [
        { code: "MAIN", name: "المستودع الرئيسي", name_en: "Main Warehouse", location: "المبنى الرئيسي" },
        { code: "SALES", name: "مستودع المبيعات", name_en: "Sales Warehouse", location: "قسم المبيعات" },
        { code: "PROD", name: "مستودع الإنتاج", name_en: "Production Warehouse", location: "قسم الإنتاج" },
        { code: "DMGD", name: "مستودع التالف", name_en: "Damaged Warehouse", location: "منطقة التالف" },
        { code: "RETN", name: "مستودع الإرجاع", name_en: "Return Warehouse", location: "منطقة الإرجاع" },
      ]

      for (const warehouse of defaultWarehouses) {
        await sql`
          INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_name_en, location, is_active, status)
          VALUES (${warehouse.code}, ${warehouse.name}, ${warehouse.name_en}, ${warehouse.location}, true, 1)
        `
      }
    }

    const warehouses = await sql`
      SELECT 
        id,
        warehouse_code,
        warehouse_name,
        warehouse_name_en,
        description,
        location,
        is_active,
        status,
        created_at,
        updated_at
      FROM warehouses
      WHERE status != 3
      ORDER BY id
    `

    return NextResponse.json(warehouses.map((w: Warehouse) => ({ ...w, name: w.warehouse_name })))
  } catch (error) {
    console.error("Error fetching warehouses:", error)
    return NextResponse.json({ error: "Failed to fetch warehouses" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.warehouse_name || !data.warehouse_code) {
      return NextResponse.json({ error: "اسم المستودع ورمزه مطلوبان" }, { status: 400 })
    }

    const existingWarehouse = await sql`
      SELECT id FROM warehouses WHERE warehouse_code = ${data.warehouse_code}
    `

    if (existingWarehouse.length > 0) {
      return NextResponse.json({ error: "رمز المستودع موجود مسبقاً" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    const result = await sql`
      INSERT INTO warehouses (
        warehouse_code, warehouse_name, warehouse_name_en, description, location, is_active, status
      ) VALUES (
        ${data.warehouse_code}, 
        ${data.warehouse_name}, 
        ${data.warehouse_name_en || ""}, 
        ${data.description || ""}, 
        ${data.location || ""}, 
        ${status === 1},
        ${status}
      ) RETURNING *
    `

    return NextResponse.json({ ...result[0], name: result[0].warehouse_name }, { status: 201 })
  } catch (error) {
    console.error("Error creating warehouse:", error)
    return NextResponse.json({ error: "Failed to create warehouse" }, { status: 500 })
  }
}
