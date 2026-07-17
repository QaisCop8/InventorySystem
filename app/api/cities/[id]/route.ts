import { type NextRequest, NextResponse } from "next/server"
import sql from "../../../../lib/database"

function getDatabaseErrorResponse() {
  return NextResponse.json({ error: "قاعدة البيانات غير متاحة" }, { status: 500 })
}

export async function GET(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()
  try {
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())
    if (!id) {
      return NextResponse.json({ error: "معرف المدينة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      SELECT id, name, status, created_at, updated_at
      FROM cities
      WHERE id = ${id}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "المدينة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error fetching city:", error)
    return NextResponse.json({ error: "Failed to fetch city" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!sql) return getDatabaseErrorResponse()

  try {
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

    const url = new URL(request.url)
    const id = Number(url.pathname.split("/").pop())
    const data = await request.json()

    if (!id || !data.name) {
      return NextResponse.json({ error: "معرف المدينة واسمها مطلوبان" }, { status: 400 })
    }

    const status = Number(data.status)
    const normalizedStatus = status === 2 ? 2 : status === 3 ? 3 : 1

    const result = await sql`
      UPDATE cities
      SET name = ${data.name}, status = ${normalizedStatus}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
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
  if (!sql) return getDatabaseErrorResponse()

  try {
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

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

