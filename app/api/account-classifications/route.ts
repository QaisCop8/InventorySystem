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

export async function GET() {
  try {
    await ensureAccountClassificationsTable()

    const items = await sql`
      SELECT
        a.id,
        a.name,
        a.classification_type_id,
        t.name AS classification_type_name,
        a.status,
        a.created_at,
        a.updated_at
      FROM account_classifications a
      JOIN account_classification_types t ON t.id = a.classification_type_id
      WHERE a.status IN (1, 2)
      ORDER BY a.id DESC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching account classifications:", error)
    return NextResponse.json({ error: "Failed to fetch account classifications" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountClassificationsTable()

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
      SELECT id FROM account_classifications WHERE LOWER(name) = LOWER(${name})
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
      INSERT INTO account_classifications (name, classification_type_id, status)
      VALUES (${name}, ${classificationTypeId}, ${status})
      RETURNING id, name, classification_type_id, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating account classification:", error)
    return NextResponse.json({ error: "Failed to create account classification" }, { status: 500 })
  }
}
