import { type NextRequest, NextResponse } from "next/server"
import sql, {
  ensureDriversTable,
  normalizeDriverCode,
  isDuplicateDriverName,
  toDriver,
  toDbStatus,
  type DriverDB,
} from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureDriversTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السائق غير صالح" }, { status: 400 })
    }

    const rows: DriverDB[] = await sql`
      SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
             lt.name AS license_type_name, d.status, d.created_at, d.updated_at
      FROM drivers d
      LEFT JOIN license_types lt ON lt.id = d.license_type_id
      WHERE d.id = ${id} AND COALESCE(d.status, 1) <> 3
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "السائق غير موجود" }, { status: 404 })
    }

    return NextResponse.json(toDriver(rows[0]))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching driver:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureDriversTable()
    const id = Number(params.id)
    const data = await request.json()

    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السائق غير صالح" }, { status: 400 })
    }

    const name = String(data.name || "").trim().slice(0, 30)
    if (!name) {
      return NextResponse.json({ error: "اسم السائق مطلوب" }, { status: 400 })
    }

    const licenseTypeId = data.license_type_id ? Number(data.license_type_id) : null
    if (!licenseTypeId) {
      return NextResponse.json({ error: "نوع الرخصة مطلوب" }, { status: 400 })
    }

    if (await isDuplicateDriverName(name, id)) {
      return NextResponse.json({ error: "اسم السائق مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const driverCode = normalizeDriverCode(data.driver_code)
    const statusValue = toDbStatus(data.status)

    const rows: DriverDB[] = await sql`
      UPDATE drivers
      SET driver_code = ${driverCode}, name = ${name}, phone = ${data.phone || ""}, licence_expiry = ${data.licence_expiry || null}, license_type_id = ${licenseTypeId}, status = ${statusValue}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING id, driver_code, name, phone, licence_expiry, license_type_id, status, created_at, updated_at
    `

    if (rows.length === 0) {
      return NextResponse.json({ error: "السائق غير موجود" }, { status: 404 })
    }

    const licenseTypeRows = await sql`SELECT name FROM license_types WHERE id = ${licenseTypeId} LIMIT 1`

    return NextResponse.json(toDriver({ ...rows[0], license_type_name: licenseTypeRows[0]?.name ?? null }))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error updating driver:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureDriversTable()
    const id = Number(params.id)
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف السائق غير صالح" }, { status: 400 })
    }

    const existing = await sql`SELECT id FROM drivers WHERE id = ${id} LIMIT 1`
    if (existing.length === 0) {
      return NextResponse.json({ error: "السائق غير موجود" }, { status: 404 })
    }

    await sql`UPDATE drivers SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error deleting driver:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
