import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchCreditNoteDetails } from "../../_lib"
import { authorizeTransaction, transactionFamilyForVoucherType } from "@/lib/transaction-permissions"

export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    const vchType = Number(request.nextUrl.searchParams.get("vch_type") || 10)
    const family = transactionFamilyForVoucherType(vchType)
    if (!family) return NextResponse.json({ error: "Invalid voucher type" }, { status: 400 })
    const authorization = await authorizeTransaction(request, family, "view", request.nextUrl.searchParams.get("branch_id"))
    if (!authorization.ok) return authorization.response

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE vch_type = ${vchType} AND status != 3 AND branch_id = ANY(${authorization.branchIds}::int[]) ORDER BY id ASC LIMIT 1`
        break
      case "last":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE vch_type = ${vchType} AND status != 3 AND branch_id = ANY(${authorization.branchIds}::int[]) ORDER BY id DESC LIMIT 1`
        break
      case "previous":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE id < ${currentId || 0} AND vch_type = ${vchType} AND status != 3 AND branch_id = ANY(${authorization.branchIds}::int[]) ORDER BY id DESC LIMIT 1`
        break
      case "next":
        rows = await sql`SELECT * FROM voucher_header_tbl WHERE id > ${currentId || 0} AND vch_type = ${vchType} AND status != 3 AND branch_id = ANY(${authorization.branchIds}::int[]) ORDER BY id ASC LIMIT 1`
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No voucher found" }, { status: 404 })
    }

    const voucher = rows[0]
    const details = await fetchCreditNoteDetails(voucher.id)
    return NextResponse.json({ ...voucher, ...details })
  } catch (error) {
    console.error("Error navigating credit/debit notes:", error)
    return NextResponse.json({ error: "Failed to navigate credit/debit notes" }, { status: 500 })
  }
}
