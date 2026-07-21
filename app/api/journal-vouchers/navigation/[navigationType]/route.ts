import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { JOURNAL_VCH_TYPE, fetchDetails } from "../../_lib"

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND status != 3 ORDER BY id ASC LIMIT 1`
        break
      case "last":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE vch_type = ${JOURNAL_VCH_TYPE} AND status != 3 ORDER BY id DESC LIMIT 1`
        break
      case "previous":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE id < ${currentId || 0} AND vch_type = ${JOURNAL_VCH_TYPE} AND status != 3 ORDER BY id DESC LIMIT 1`
        break
      case "next":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE id > ${currentId || 0} AND vch_type = ${JOURNAL_VCH_TYPE} AND status != 3 ORDER BY id ASC LIMIT 1`
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No voucher found" }, { status: 404 })
    }

    const voucher = rows[0]
    const details = await fetchDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error navigating journal vouchers:", error)
    return NextResponse.json({ error: "Failed to navigate journal vouchers" }, { status: 500 })
  }
}
