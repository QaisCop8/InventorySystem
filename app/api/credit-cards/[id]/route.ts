import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchHolidays } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 })

    const rows = await sql`SELECT * FROM credit_cards_types_tbl WHERE id = ${id}`
    if (rows.length === 0) return NextResponse.json({ error: "البطاقة غير موجودة" }, { status: 404 })

    const holidays = await fetchHolidays(id)
    return NextResponse.json({ ...rows[0], holidays })
  } catch (error) {
    console.error("Error fetching credit card type:", error)
    return NextResponse.json({ error: "Failed to fetch credit card type" }, { status: 500 })
  }
}
