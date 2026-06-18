import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureAccountClassificationTypesTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS account_classification_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT account_classification_types_name_unique UNIQUE (name)
    )
  `
}

export async function GET() {
  try {
    await ensureAccountClassificationTypesTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM account_classification_types
      WHERE status IN (1, 2)
      ORDER BY id ASC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching account classification types:", error)
    return NextResponse.json({ error: "Failed to fetch account classification types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAccountClassificationTypesTable()

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم النوع مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM account_classification_types WHERE LOWER(name) = LOWER(${name})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم النوع موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO account_classification_types (name, status)
      VALUES (${name}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating account classification type:", error)
    return NextResponse.json({ error: "Failed to create account classification type" }, { status: 500 })
  }
}
