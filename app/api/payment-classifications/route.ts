import { NextResponse } from "next/server"
import sql from "@/lib/database"

const ensureTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS payment_classifications_tbl (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      status INTEGER DEFAULT 1
    )
  `
  await sql`
    INSERT INTO payment_classifications_tbl (name)
    VALUES ('نقدي'), ('آجل'), ('تحويل بنكي')
    ON CONFLICT (name) DO NOTHING
  `
}

export async function GET() {
  try {
    await ensureTable()
    const rows = await sql`SELECT id, name FROM payment_classifications_tbl WHERE status != 3 ORDER BY id`
    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching payment classifications:", error)
    return NextResponse.json({ error: "Failed to fetch payment classifications" }, { status: 500 })
  }
}
