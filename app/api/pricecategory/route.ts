import { type NextRequest, NextResponse } from "next/server"
import sql from "../../../lib/database"

function getDatabaseErrorResponse() {
  return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })
}

// ✅ Named export for GET
export async function GET() {
  if (!sql) return getDatabaseErrorResponse()
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS pricecategory (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        name_en VARCHAR(50),
        description TEXT,
        status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
    await sql`
      DO $$
      BEGIN
        ALTER TABLE pricecategory
          ADD CONSTRAINT pricecategory_status_check CHECK (status IN (1, 2, 3));
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END
      $$;
    `

    await sql`UPDATE pricecategory SET status = 1 WHERE status IS NULL`

    const prices = await sql`
      SELECT 
        id,
        name,
        name_en,
        description,
        COALESCE(status, 1) AS status,
        created_at,
        updated_at
      FROM pricecategory
      WHERE COALESCE(status, 1) != 3
      ORDER BY id
    `

    return NextResponse.json(prices)
  } catch (error) {
    console.error("Error fetching price categories:", error)
    return NextResponse.json({ error: "Failed to fetch price categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  try {
    const data = await request.json()

    if (!data.name) {
      return NextResponse.json({ error: "اسم الفئة مطلوب" }, { status: 400 })
    }

    const existingprice = await sql`
      SELECT id FROM pricecategory WHERE name = ${data.name}
    `

    if (existingprice.length > 0) {
      return NextResponse.json({ error: "اسم الفئة موجود مسبقاً" }, { status: 400 })
    }

    if (!data.name_en || data.name_en.trim() === "") {
      data.name_en = data.name
    }

    const status = Number(data.status)
    const normalizedStatus = status === 2 ? 2 : status === 3 ? 3 : 1

    const result = await sql`
      INSERT INTO pricecategory (
        name, name_en, description, status
      ) VALUES ( 
        ${data.name}, 
        ${data.name_en || ""}, 
        ${data.description || ""}, 
        ${normalizedStatus}
      ) RETURNING id, name, name_en, description, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating price category:", error)
    return NextResponse.json({ error: "Failed to create price category" }, { status: 500 })
  }
}
