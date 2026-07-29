import { type NextRequest, NextResponse } from "next/server"
import sql, {
  ensureCarsTable,
  normalizeCarCode,
  isDuplicateCarName,
  toCar,
  toDbStatus,
  type CarDB,
} from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCarsTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السيارة غير صالح" }, { status: 400 })
    }

    const rows: CarDB[] = await sql`
      SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
      FROM cars
      WHERE id = ${id} AND COALESCE(status, 1) <> 3
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "السيارة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(toCar(rows[0]))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching car:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCarsTable()
    const id = Number(params.id)
    const data = await request.json()

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السيارة غير صالح" }, { status: 400 })
    }

    const name = String(data.name || "").trim().slice(0, 30)
    if (!name) {
      return NextResponse.json({ error: "اسم السيارة مطلوب" }, { status: 400 })
    }

    if (await isDuplicateCarName(name, id)) {
      return NextResponse.json({ error: "اسم السيارة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const carCode = normalizeCarCode(data.car_code)
    const statusValue = toDbStatus(data.status)

    const rows: CarDB[] = await sql`
      UPDATE cars
      SET car_code = ${carCode}, name = ${name}, plate_number = ${data.plate_number || ""}, model = ${data.model || ""}, licence_expiry = ${data.licence_expiry || null}, status = ${statusValue}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "السيارة غير موجودة" }, { status: 404 })
    }

    return NextResponse.json(toCar(rows[0]))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error updating car:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureCarsTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السيارة غير صالح" }, { status: 400 })
    }

    const existing = await sql`SELECT id FROM cars WHERE id = ${id} LIMIT 1`
    if (existing.length === 0) {
      return NextResponse.json({ error: "السيارة غير موجودة" }, { status: 404 })
    }

    await sql`UPDATE cars SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error deleting car:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
