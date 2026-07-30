import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureBrandsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      brand_type_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT brands_brand_type_fk FOREIGN KEY (brand_type_id) REFERENCES brand_types(id),
      CONSTRAINT brands_name_unique UNIQUE (name)
    )
  `
}

export async function GET() {
  try {
    await ensureBrandsTable()

    const items = await sql`
      SELECT
        b.id,
        b.name,
        b.brand_type_id,
        t.name AS brand_type_name,
        b.status,
        b.created_at,
        b.updated_at
      FROM brands b
      JOIN brand_types t ON t.id = b.brand_type_id
      WHERE b.status IN (1, 2)
      ORDER BY b.id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching brands:", error)
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureBrandsTable()

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const brandTypeId = Number(data.brand_type_id)
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم العلامة التجارية مطلوب" }, { status: 400 })
    }
    if (!Number.isInteger(brandTypeId)) {
      return NextResponse.json({ error: "نوع العلامة التجارية مطلوب" }, { status: 400 })
    }
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM brands WHERE LOWER(name) = LOWER(${name})
    `
    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم العلامة التجارية موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`
      SELECT id FROM brand_types WHERE id = ${brandTypeId}
    `
    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع العلامة التجارية غير موجود" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO brands (name, brand_type_id, status)
      VALUES (${name}, ${brandTypeId}, ${status})
      RETURNING id, name, brand_type_id, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating brand:", error)
    return NextResponse.json({ error: "Failed to create brand" }, { status: 500 })
  }
}
