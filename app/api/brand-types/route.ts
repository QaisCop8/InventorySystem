import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureBrandTypesTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS brand_types (
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
    await ensureBrandTypesTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM brand_types
      WHERE status IN (1, 2)
      ORDER BY id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching brand types:", error)
    return NextResponse.json({ error: "Failed to fetch brand types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureBrandTypesTable()

    const data = await request.json()

    if (!data.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM brand_types WHERE LOWER(name) = LOWER(${String(data.name).trim()})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO brand_types (name, status)
      VALUES (${String(data.name).trim()}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating brand type:", error)
    return NextResponse.json({ error: "Failed to create brand type" }, { status: 500 })
  }
}
