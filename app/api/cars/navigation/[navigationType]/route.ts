import { type NextRequest, NextResponse } from "next/server"
import sql, { ensureCarsTable, toCar, type CarDB } from "../../_lib"

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    await ensureCarsTable()

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    let rows: CarDB[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`
          SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
          FROM cars
          WHERE COALESCE(status, 1) <> 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      case "last":
        rows = await sql`
          SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
          FROM cars
          WHERE COALESCE(status, 1) <> 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "previous":
        rows = await sql`
          SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
          FROM cars
          WHERE id < ${currentId || 0} AND COALESCE(status, 1) <> 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "next":
        rows = await sql`
          SELECT id, car_code, name, plate_number, model, licence_expiry, status, created_at, updated_at
          FROM cars
          WHERE id > ${currentId || 0} AND COALESCE(status, 1) <> 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No car found" }, { status: 404 })
    }

    return NextResponse.json(toCar(rows[0]))
  } catch (error) {
    console.error("Error navigating cars:", error)
    return NextResponse.json({ error: "Failed to navigate cars" }, { status: 500 })
  }
}
