import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSalesVoucherNumberSettings, buildVoucherCode, resolveVoucherBookName, ensureTables, DELIVERY_SELL_VCH_TYPE } from "../_lib"

// نفس منطق app/api/stock-vouchers/resolve-code/route.ts تماماً (انظر شرحه هناك) لكن بإعدادات
// ترقيم سندات المبيعات الثمانية.
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || DELIVERY_SELL_VCH_TYPE)
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
    const settings = await getSalesVoucherNumberSettings(request.url, vchType)
    let prefix = typedPrefix.toUpperCase()
    const configuredPrefix = settings.prefix.toUpperCase()

    // "raw" قد يكون كوداً مكتملاً مسبقاً وليس اختصاراً مكتوباً يدوياً — البادئة الصحيحة دوماً هي
    // بادئة الإعدادات الحالية (لا ما كتبه المستخدم)، وما تبقى بعد نزع البادئة/رمز الدفتر المكرَّرين
    // من المكتوب يُستخدَم كبادئة مستخدم اختيارية بحرف واحد (انظر نفس المنطق في stock-vouchers/
    // resolve-code وreceipts/resolve-code).
    const upperBookName = bookName.toUpperCase()
    if (prefix.startsWith(configuredPrefix)) {
      prefix = prefix.slice(configuredPrefix.length)
    }
    if (prefix.startsWith(upperBookName)) {
      prefix = prefix.slice(upperBookName.length)
    }
    while (upperBookName && prefix.length > upperBookName.length && prefix.endsWith(upperBookName)) {
      prefix = prefix.slice(0, prefix.length - upperBookName.length)
    }

    const code = buildVoucherCode(configuredPrefix, bookName, Number(typedNumber), prefix)

    const rows = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
    const existingId = rows[0]?.id ?? null

    return NextResponse.json({ code, exists: Boolean(existingId), id: existingId })
  } catch (error) {
    console.error("Error resolving sales voucher code:", error)
    return NextResponse.json({ error: "Failed to resolve voucher code" }, { status: 500 })
  }
}
