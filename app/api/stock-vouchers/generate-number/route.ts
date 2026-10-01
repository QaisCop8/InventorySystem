import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, getStockVoucherNumberSettings, nextVoucherSequence, buildVoucherCode, resolveVoucherBookName } from "../_lib"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 12)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ code: "" }, { headers: { "Cache-Control": "no-store" } })
    }

    const { prefix, startNumber } = await getStockVoucherNumberSettings(request.url, vchType)
    const codePrefix = `${prefix}${bookName}`
    const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)

    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Error generating stock voucher number:", error)
    return NextResponse.json({ error: "Failed to generate stock voucher number" }, { status: 500 })
  }
}
