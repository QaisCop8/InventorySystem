import { type NextRequest, NextResponse } from "next/server"
import { parseTypedVoucherCode } from "@/lib/voucher-code"
import { resolveBranchSymbol } from "@/lib/branch-symbol"
import sql from "@/lib/database"
import { ensureTables, getVoucherNumberSettings, buildVoucherCode, resolveVoucherBookName } from "../_lib"
import { authorizeStoredVoucher } from "@/lib/transaction-permissions"

// عند الخروج من حقل رقم السند بعد كتابة يدوية (مثال: "R1" أو "1" فقط): يُحلَّل النص إلى
// بادئة حروف اختيارية + رقم، ثم يُعاد بناؤه دائماً بصيغة {بادئة}{رمز الدفتر}{رقم مبطّن 5 خانات}
// — البادئة المكتوبة إن وُجدت، وإلا بادئة إعدادات النظام. ثم يتحقق إن كان الكود الناتج
// لسند محفوظ فعلاً (ليُعرض) أو غير موجود (ليُهيَّأ سند جديد بهذا الرقم).
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const vchType = Number(searchParams.get("vch_type") || 8)
    const vchBookId = searchParams.get("vch_book_id") ? Number(searchParams.get("vch_book_id")) : null
    const raw = (searchParams.get("raw") || "").trim()
    const branchId = Number(searchParams.get("branch_id")) || null

    if (!raw) return NextResponse.json({ code: "", exists: false })

    // A complete stored code takes precedence over the selected book/settings,
    // including cancelled vouchers, which remain available for inspection.
    const exact = (await sql`SELECT id,vch_code,status FROM voucher_header_tbl WHERE vch_type=${vchType} AND UPPER(vch_code)=${raw.toUpperCase()} LIMIT 1`)[0]
    if (exact) {
      const authorization = await authorizeStoredVoucher(request, Number(exact.id), "view")
      if (!authorization.ok) return authorization.response
      return NextResponse.json({ code: exact.vch_code, exists: true, id: Number(exact.id), status: Number(exact.status) })
    }

    const bookName = await resolveVoucherBookName(vchBookId, branchId)
    if (!bookName) {
      return NextResponse.json({ error: "يجب اختيار دفتر السندات أولاً" }, { status: 400 })
    }

    const settings = await getVoucherNumberSettings(request.url, vchType)
    const configuredPrefix = settings.prefix.toUpperCase()
    // الجزء الرئيسي (بادئة السند + رمز الفرع + رمز الدفتر) يُعاد بناؤه دوماً من الإعدادات والفرع والدفتر الحاليين
    const parsed = parseTypedVoucherCode(raw, configuredPrefix, bookName, await resolveBranchSymbol(branchId))
    if (!parsed) {
      return NextResponse.json({ error: "رقم السند غير صحيح" }, { status: 400 })
    }

    const code = buildVoucherCode(configuredPrefix, bookName, parsed.sequence, parsed.userPrefix)

    const rows = await sql`SELECT id,status FROM voucher_header_tbl WHERE vch_type = ${vchType} AND vch_code = ${code}`
    const existingId = rows[0]?.id ?? null
    if (existingId) {
      const authorization = await authorizeStoredVoucher(request, Number(existingId), "view")
      if (!authorization.ok) return authorization.response
    }

    return NextResponse.json({ code, exists: Boolean(existingId), id: existingId, status: rows[0] ? Number(rows[0].status) : null })
  } catch (error) {
    console.error("Error resolving voucher code:", error)
    return NextResponse.json({ error: "Failed to resolve voucher code" }, { status: 500 })
  }
}
