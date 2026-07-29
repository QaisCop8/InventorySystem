import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureLicenseTypesTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS license_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(30) NOT NULL UNIQUE,
      status INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
  await sql`ALTER TABLE license_types ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1`
}

export async function GET() {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await ensureLicenseTypesTable()

    const categories = await sql`
      SELECT id, name, COALESCE(NULLIF(status, 0), 1) AS status
      FROM license_types
      WHERE COALESCE(status, 1) <> 3
      ORDER BY id
    `

    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching license types:", error)
    return NextResponse.json({ error: "Failed to fetch license types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await ensureLicenseTypesTable()

    const body = await request.json()
    const { id, status = 1 } = body
    const name = String(body.name || "").trim().slice(0, 30)

    if (!name) {
      return NextResponse.json({ error: "اسم نوع الرخصة مطلوب" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM license_types
      WHERE LOWER(TRIM(name)) = LOWER(${name})
        AND COALESCE(status, 1) <> 3
        AND (${id ?? 0} = 0 OR id <> ${id ?? 0})
      LIMIT 1
    `

    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم نوع الرخصة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    if (id) {
      const updated = await sql`
        UPDATE license_types
        SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
        RETURNING id, name, status
      `

      if (updated.length === 0) {
        return NextResponse.json({ error: "نوع الرخصة غير موجود" }, { status: 404 })
      }

      return NextResponse.json({ category: updated[0] }, { status: 200 })
    }

    const result = await sql`
      INSERT INTO license_types (name, status)
      VALUES (${name}, ${status})
      RETURNING id, name, status
    `

    return NextResponse.json({ category: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error saving license type:", error)
    return NextResponse.json({ error: "Failed to save license type" }, { status: 500 })
  }
}
