import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables } from "../_lib"

// أوراق شيكات متوفرة (status=1) ضمن دفاتر شيكات حساب بنكي معيّن — تُستخدم في نافذة اختيار
// الشيك عند إصدار سند صرف (بدل الكتابة اليدوية لرقم الشيك)، انظر cheque-book-leaf-search.tsx.
export async function GET(request: NextRequest) {
  try {
    await ensureTables()

    const { searchParams } = new URL(request.url)
    const bankAccountId = Number(searchParams.get("bank_account_id") || 0)
    if (!bankAccountId) {
      return NextResponse.json([])
    }

    const rows = await sql`
      SELECT c.id, c.cheque_code, c.cheque_books_id, cb.code AS book_code
      FROM cheque_book_cheque_tbl c
      JOIN cheque_books_tbl cb ON cb.id = c.cheque_books_id
      WHERE cb.bank_account_id = ${bankAccountId}
        AND COALESCE(cb.status, 1) != 3
        AND c.status = 1
      ORDER BY cb.id, c.order_no, c.id
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching available cheque leaves:", error)
    return NextResponse.json({ error: "Failed to fetch available cheque leaves" }, { status: 500 })
  }
}
