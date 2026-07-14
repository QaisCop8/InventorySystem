import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const voucherCode = searchParams.get("voucher_code") || searchParams.get("order_number")

    if (!voucherCode) {
      return NextResponse.json({ error: "voucher_code is required" }, { status: 400 })
    }

    const result = await pool.query(
      `
        SELECT
          v.*,
          v.voucher_code AS order_number,
          v.voucher_date AS order_date,
          v.vch_status AS order_status,
          v.vch_status AS order_status2,
          0 AS order_decision,
          COALESCE(c.name, '') AS customer_name
        FROM vouchers v
        LEFT JOIN customers c ON v.customer_id = c.id
        WHERE v.voucher_code = $1
        LIMIT 1
      `,
      [voucherCode],
    )

    return NextResponse.json(result.rows[0] ?? null, { status: 200 })
  } catch (error) {
    console.error("getorderbycode vouchers error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

