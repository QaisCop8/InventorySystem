import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables } from "../_lib"

export async function GET(request: NextRequest) {
  try {
    await ensureTables()
    const { searchParams } = new URL(request.url)
    const customerId = Number(searchParams.get("customer_id") || 0)
    const voucherType = Number(searchParams.get("voucher_type") || 0)
    const deliveryTypesParam = searchParams.get("delivery_types") || ""
    const branchId = Number(searchParams.get("branch_id") || 0)

    if (!customerId) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }

    const deliveryTypes = deliveryTypesParam
      ? deliveryTypesParam.split(",").map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : voucherType === 12
      ? [13, 14]
      : voucherType === 17
      ? [18]
      : []

    if (deliveryTypes.length === 0) {
      return NextResponse.json({ error: "نوع الفاتورة غير مدعوم" }, { status: 400 })
    }

    const rows = await sql`
      SELECT DISTINCT vh.id, vh.vch_type, vh.vch_code, vh.vch_date, vh.amount, vh.status,
                      vh.currency_id, vh.rate, vh.discount_type, vh.discount_value,
                      c.currency_code
      FROM voucher_header_tbl vh
      LEFT JOIN currency c ON c.id = vh.currency_id
      JOIN voucher_items_tbl vi ON vi.voucher_id = vh.id
      WHERE vh.status = 2
        AND vh.account_id = ${customerId}
        AND (${branchId} = 0 OR vh.branch_id = ${branchId})
        AND vh.vch_type = ANY(${deliveryTypes})
      AND NOT EXISTS (
          SELECT 1
          FROM voucher_items_tbl inv_item
          JOIN voucher_header_tbl inv ON inv.id = inv_item.voucher_id
          WHERE inv.vch_type IN (12, 17)
            AND inv_item.delivery_item_id IN (
              SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id
            )
        )
      ORDER BY vh.vch_date DESC, vh.id DESC
    `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching delivery list for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب قائمة الإرساليات" }, { status: 500 })
  }
}
