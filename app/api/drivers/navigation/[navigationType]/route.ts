import { type NextRequest, NextResponse } from "next/server"
import sql, { ensureDriversTable, toDriver, type DriverDB } from "../../_lib"

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    await ensureDriversTable()

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    let rows: DriverDB[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`
          SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
                 lt.name AS license_type_name, d.status, d.created_at, d.updated_at
          FROM drivers d
          LEFT JOIN license_types lt ON lt.id = d.license_type_id
          WHERE COALESCE(d.status, 1) <> 3
          ORDER BY d.id ASC
          LIMIT 1
        `
        break
      case "last":
        rows = await sql`
          SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
                 lt.name AS license_type_name, d.status, d.created_at, d.updated_at
          FROM drivers d
          LEFT JOIN license_types lt ON lt.id = d.license_type_id
          WHERE COALESCE(d.status, 1) <> 3
          ORDER BY d.id DESC
          LIMIT 1
        `
        break
      case "previous":
        rows = await sql`
          SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
                 lt.name AS license_type_name, d.status, d.created_at, d.updated_at
          FROM drivers d
          LEFT JOIN license_types lt ON lt.id = d.license_type_id
          WHERE d.id < ${currentId || 0} AND COALESCE(d.status, 1) <> 3
          ORDER BY d.id DESC
          LIMIT 1
        `
        break
      case "next":
        rows = await sql`
          SELECT d.id, d.driver_code, d.name, d.phone, d.licence_expiry, d.license_type_id,
                 lt.name AS license_type_name, d.status, d.created_at, d.updated_at
          FROM drivers d
          LEFT JOIN license_types lt ON lt.id = d.license_type_id
          WHERE d.id > ${currentId || 0} AND COALESCE(d.status, 1) <> 3
          ORDER BY d.id ASC
          LIMIT 1
        `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No driver found" }, { status: 404 })
    }

    return NextResponse.json(toDriver(rows[0]))
  } catch (error) {
    console.error("Error navigating drivers:", error)
    return NextResponse.json({ error: "Failed to navigate drivers" }, { status: 500 })
  }
}
