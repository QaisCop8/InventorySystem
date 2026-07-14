import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureBalanceSheetLiabilitiesItemsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS balance_sheet_liabilities_items (
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
    await ensureBalanceSheetLiabilitiesItemsTable()

    const items = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM balance_sheet_liabilities_items
      WHERE status IN (1, 2)
      ORDER BY id ASC
    `

    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching balance sheet liabilities items:", error)
    return NextResponse.json({ error: "Failed to fetch balance sheet liabilities items" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureBalanceSheetLiabilitiesItemsTable()

    const data = await request.json()

    if (!data.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "اسم البند مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const existing = await sql`
      SELECT id FROM balance_sheet_liabilities_items WHERE LOWER(name) = LOWER(${String(data.name).trim()})
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "اسم البند موجود مسبقاً" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO balance_sheet_liabilities_items (name, status)
      VALUES (${String(data.name).trim()}, ${status})
      RETURNING id, name, status, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating balance sheet liabilities item:", error)
    return NextResponse.json({ error: "Failed to create balance sheet liabilities item" }, { status: 500 })
  }
}

