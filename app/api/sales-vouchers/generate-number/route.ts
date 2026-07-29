import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, getSalesVoucherNumberSettings, nextVoucherSequence, buildVoucherCode, resolveVoucherBookName, DELIVERY_SELL_VCH_TYPE } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || DELIVERY_SELL_VCH_TYPE)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ code: "" })
    }

    const { prefix, startNumber } = await getSalesVoucherNumberSettings(request.url, vchType)
    const codePrefix = `${prefix}${bookName}`
    const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)

    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) })
  } catch (error) {
    console.error("Error generating sales voucher number:", error)
    return NextResponse.json({ error: "Failed to generate sales voucher number" }, { status: 500 })
  }
}
