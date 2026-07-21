import { NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables } from "../credit-cards/_lib"

// Lookup used by the سند قبض/سند صرف card tab. Schema is owned by app/api/credit-cards/_lib.ts
// (the بطاقات الائتمان admin screen) — this just reads it.
export async function GET() {
  try {
    await ensureTables()
    const rows = await sql`
      SELECT id, name, currency_id, financial_account_id
      FROM credit_cards_types_tbl
      WHERE COALESCE(status, 1) != 3
      ORDER BY id
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching credit card types:", error)
    return NextResponse.json({ error: "Failed to fetch credit card types" }, { status: 500 })
  }
}
