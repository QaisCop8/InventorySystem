import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { buildVoucherCode, ensureTables, getVoucherNumberSettings, resolveVoucherBookName } from "@/app/api/receipts/_lib"
import { CHEQUE_PAYMENT_CODE_PREFIX, CHEQUE_PAYMENT_VCH_TYPE, ensureChequePaymentTables } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    await ensureChequePaymentTables()
    const bookId = Number(request.nextUrl.searchParams.get("vch_book_id")) || null
    const bookName = await resolveVoucherBookName(bookId)
    if (!bookName) return NextResponse.json({ error: "دفتر السندات غير موجود" }, { status: 400 })
    const { startNumber } = await getVoucherNumberSettings(request.url, CHEQUE_PAYMENT_VCH_TYPE)
    const prefix = CHEQUE_PAYMENT_CODE_PREFIX
    const codePrefix = `${prefix}${bookName}`.toUpperCase()
    const rows = await sql`SELECT vch_code FROM voucher_header_tbl WHERE vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND vch_book_id=${bookId}`
    let maxSequence = startNumber - 1
    for (const row of rows) {
      const match = String(row.vch_code || "").toUpperCase().match(new RegExp(`^${codePrefix}([0-9]+)$`))
      if (match) maxSequence = Math.max(maxSequence, Number(match[1]))
    }
    const sequence = maxSequence + 1
    return NextResponse.json({ code: buildVoucherCode(prefix, bookName, sequence) })
  } catch (error) {
    console.error("Error generating cheque payment voucher number:", error)
    return NextResponse.json({ error: "تعذر توليد رقم السند" }, { status: 500 })
  }
}