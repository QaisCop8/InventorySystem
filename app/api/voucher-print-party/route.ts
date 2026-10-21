import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureCustomerCompatibilityColumns } from "@/app/api/customers/_lib"

// "المشتغل المرخص للعميل" لطباعة سند: الرقم الضريبي لعميل/مورد السند (voucher_header_tbl.account_id ⇐ customers).
// يُطلب فقط إن فُعّل "طباعة المشتغل المرخص للعميل" في إعدادات طباعة نوع السند (lib/voucher-print/print.ts).
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    const voucherId = Number(params.get("voucher_id")) || 0
    const vchType = Number(params.get("vch_type")) || 0
    const vchCode = String(params.get("vch_code") || "").trim().slice(0, 60)
    if (!voucherId && !(vchType > 0 && vchCode)) return NextResponse.json({ tax_number: "" })
    await ensureCustomerCompatibilityColumns()
    const row = (await sql`
      SELECT NULLIF(TRIM(c.tax_number), '') AS tax_number
      FROM voucher_header_tbl vh
      JOIN customers c ON c.account_id = vh.account_id AND COALESCE(c.isdeleted, false) = false
      WHERE ${voucherId > 0} AND vh.id = ${voucherId}
         OR ${voucherId <= 0} AND vh.vch_type = ${vchType} AND vh.vch_code = ${vchCode}
      ORDER BY vh.id DESC, c.id DESC
      LIMIT 1
    `)[0] as any
    return NextResponse.json({ tax_number: row?.tax_number || "" })
  } catch (error) {
    console.error("[voucher-print-party] GET failed", error)
    return NextResponse.json({ tax_number: "" })
  }
}
