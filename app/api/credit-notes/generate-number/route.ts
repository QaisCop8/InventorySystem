import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, getCreditNoteNumberSettings, nextVoucherSequence, buildVoucherCode, resolveVoucherBookName } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 10)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ code: "" })
    }

    const { prefix, startNumber } = await getCreditNoteNumberSettings(request.url, vchType)
    const codePrefix = `${prefix}${bookName}`
    const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)

    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) })
  } catch (error) {
    console.error("Error generating credit/debit note number:", error)
    return NextResponse.json({ error: "Failed to generate credit/debit note number" }, { status: 500 })
  }
}
