import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_voucher_books_tbl (
      id SERIAL PRIMARY KEY,
      vch_type INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      status INTEGER DEFAULT 1
    )
  `
  await sql`
    INSERT INTO receipt_voucher_books_tbl (vch_type, name)
    SELECT 1, 'الدفتر الرئيسي'
    WHERE NOT EXISTS (SELECT 1 FROM receipt_voucher_books_tbl WHERE vch_type = 1)
  `
  await sql`
    INSERT INTO receipt_voucher_books_tbl (vch_type, name)
    SELECT 2, 'الدفتر الرئيسي'
    WHERE NOT EXISTS (SELECT 1 FROM receipt_voucher_books_tbl WHERE vch_type = 2)
  `
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 1)
    const rows = await sql`
      SELECT id, name FROM receipt_voucher_books_tbl WHERE vch_type = ${vchType} AND status != 3 ORDER BY id
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching voucher books:", error)
    return NextResponse.json({ error: "Failed to fetch voucher books" }, { status: 500 })
  }
}
