import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, fetchBookWithJoins } from "../../_lib"

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    await ensureTables()
    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`SELECT id FROM cheque_books_tbl WHERE COALESCE(status, 1) != 3 ORDER BY id ASC LIMIT 1`
        break
      case "last":
        rows = await sql`SELECT id FROM cheque_books_tbl WHERE COALESCE(status, 1) != 3 ORDER BY id DESC LIMIT 1`
        break
      case "previous":
        rows = await sql`SELECT id FROM cheque_books_tbl WHERE id < ${currentId || 0} AND COALESCE(status, 1) != 3 ORDER BY id DESC LIMIT 1`
        break
      case "next":
        rows = await sql`SELECT id FROM cheque_books_tbl WHERE id > ${currentId || 0} AND COALESCE(status, 1) != 3 ORDER BY id ASC LIMIT 1`
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) return NextResponse.json({ error: "No record found" }, { status: 404 })

    const book = await fetchBookWithJoins(rows[0].id)
    return NextResponse.json(book)
  } catch (error) {
    console.error("Error navigating cheque books:", error)
    return NextResponse.json({ error: "Failed to navigate cheque books" }, { status: 500 })
  }
}
