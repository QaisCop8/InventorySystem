import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureAccountClassificationsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_classifications (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      classification_type_id INTEGER NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT account_classifications_name_unique UNIQUE (name),
      CONSTRAINT account_classifications_type_fk
        FOREIGN KEY (classification_type_id) REFERENCES account_classification_types(id)
    )
  `
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountClassificationsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const classificationTypeId = Number(data.classification_type_id)
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم التصنيف مطلوب" }, { status: 400 })
    }

    if (!Number.isInteger(classificationTypeId)) {
      return NextResponse.json({ error: "نوع التصنيف مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM account_classifications
      WHERE LOWER(name) = LOWER(${name}) AND id <> ${id}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم التصنيف موجود مسبقاً" }, { status: 400 })
    }

    const typeExists = await sql`
      SELECT id FROM account_classification_types WHERE id = ${classificationTypeId}
    `

    if (typeExists.length === 0) {
      return NextResponse.json({ error: "نوع التصنيف غير موجود" }, { status: 400 })
    }

    const result = await sql`
      UPDATE account_classifications
      SET
        name = ${name},
        classification_type_id = ${classificationTypeId},
        status = ${status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, classification_type_id, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "التصنيف غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating account classification:", error)
    return NextResponse.json({ error: "Failed to update account classification" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureAccountClassificationsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE account_classifications
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "التصنيف غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting account classification:", error)
    return NextResponse.json({ error: "Failed to delete account classification" }, { status: 500 })
  }
}
