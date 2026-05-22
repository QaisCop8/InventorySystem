import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    const [salesInvoices] = await sql`
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE vch_type = 5 AND deleted = false
    `

    const [salesOrders] = await sql`
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE vch_type = 1 AND deleted = false
    `

    const [purchaseOrders] = await sql`
      SELECT COUNT(*) as count
      FROM vouchers
      WHERE vch_type = 2 AND deleted = false
    `

    const locks = {
      invoice: Number.parseInt(salesInvoices.count) > 0,
      order: Number.parseInt(salesOrders.count) > 0,
      purchase: Number.parseInt(purchaseOrders.count) > 0,
    }

    return NextResponse.json({
      hasTransactions: locks.invoice || locks.order || locks.purchase,
      locks,
    })
  } catch (error) {
    console.error("Error checking transactions:", error)
    return NextResponse.json(
      {
        hasTransactions: false,
        locks: { invoice: false, order: false, purchase: false },
      },
      { status: 500 },
    )
  }
}
