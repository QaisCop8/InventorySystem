import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureBalanceSheetAssetsItemsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS balance_sheet_assets_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      status INTEGER NOT NULL DEFAULT 1 CHECK (status IN (1, 2, 3)),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureBalanceSheetAssetsItemsTable()

    const itemId = Number(params.id)
    if (!itemId) {
      return NextResponse.json({ error: "معرف البند غير صالح" }, { status: 400 })
    }

    const result = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM balance_sheet_assets_items
      WHERE id = ${itemId}
    `

    if (!result.length) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error fetching balance sheet asset item:", error)
    return NextResponse.json({ error: "فشل في جلب البند" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureBalanceSheetAssetsItemsTable()

    const itemId = Number(params.id)
    if (!itemId) {
      return NextResponse.json({ error: "معرف البند غير صالح" }, { status: 400 })
    }

    const data = await request.json()
    const name = String(data.name || "").trim()
    if (!name) {
      return NextResponse.json({ error: "اسم البند مطلوب" }, { status: 400 })
    }

    const status = Number(data.status ?? 1)
    if (![1, 2, 3].includes(status)) {
      return NextResponse.json({ error: "الحالة يجب أن تكون 1 أو 2 أو 3" }, { status: 400 })
    }

    const result = await sql`
      UPDATE balance_sheet_assets_items
      SET name = ${name}, status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId}
      RETURNING id, name, status, created_at, updated_at
    `

    if (!result.length) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating balance sheet asset item:", error)
    return NextResponse.json({ error: "فشل في تحديث البند" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureBalanceSheetAssetsItemsTable()

    const itemId = Number(params.id)
    if (!itemId) {
      return NextResponse.json({ error: "معرف البند غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE balance_sheet_assets_items
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${itemId}
      RETURNING id, name, status, created_at, updated_at
    `

    if (!result.length) {
      return NextResponse.json({ error: "البند غير موجود" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error deleting balance sheet asset item:", error)
    return NextResponse.json({ error: "فشل في حذف البند" }, { status: 500 })
  }
}

