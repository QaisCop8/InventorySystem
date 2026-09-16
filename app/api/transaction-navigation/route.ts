import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { authorizeTransaction, transactionFamilyForVoucherType } from "@/lib/transaction-permissions"

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams
    const vchType = Number(p.get("vch_type"))
    const currentId = Number(p.get("currentId") || 0)
    let direction = p.get("direction") || ""
    const family = transactionFamilyForVoucherType(vchType)
    if (!family || !Number.isSafeInteger(currentId) || currentId < 0 || !["first", "previous", "next", "last"].includes(direction)) {
      return NextResponse.json({ error: "بيانات التنقل غير صالحة" }, { status: 400 })
    }
    const authorization = await authorizeTransaction(request, family, "view", p.get("branch_id"))
    if (!authorization.ok) return authorization.response
    if (!currentId && direction === "previous") direction = "last"
    if (!currentId && direction === "next") direction = "first"
    const descending = direction === "last" || direction === "previous"
    const rows = await sql`
      SELECT id FROM voucher_header_tbl
      WHERE vch_type=${vchType} AND status<>3 AND branch_id=ANY(${authorization.branchIds}::int[])
        AND (${direction !== "previous"} OR id<${currentId})
        AND (${direction !== "next"} OR id>${currentId})
      ORDER BY ${sql.unsafe(descending ? "id DESC" : "id ASC")} LIMIT 1
    `
    return NextResponse.json(rows[0] || null)
  } catch (error) {
    console.error("Failed to navigate transactions", error)
    return NextResponse.json({ error: "تعذر التنقل بين السندات" }, { status: 500 })
  }
}
