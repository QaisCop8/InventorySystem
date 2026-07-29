import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET() {
  try {
    const cities = await sql`
      SELECT * FROM cities
      ORDER BY name
    `
    return NextResponse.json(cities)
  } catch (error) {
    console.error("Error fetching cities:", error)
    return NextResponse.json({ error: "Failed to fetch cities" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.name) {
      return NextResponse.json({ error: "اسم المدينة مطلوب" }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO cities (name)
      VALUES (${data.name})
      RETURNING *
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error("Error creating city:", error)
    return NextResponse.json({ error: "Failed to create city" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json()

    if (!data.id || !data.name) {
      return NextResponse.json({ error: "معرف المدينة واسمها مطلوبان" }, { status: 400 })
    }

    const result = await sql`
      UPDATE cities
      SET name = ${data.name}
      WHERE id = ${data.id}
      RETURNING *
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

