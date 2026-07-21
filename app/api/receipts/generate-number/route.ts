import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, getVoucherNumberSettings, nextVoucherSequence, buildVoucherCode, resolveVoucherBookName } from "../_lib"

// الكود = بادئة (إعدادات النظام) + رمز دفتر السندات + تسلسل مبطّن (RE + F + 00001 = REF00001).
// يتطلب vch_book_id لأن الرمز جزء أساسي من الكود — بدون دفتر مُحدَّد لا يمكن توليد رقم كامل.
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 8)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ code: "" })
    }

    const { prefix, startNumber } = await getVoucherNumberSettings(request.url, vchType)
    const codePrefix = `${prefix}${bookName}`
    const sequence = await nextVoucherSequence(vchType, codePrefix, startNumber)

    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) })
  } catch (error) {
    console.error("Error generating voucher number:", error)
    return NextResponse.json({ error: "Failed to generate voucher number" }, { status: 500 })
  }
}
