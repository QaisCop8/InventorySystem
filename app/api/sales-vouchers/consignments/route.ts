import { type NextRequest, NextResponse } from "next/server"
import { authorizeTransaction, transactionFamilyForVoucherType } from "@/lib/transaction-permissions"
import { consignmentLines, consignmentReturn, openConsignments } from "@/lib/consignment"
import sql from "@/lib/database"
import { ensureTables } from "../_lib"

/**
 * ارساليات برسم البيع المفتوحة (مرحّلة، لها متبقٍ، بلا مرتجع) لنافذة الاختيار في:
 *  فاتورة المبيعات (for=12، نوع الفاتورة "من ارسالية برسم البيع") ومرتجع ارسالية برسم البيع (for=15).
 * ?id=… يعيد أسطر ارسالية واحدة بالمتبقي.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const params = new URL(request.url).searchParams
    const forType = Number(params.get("for") || 12)
    const family = transactionFamilyForVoucherType(forType)
    if (!family) return NextResponse.json({ error: "نوع السند غير صالح" }, { status: 400 })
    const branchId = Number(params.get("branch_id") || 0) || undefined
    const access = await authorizeTransaction(request, family, "view", branchId)
    if (!access.ok) return access.response

    const id = Number(params.get("id") || 0)
    if (id > 0) {
      const header = (await sql`
        SELECT vh.id, vh.vch_code, vh.vch_date, vh.vch_type, vh.status, vh.branch_id, vh.salesman_id, vh.currency_id, vh.rate, s.name AS salesman_name
        FROM voucher_header_tbl vh LEFT JOIN salesmen s ON s.id = vh.salesman_id WHERE vh.id = ${id}
      `)[0]
      if (!header || Number(header.vch_type) !== 14) return NextResponse.json({ error: "الارسالية غير موجودة" }, { status: 404 })
      if (Number(header.status) !== 2) return NextResponse.json({ error: "الارسالية غير مرحّلة" }, { status: 400 })
      if (!access.branchIds.includes(Number(header.branch_id))) return NextResponse.json({ error: "لا يوجد لديك صلاحية على فرع هذه الارسالية" }, { status: 403 })
      const existingReturn = await consignmentReturn(id)
      if (existingReturn) return NextResponse.json({ error: `تم عمل مرتجع (${existingReturn.vch_code}) لهذه الارسالية` }, { status: 400 })
      const lines = (await consignmentLines(id)).filter((line) => line.remaining > 1e-9)
      if (!lines.length) return NextResponse.json({ error: "لا يوجد متبقٍ في هذه الارسالية — تمت فوترتها بالكامل" }, { status: 400 })
      return NextResponse.json({ header, lines })
    }

    const rows = await openConsignments({
      branchIds: access.branchIds,
      salesmanId: Number(params.get("salesman_id") || 0) || null,
      search: params.get("search") || "",
    })
    return NextResponse.json(rows)
  } catch (error: any) {
    console.error("Error loading consignments:", error)
    return NextResponse.json({ error: error?.message || "فشل في جلب ارساليات برسم البيع" }, { status: 500 })
  }
}
