import { type NextRequest, NextResponse } from "next/server"
import sql from "../../../../lib/database"

function getDatabaseErrorResponse() {
  return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })
}

export async function GET(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()
  try {
    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())
    if (!id) {
      return NextResponse.json({ error: "معرف الفئة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      SELECT id, name, name_en, description, status, created_at, updated_at
      FROM pricecategory
      WHERE id = ${id}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error fetching price category:", error)
    return NextResponse.json({ error: "Failed to fetch price category" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  try {
    await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())
    const data = await request.json()

    if (!id || !data.name) {
      return NextResponse.json({ error: "معرف الفئة واسمها مطلوبان" }, { status: 400 })
    }

    const status = Number(data.status)
    const normalizedStatus = status === 2 ? 2 : status === 3 ? 3 : 1

    const result = await sql`
      UPDATE pricecategory
      SET name = ${data.name}, name_en = ${data.name_en || data.name || ""}, description = ${data.description || ""}, status = ${normalizedStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, name, name_en, description, status, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating price category:", error)
    return NextResponse.json({ error: "Failed to update price category" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  try {
    await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE pricecategory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())
    if (!id) {
      return NextResponse.json({ error: "معرف الفئة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      UPDATE pricecategory
      SET status = 3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "الفئة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting price category:", error)
    return NextResponse.json({ error: "Failed to delete price category" }, { status: 500 })
  }
}

