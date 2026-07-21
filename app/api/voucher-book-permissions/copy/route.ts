import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, fetchPermissionsForUser } from "../_lib"

// Copies all دفاتر السندات permissions (across every voucher type) from one user to another —
// convenient for provisioning a new user from an existing "template" user.
export async function POST(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const fromUserId = Number(data.from_user_id || 0)
    const toUserId = Number(data.to_user_id || 0)

    if (!fromUserId || !toUserId) {
      return NextResponse.json({ error: "المستخدم المصدر والمستخدم الهدف مطلوبان" }, { status: 400 })
    }
    if (fromUserId === toUserId) {
      return NextResponse.json({ error: "لا يمكن النسخ لنفس المستخدم" }, { status: 400 })
    }

    const sourceRows = await sql`
      SELECT voucher_type_id, vch_book_id, is_default FROM voucher_book_user_permissions_tbl WHERE user_id = ${fromUserId}
    `

    await sql`DELETE FROM voucher_book_user_permissions_tbl WHERE user_id = ${toUserId}`
    for (const row of sourceRows) {
      await sql`
        INSERT INTO voucher_book_user_permissions_tbl (user_id, voucher_type_id, vch_book_id, is_default)
        VALUES (${toUserId}, ${row.voucher_type_id}, ${row.vch_book_id}, ${row.is_default})
      `
    }

    const rows = await fetchPermissionsForUser(toUserId)
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error copying voucher book permissions:", error)
    return NextResponse.json({ error: "Failed to copy voucher book permissions" }, { status: 500 })
  }
}
