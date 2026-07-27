import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest, { params }: { params: { navigationType: string } }) {
  try {
    if (!sql) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { navigationType } = params
    const currentId = Number(request.nextUrl.searchParams.get("currentId") || 0)
    const bankId = request.nextUrl.searchParams.get("bankId")

    let rows: any[] = []

    switch (navigationType) {
      case "first":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id ASC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3
              ORDER BY id ASC
              LIMIT 1
            `
        break
      case "last":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id DESC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE status != 3
              ORDER BY id DESC
              LIMIT 1
            `
        break
      case "previous":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id < ${currentId || 0} AND status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id DESC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id < ${currentId || 0} AND status != 3
              ORDER BY id DESC
              LIMIT 1
            `
        break
      case "next":
        rows = bankId
          ? await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id > ${currentId || 0} AND status != 3 AND bank_id = ${Number(bankId)}
              ORDER BY id ASC
              LIMIT 1
            `
          : await sql`
              SELECT id, branch_code, branch_name, bank_id, status
              FROM branches
              WHERE id > ${currentId || 0} AND status != 3
              ORDER BY id ASC
              LIMIT 1
            `
        break
      default:
        return NextResponse.json({ error: "Invalid navigation type" }, { status: 400 })
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No branch found" }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (error) {
    console.error("Error navigating branches:", error)
    return NextResponse.json({ error: "Failed to navigate branches" }, { status: 500 })
  }
}
