import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureCostCenterTypesTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_center_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET() {
  try {
    await ensureCostCenterTypesTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM cost_center_types
      WHERE status IN (1, 2)
      ORDER BY id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching cost center types:", error)
    return NextResponse.json({ error: "Failed to fetch cost center types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCostCenterTypesTable()

    const data = await request.json()

    if (!data.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM cost_center_types WHERE LOWER(name) = LOWER(${String(data.name).trim()})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cost_center_types (name, status)
      VALUES (${String(data.name).trim()}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating cost center type:", error)
    return NextResponse.json({ error: "Failed to create cost center type" }, { status: 500 })
  }
}
