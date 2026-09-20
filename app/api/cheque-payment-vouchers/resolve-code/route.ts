import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { authorizeStoredVoucher } from "@/lib/transaction-permissions"
import { buildVoucherCode, ensureTables, getVoucherNumberSettings, resolveVoucherBookName } from "@/app/api/receipts/_lib"
import { CHEQUE_PAYMENT_CODE_PREFIX, CHEQUE_PAYMENT_VCH_TYPE, ensureChequePaymentTables } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    await ensureChequePaymentTables()
    const raw = (request.nextUrl.searchParams.get("raw") || "").trim()
    const bookId = Number(request.nextUrl.searchParams.get("vch_book_id")) || null
    if (!raw) return NextResponse.json({ code: "", exists: false })

    const exact = (await sql`SELECT id,vch_code,status FROM voucher_header_tbl WHERE vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND UPPER(vch_code)=${raw.toUpperCase()} LIMIT 1`)[0]
    if (exact) {
      const authorization = await authorizeStoredVoucher(request, Number(exact.id), "view")
      if (!authorization.ok) return authorization.response
      return NextResponse.json({ code: exact.vch_code, exists: true, id: Number(exact.id), status: Number(exact.status) })
    }

    const bookName = await resolveVoucherBookName(bookId)
    if (!bookName) return NextResponse.json({ error: "يجب اختيار دفتر السندات أولاً" }, { status: 400 })
    const match = raw.match(/^([A-Za-z]*)(\d+)$/)
    if (!match) return NextResponse.json({ error: "رقم السند غير صحيح" }, { status: 400 })
    const [, typedPrefix, typedNumber] = match
    let prefix = typedPrefix.toUpperCase()
    const configuredPrefix = CHEQUE_PAYMENT_CODE_PREFIX
    const upperBookName = bookName.toUpperCase()
    if (prefix.startsWith(configuredPrefix)) prefix = prefix.slice(configuredPrefix.length)
    if (prefix.startsWith(upperBookName)) prefix = prefix.slice(upperBookName.length)
    const code = buildVoucherCode(configuredPrefix, bookName, Number(typedNumber), prefix)
    const row = (await sql`SELECT id,status FROM voucher_header_tbl WHERE vch_type=${CHEQUE_PAYMENT_VCH_TYPE} AND vch_code=${code}`)[0]
    if (row) {
      const authorization = await authorizeStoredVoucher(request, Number(row.id), "view")
      if (!authorization.ok) return authorization.response
    }
    return NextResponse.json({ code, exists: Boolean(row), id: row?.id || null, status: row ? Number(row.status) : null })
  } catch (error) {
    console.error("Error resolving cheque payment voucher code:", error)
    return NextResponse.json({ error: "تعذر تحديد رقم السند" }, { status: 500 })
  }
}