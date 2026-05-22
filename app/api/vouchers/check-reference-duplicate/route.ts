import { NextResponse } from "next/server"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const referenceNumber = searchParams.get("reference_number")
    const voucherId = searchParams.get("order_id")

    if (!referenceNumber) {
      return NextResponse.json({ error: "reference_number is required", exists: false }, { status: 400 })
    }

    const result = await pool.query(
      `
        SELECT COUNT(*) AS count
        FROM vouchers
        WHERE reference_number = $1
          AND deleted = false
          AND id != $2
      `,
      [referenceNumber, voucherId || "0"],
    )

    const count = Number.parseInt(result.rows[0].count, 10)

    return NextResponse.json({
      exists: count > 0,
      count,
    })
  } catch (error) {
    console.error("Error checking reference duplicate:", error)
    return NextResponse.json(
      { error: "Failed to check reference number", exists: false },
      { status: 500 },
    )
  }
}
