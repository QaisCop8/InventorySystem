import { type NextRequest, NextResponse } from "next/server"
import sql from "../../../lib/database"

function getDatabaseErrorResponse() {
  return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })
}

export async function GET() {
  if (!sql) return getDatabaseErrorResponse()
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS status INTEGER NOT NULL DEFAULT 1`
    await sql`
      DO $$
      BEGIN
        ALTER TABLE cities
          ADD CONSTRAINT cities_status_check CHECK (status IN (1, 2, 3));
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END
      $$;
    `

    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    const cities = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM cities
      WHERE status != 3
      ORDER BY name
    `
    return NextResponse.json(cities)
  } catch (error) {
    console.error("Error fetching cities:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch cities",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  try {
    const data = await request.json()

    if (!data.name) {
      return NextResponse.json({ error: "اسم المدينة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cities (name, status)
      VALUES (${data.name}, ${data.status ?? 1})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating city:", error)
    return NextResponse.json({ error: "Failed to create city" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id || !data.name) {
      return NextResponse.json({ error: "معرف المدينة واسمها مطلوبان" }, { status: 400 })
    }

    const status = Number(data.status)
    const normalizedStatus = status === 2 ? 2 : status === 3 ? 3 : 1

    const result = await sql`
      UPDATE cities
      SET name = ${data.name}, status = ${normalizedStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${data.id}
      RETURNING id, name, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المدينة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating city:", error)
    return NextResponse.json({ error: "Failed to update city" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())

    if (!id) {
      return NextResponse.json({ error: "معرف المدينة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE cities
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المدينة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting city:", error)
    return NextResponse.json({ error: "Failed to delete city" }, { status: 500 })
  }
}
