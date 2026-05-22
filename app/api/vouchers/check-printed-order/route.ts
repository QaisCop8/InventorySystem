import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const voucherId = searchParams.get("order_id")

    if (!voucherId) {
      return NextResponse.json({ exists: false, count: 0 })
    }

    const result = await pool.query(
      `
        SELECT COUNT(*) AS count
        FROM vouchers
        WHERE printed = 1
          AND id = $1
      `,
      [voucherId],
    )

    const count = Number.parseInt(result.rows[0].count, 10)

    return NextResponse.json({
      exists: count > 0,
      count,
    })
  } catch (error) {
    console.error("Error checking printed voucher:", error)
    return NextResponse.json(
      { error: "Failed to check printed voucher", exists: false },
      { status: 500 },
    )
  }
}
