import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, fetchBookWithJoins } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTables()
    const id = Number(params.id)
    const book = await fetchBookWithJoins(id)
    if (!book) return NextResponse.json({ error: "دفتر الشيكات غير موجود" }, { status: 404 })
    return NextResponse.json(book)
  } catch (error) {
    console.error("Error fetching cheque book:", error)
    return NextResponse.json({ error: "Failed to fetch cheque book" }, { status: 500 })
  }
}
