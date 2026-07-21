import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, fetchPermissionsForUser } from "./_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const userId = Number(searchParams.get("user_id") || 0)
    if (!userId) return NextResponse.json({ error: "المستخدم مطلوب" }, { status: 400 })

    const rows = await fetchPermissionsForUser(userId)
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching voucher book permissions:", error)
    return NextResponse.json({ error: "Failed to fetch voucher book permissions" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTables()
    const data = await request.json()
    const userId = Number(data.user_id || 0)
    const voucherTypeId = Number(data.voucher_type_id || 0)
    const bookIds: number[] = Array.isArray(data.book_ids) ? data.book_ids.map((id: any) => Number(id)) : []
    const defaultBookId = data.default_book_id ? Number(data.default_book_id) : null

    if (!userId || !voucherTypeId) {
      return NextResponse.json({ error: "المستخدم ونوع السند مطلوبان" }, { status: 400 })
    }
    if (defaultBookId && !bookIds.includes(defaultBookId)) {
      return NextResponse.json({ error: "الدفتر الافتراضي يجب أن يكون من الدفاتر المحددة" }, { status: 400 })
    }

    await sql`
      DELETE FROM voucher_book_user_permissions_tbl WHERE user_id = ${userId} AND voucher_type_id = ${voucherTypeId}
    `
    for (const bookId of bookIds) {
      await sql`
        INSERT INTO voucher_book_user_permissions_tbl (user_id, voucher_type_id, vch_book_id, is_default)
        VALUES (${userId}, ${voucherTypeId}, ${bookId}, ${bookId === defaultBookId ? 1 : 0})
      `
    }

    const rows = await fetchPermissionsForUser(userId)
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error saving voucher book permissions:", error)
    return NextResponse.json({ error: "Failed to save voucher book permissions" }, { status: 500 })
  }
}
