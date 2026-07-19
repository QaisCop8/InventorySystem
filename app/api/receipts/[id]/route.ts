import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchDetails } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const rows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${id}`
    if (rows.length === 0) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    }

    const details = await fetchDetails(id)
    return NextResponse.json({ ...rows[0], ...details })
  } catch (error) {
    console.error("Error fetching voucher:", error)
    return NextResponse.json({ error: "Failed to fetch voucher" }, { status: 500 })
  }
}
