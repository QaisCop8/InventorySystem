import { authorizeFile, authorizeFileRead, projectFileLookup } from "@/lib/file-permissions"
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
  CAR_SELECT_COLUMNS,
  carExtraFields,
} from "./_lib"

export async function GET(request: NextRequest) {
  try {
    const permission = await authorizeFileRead(request, ["cars"])
    if (!permission.ok) return permission.response
    await ensureCarsTable()

    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase()

    if (code) {
      const normalizedCode = normalizeCarCode(code)
      const rows: CarDB[] = await sql`
        SELECT ${sql.unsafe(CAR_SELECT_COLUMNS)}
        FROM cars
        WHERE car_code = ${normalizedCode} AND COALESCE(status, 1) <> 3
        LIMIT 1
      `

      if (rows.length === 0) {
        return NextResponse.json({ error: "السيارة غير موجودة" }, { status: 404 })
      }

      return NextResponse.json(permission.lookupOnly ? projectFileLookup("cars", [toCar(rows[0])])[0] : toCar(rows[0]))
    }

    const rows: CarDB[] = await sql`
      SELECT ${sql.unsafe(CAR_SELECT_COLUMNS)}
      FROM cars
      WHERE COALESCE(status, 1) <> 3
      ORDER BY id
    `

    return NextResponse.json(permission.lookupOnly ? projectFileLookup("cars", rows.map(toCar)) : rows.map(toCar))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching cars:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const permission = await authorizeFile(request, "cars", "create")
    if (!permission.ok) return permission.response
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
    const extra = carExtraFields(data)
    let carCode = await ensureUniqueCarCode(data.car_code)
    let result: CarDB[] = []

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await sql`
          INSERT INTO cars (car_code, name, plate_number, model, licence_expiry, status,
            salesman_id, warehouse_id, cash_account_id, insurance_account_id, license_account_id, fuel_account_id, maintenance_account_id)
          VALUES (${carCode}, ${name}, ${data.plate_number || ""}, ${data.model || ""}, ${data.licence_expiry || null}, ${statusValue},
            ${extra.salesman_id}, ${extra.warehouse_id}, ${extra.cash_account_id}, ${extra.insurance_account_id}, ${extra.license_account_id}, ${extra.fuel_account_id}, ${extra.maintenance_account_id})
          RETURNING ${sql.unsafe(CAR_SELECT_COLUMNS)}
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
