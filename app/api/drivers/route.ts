import { type NextRequest, NextResponse } from "next/server"
import sql, {
  ensureDriversTable,
  normalizeDriverCode,
  isDuplicateDriverName,
  ensureUniqueDriverCode,
  isDuplicateInsertError,
  toDriver,
  toDbStatus,
  type DriverDB,
} from "./_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureDriversTable()

    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase()

    if (code) {
      const normalizedCode = normalizeDriverCode(code)
      const rows: DriverDB[] = await sql`
        SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
               lt.name AS license_type_name, d.status, d.created_at, d.updated_at
        FROM drivers d
        LEFT JOIN license_types lt ON lt.id = d.license_type_id
        WHERE d.driver_code = ${normalizedCode} AND COALESCE(d.status, 1) <> 3
        LIMIT 1
      `

      if (rows.length === 0) {
        return NextResponse.json({ error: "السائق غير موجود" }, { status: 404 })
      }

      return NextResponse.json(toDriver(rows[0]))
    }

    const rows: DriverDB[] = await sql`
      SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
             lt.name AS license_type_name, d.status, d.created_at, d.updated_at
      FROM drivers d
      LEFT JOIN license_types lt ON lt.id = d.license_type_id
      WHERE COALESCE(d.status, 1) <> 3
      ORDER BY d.id
    `

    return NextResponse.json(rows.map(toDriver))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching drivers:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDriversTable()

    const data = await request.json()
    const name = String(data.name || "").trim().slice(0, 30)

    if (!name) {
      return NextResponse.json({ error: "اسم السائق مطلوب" }, { status: 400 })
    }

    const licenseTypeId = data.license_type_id ? Number(data.license_type_id) : null
    if (!licenseTypeId) {
      return NextResponse.json({ error: "نوع الرخصة مطلوب" }, { status: 400 })
    }

    if (await isDuplicateDriverName(name)) {
      return NextResponse.json({ error: "اسم السائق مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const statusValue = toDbStatus(data.status)
    let driverCode = await ensureUniqueDriverCode(data.driver_code)
    let result: DriverDB[] = []

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await sql`
          INSERT INTO drivers (driver_code, name, phone, licence_expiry, license_type_id, status)
          VALUES (${driverCode}, ${name}, ${data.phone || ""}, ${data.licence_expiry || null}, ${licenseTypeId}, ${statusValue})
          RETURNING id, driver_code, name, phone, licence_expiry, license_type_id, status, created_at, updated_at
        `
        break
      } catch (error: unknown) {
        if (attempt < 2 && isDuplicateInsertError(error)) {
          driverCode = await ensureUniqueDriverCode("")
          continue
        }
        throw error
      }
    }

    const licenseTypeRows = await sql`SELECT name FROM license_types WHERE id = ${licenseTypeId} LIMIT 1`

    return NextResponse.json(
      toDriver({ ...result[0], license_type_name: licenseTypeRows[0]?.name ?? null }),
      { status: 201 },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error creating driver:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
