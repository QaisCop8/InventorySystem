import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    if (!sql) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`
          SELECT id, group_code, group_name, description, status
          FROM item_groups
          WHERE status <> 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      case "last":
        rows = await sql`
          SELECT id, group_code, group_name, description, status
          FROM item_groups
          WHERE status <> 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "previous":
        rows = await sql`
          SELECT id, group_code, group_name, description, status
          FROM item_groups
          WHERE id < ${currentId || 0} AND status <> 3
          ORDER BY id DESC
          LIMIT 1
        `
        break
      case "next":
        rows = await sql`
          SELECT id, group_code, group_name, description, status
          FROM item_groups
          WHERE id > ${currentId || 0} AND status <> 3
          ORDER BY id ASC
          LIMIT 1
        `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No item group found" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error navigating item groups:", error)
    return NextResponse.json({ error: "Failed to navigate item groups" }, { status: 500 })
  }
}
