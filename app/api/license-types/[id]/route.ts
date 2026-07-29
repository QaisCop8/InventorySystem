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

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await ensureLicenseTypesTable()

    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف نوع الرخصة غير صالح" }, { status: 400 })
    }

    const body = await request.json()
    const { status = 1 } = body
    const name = String(body.name || "").trim().slice(0, 30)

    if (!name) {
      return NextResponse.json({ error: "اسم نوع الرخصة مطلوب" }, { status: 400 })
    }

    const duplicate = await sql`
      SELECT id FROM license_types
      WHERE LOWER(TRIM(name)) = LOWER(${name}) AND COALESCE(status, 1) <> 3 AND id <> ${id}
      LIMIT 1
    `

    if (duplicate.length > 0) {
      return NextResponse.json({ error: "اسم نوع الرخصة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const updated = await sql`
      UPDATE license_types
      SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, status
    `

    if (updated.length === 0) {
      return NextResponse.json({ error: "نوع الرخصة غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ category: updated[0] })
  } catch (error) {
    console.error("Error updating license type:", error)
    return NextResponse.json({ error: "Failed to update license type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!sql) return NextResponse.json({ error: "Database not initialized" }, { status: 500 })

  try {
    await ensureLicenseTypesTable()

    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف نوع الرخصة غير صالح" }, { status: 400 })
    }

    const deleted = await sql`
      UPDATE license_types
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (deleted.length === 0) {
      return NextResponse.json({ error: "نوع الرخصة غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true, id: deleted[0]?.id })
  } catch (error) {
    console.error("Error deleting license type:", error)
    return NextResponse.json({ error: "Failed to delete license type" }, { status: 500 })
  }
}
