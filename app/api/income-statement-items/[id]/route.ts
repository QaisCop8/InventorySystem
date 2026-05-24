import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureIncomeStatementItemsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS income_statement_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureIncomeStatementItemsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data.name ?? "").trim()
    const status = Number(data.status ?? 1)

    if (!name) {
      return NextResponse.json({ error: "اسم البند مطلوب" }, { status: 400 })
    }

    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM income_statement_items
      WHERE LOWER(name) = LOWER(${name}) AND id <> ${id}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم البند موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      UPDATE income_statement_items
      SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating income statement item:", error)
    return NextResponse.json({ error: "Failed to update income statement item" }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureIncomeStatementItemsTable()

    const id = Number.parseInt(params.id, 10)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE income_statement_items
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting income statement item:", error)
    return NextResponse.json({ error: "Failed to delete income statement item" }, { status: 500 })
  }
}
