import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, getCreditNoteNumberSettings, buildVoucherCode, resolveVoucherBookName } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 10)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null
    const raw = (searchParams.get("raw") || "").trim()

    if (!raw) return NextResponse.json({ code: "", exists: false })

    const bookName = await resolveVoucherBookName(vchBookId)
    if (!bookName) {
      return NextResponse.json({ error: "يجب اختيار دفتر السندات أولاً" }, { status: 400 })
    }

    const match = raw.match(/^([A-Za-z]*)(\d+)$/)
    if (!match) {
      return NextResponse.json({ error: "رقم السند غير صحيح" }, { status: 400 })
    }

    const [, typedPrefix, typedNumber] = match
    let prefix = typedPrefix.toUpperCase()

    const upperBookName = bookName.toUpperCase()
    while (upperBookName && prefix.length > upperBookName.length && prefix.endsWith(upperBookName)) {
      prefix = prefix.slice(0, prefix.length - upperBookName.length)
    }

    if (!prefix) {
      const settings = await getCreditNoteNumberSettings(request.url, vchType)
      prefix = settings.prefix
    }

    const code = buildVoucherCode(prefix, bookName, Number(typedNumber))

    const rows = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
    const existingId = rows[0]?.id ?? null

    return NextResponse.json({ code, exists: Boolean(existingId), id: existingId })
  } catch (error) {
    console.error("Error resolving credit/debit note code:", error)
    return NextResponse.json({ error: "Failed to resolve credit/debit note code" }, { status: 500 })
  }
}
