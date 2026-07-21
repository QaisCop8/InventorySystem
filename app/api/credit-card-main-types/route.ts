import { NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables } from "../credit-cards/_lib"

export async function GET() {
  try {
    await ensureTables()
    const rows = await sql`SELECT id, name FROM credit_card_main_types_tbl ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching credit card main types:", error)
    return NextResponse.json({ error: "Failed to fetch credit card main types" }, { status: 500 })
  }
}
