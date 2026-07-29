import { type NextRequest, NextResponse } from "next/server"
import sql, {
  ensureCarsTable,
  normalizeCarCode,
  isDuplicateCarName,
  ensureUniqueCarCode,
  isDuplicateInsertError,
  toCar,
  toDbStatus,
  type CarDB,
} from "./_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureCarsTable()

    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase()

    if (code) {
      const normalizedCode = normalizeCarCode(code)
      const rows: CarDB[] = await sql`
        SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
        FROM cars
        WHERE car_code = ${normalizedCode} AND COALESCE(status, 1) <> 3
        LIMIT 1
      `

      if (rows.length === 0) {
        return NextResponse.json({ error: "السيارة غير موجودة" }, { status: 404 })
      }

      return NextResponse.json(toCar(rows[0]))
    }

    const rows: CarDB[] = await sql`
      SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
      FROM cars
      WHERE COALESCE(status, 1) <> 3
      ORDER BY id
    `

    return NextResponse.json(rows.map(toCar))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching cars:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCarsTable()

    const data = await request.json()
    const name = String(data.name || "").trim().slice(0, 30)

    if (!name) {
      return NextResponse.json({ error: "اسم السيارة مطلوب" }, { status: 400 })
    }

    if (await isDuplicateCarName(name)) {
      return NextResponse.json({ error: "اسم السيارة مكرر لا يمكن الاستمرار" }, { status: 409 })
    }

    const statusValue = toDbStatus(data.status)
    let carCode = await ensureUniqueCarCode(data.car_code)
    let result: CarDB[] = []

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await sql`
          INSERT INTO cars (car_code, name, plate_number, model, licence_expiry, status)
          VALUES (${carCode}, ${name}, ${data.plate_number || ""}, ${data.model || ""}, ${data.licence_expiry || null}, ${statusValue})
          RETURNING id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
        `
        break
      } catch (error: unknown) {
        if (attempt < 2 && isDuplicateInsertError(error)) {
          carCode = await ensureUniqueCarCode("")
          continue
        }
        throw error
      }
    }

    return NextResponse.json(toCar(result[0]), { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error creating car:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
