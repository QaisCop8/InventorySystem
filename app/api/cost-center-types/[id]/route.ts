import { type NextRequest, NextResponse } from "next/server"
import { findUsages, usageMessage } from "@/lib/delete-guard"
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

// حذف نوع مركز التكلفة: يُرفض إن كان مستخدماً في تعريفات أخرى أو حركات (lib/delete-guard.ts)، وإلا يُعلَّم محذوفاً (status = 3)
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "المعرّف غير صالح" }, { status: 400 })
    const row = (await sql`SELECT * FROM cost_center_types WHERE id = ${id}`)[0] as any
    if (!row) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 })
    const usages = await findUsages(id, { idColumns: /^(cost_type_id|cost_center_type_id)$/, excludeTables: ["cost_center_types"] })
    if (usages.length) return NextResponse.json({ error: usageMessage("نوع مركز التكلفة", String(row.name || ""), usages) }, { status: 400 })
    await sql`UPDATE cost_center_types SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error("[delete cost_center_types]", error)
    return NextResponse.json({ error: "تعذر حذف نوع مركز التكلفة" }, { status: 500 })
  }
}
