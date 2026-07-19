import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const PREFIX_BY_TYPE: Record<number, string> = {
  1: "R", // سند قبض
  2: "P", // سند صرف
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 1)
    const prefix = PREFIX_BY_TYPE[vchType] || "V"

    await sql`
      CREATE TABLE IF NOT EXISTS voucher_header_tbl (
        id SERIAL PRIMARY KEY,
        vch_type INTEGER NOT NULL,
        vch_code VARCHAR(20) NOT NULL,
        vch_date DATE NOT NULL,
        currency_id INTEGER,
        rate DOUBLE PRECISION DEFAULT 1,
        cash_amount DOUBLE PRECISION DEFAULT 0,
        cash_account_id INTEGER,
        bank_amount DOUBLE PRECISION DEFAULT 0,
        bank_account_id INTEGER,
        amount DOUBLE PRECISION DEFAULT 0,
        note VARCHAR(200),
        status INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (vch_type, vch_code)
      )
    `

    const rows = await sql`
      SELECT vch_code FROM voucher_header_tbl
      WHERE vch_type = ${vchType} AND vch_code LIKE ${prefix + "%"}
    `

    let maxNumber = 0
    for (const row of rows) {
      const numericPart = String(row.vch_code || "").slice(prefix.length)
      const value = Number(numericPart)
      if (Number.isFinite(value) && value > maxNumber) maxNumber = value
    }

    const nextCode = `${prefix}${String(maxNumber + 1).padStart(7, "0")}`

    return NextResponse.json({ code: nextCode })
  } catch (error) {
    console.error("Error generating voucher number:", error)
    return NextResponse.json({ error: "Failed to generate voucher number" }, { status: 500 })
  }
}
