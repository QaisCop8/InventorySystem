import { NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS credit_cards_types_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      status INTEGER DEFAULT 1
    )
  `
  await sql`
    INSERT INTO credit_cards_types_tbl (name) VALUES ('فيزا'), ('ماستركارد'), ('أخرى')
    ON CONFLICT (name) DO NOTHING
  `
}

export async function GET() {
  try {
    await ensureTable()
    const rows = await sql`SELECT id, name FROM credit_cards_types_tbl WHERE status != 3 ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching credit card types:", error)
    return NextResponse.json({ error: "Failed to fetch credit card types" }, { status: 500 })
  }
}
