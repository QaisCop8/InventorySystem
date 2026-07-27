import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    if (!sql) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    const branchIdParam = request.nextUrl.searchParams.get("branchId")
    const branchId = branchIdParam ? Number(branchIdParam) : undefined

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = branchId
          ? await sql`SELECT * FROM bank_accounts WHERE status != 3 AND branch_id = ${branchId} ORDER BY id ASC LIMIT 1`
          : await sql`SELECT * FROM bank_accounts WHERE status != 3 ORDER BY id ASC LIMIT 1`
        break
      case "last":
        rows = branchId
          ? await sql`SELECT * FROM bank_accounts WHERE status != 3 AND branch_id = ${branchId} ORDER BY id DESC LIMIT 1`
          : await sql`SELECT * FROM bank_accounts WHERE status != 3 ORDER BY id DESC LIMIT 1`
        break
      case "previous":
        rows = branchId
          ? await sql`SELECT * FROM bank_accounts WHERE id < ${currentId || 0} AND status != 3 AND branch_id = ${branchId} ORDER BY id DESC LIMIT 1`
          : await sql`SELECT * FROM bank_accounts WHERE id < ${currentId || 0} AND status != 3 ORDER BY id DESC LIMIT 1`
        break
      case "next":
        rows = branchId
          ? await sql`SELECT * FROM bank_accounts WHERE id > ${currentId || 0} AND status != 3 AND branch_id = ${branchId} ORDER BY id ASC LIMIT 1`
          : await sql`SELECT * FROM bank_accounts WHERE id > ${currentId || 0} AND status != 3 ORDER BY id ASC LIMIT 1`
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No bank account found" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error navigating bank accounts:", error)
    return NextResponse.json({ error: "Failed to navigate bank accounts" }, { status: 500 })
  }
}
