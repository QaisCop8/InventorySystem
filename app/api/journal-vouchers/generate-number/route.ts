import { type NextRequest, NextResponse } from "next/server"
import { ensureTables, getVoucherNumberSettings, nextVoucherSequence, buildVoucherCode, resolveVoucherBookName } from "../_lib"

// الكود = بادئة (إعدادات النظام) + رمز دفتر السندات + تسلسل مبطّن (J + F + 000001 = JF000001).
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ code: "" })
    }

    const { prefix, startNumber } = await getVoucherNumberSettings(request.url)
    const codePrefix = `${prefix}${bookName}`
    const sequence = await nextVoucherSequence(codePrefix, startNumber)

    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) })
  } catch (error) {
    console.error("Error generating journal voucher number:", error)
    return NextResponse.json({ error: "Failed to generate journal voucher number" }, { status: 500 })
  }
}
