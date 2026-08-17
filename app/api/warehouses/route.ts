import { type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import sql from "@/lib/database"
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
      ORDER BY warehouse_code ASC
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

    if (!data.warehouse_name) {
      return NextResponse.json({ error: "اسم المستودع مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    const result = await sql`
      WITH next_warehouse AS (
        SELECT nextval(pg_get_serial_sequence('warehouses', 'id')) AS id
      )
      INSERT INTO warehouses (
        id, warehouse_code, warehouse_name, warehouse_name_en, description, location, is_active, status
      ) SELECT
        id,
        LPAD(id::text, 4, '0'),
        ${data.warehouse_name}, 
        ${data.warehouse_name_en || ""}, 
        ${data.description || ""}, 
        ${data.location || ""}, 
        ${status === 1},
        ${status}
      FROM next_warehouse
      RETURNING *
    `

    return NextResponse.json({ ...result[0], name: result[0].warehouse_name }, { status: 201 })
  } catch (error) {
    console.error("Error creating warehouse:", error)
    return NextResponse.json({ error: "Failed to create warehouse" }, { status: 500 })
  }
}
