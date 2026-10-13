import { type NextRequest, NextResponse } from "next/server"
import { parseTypedVoucherCode } from "@/lib/voucher-code"
import { resolveBranchSymbol, requestBranchId } from "@/lib/branch-symbol"
import sql from "@/lib/database"
import { ensureTables, getCreditNoteNumberSettings, buildVoucherCode, resolveVoucherBookName } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 10)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null
    const raw = (searchParams.get("raw") || "").trim()
    const branchId = await requestBranchId(request, searchParams.get("branch_id"))

    if (!raw) return NextResponse.json({ code: "", exists: false })

    const bookName = await resolveVoucherBookName(vchBookId, branchId)
    if (!bookName) {
      return NextResponse.json({ error: "يجب اختيار دفتر السندات أولاً" }, { status: 400 })
    }

    const settings = await getCreditNoteNumberSettings(request.url, vchType)
    const configuredPrefix = settings.prefix.toUpperCase()
    // الجزء الرئيسي (بادئة السند + رمز الفرع + رمز الدفتر) يُعاد بناؤه دوماً من الإعدادات والفرع والدفتر الحاليين
    const parsed = parseTypedVoucherCode(raw, configuredPrefix, bookName, await resolveBranchSymbol(branchId))
    if (!parsed) {
      return NextResponse.json({ error: "رقم السند غير صحيح" }, { status: 400 })
    }

    const code = buildVoucherCode(configuredPrefix, bookName, parsed.sequence, parsed.userPrefix)

    const rows = await sql`SELECT id FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
    const existingId = rows[0]?.id ?? null

    return NextResponse.json({ code, exists: Boolean(existingId), id: existingId })
  } catch (error) {
    console.error("Error resolving credit/debit note code:", error)
    return NextResponse.json({ error: "Failed to resolve credit/debit note code" }, { status: 500 })
  }
}
