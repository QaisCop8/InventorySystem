import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const ORDER_SOURCE_VOUCHER_TYPE = 3

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderType = Number(searchParams.get("order_type") || 1)
    const customerId = Number(searchParams.get("customer_id") || 0)
    const supplierId = Number(searchParams.get("supplier_id") || 0)

    if (orderType === 1 && !customerId) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }
    if (orderType === 2 && !supplierId) {
      return NextResponse.json({ error: "معرف المورد مطلوب" }, { status: 400 })
    }

    const rows = orderType === 1
      ? await sql`
          SELECT o.id, o.order_number, o.order_date, o.total_amount AS amount, o.order_status,
                 o.discount_type, o.discount_amount, o.vat_percent, o.currency_id, o.exchange_rate,
                 COALESCE(c.name, '') AS account_name,
                 COALESCE(cur.currency_code, '') AS currency_code
          FROM orders o
          LEFT JOIN customers c ON c.id = o.customer_id
          LEFT JOIN currency cur ON cur.id = o.currency_id
          WHERE o.deleted = false
            AND o.order_type = 1
            AND o.customer_id = ${customerId}
            AND o.order_status != 'cancelled'
            AND o.order_status IN ('approved', 'completed')
            AND NOT EXISTS (
              SELECT 1
              FROM voucher_header_tbl inv
              WHERE inv.vch_type IN (12, 17)
                AND inv.invoice_source_type = 3
                AND inv.source_voucher_id = o.id
                AND inv.source_voucher_type = ${ORDER_SOURCE_VOUCHER_TYPE}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM voucher_items_tbl vi
              WHERE vi.source_voucher_id = o.id
                AND vi.source_voucher_type = ${ORDER_SOURCE_VOUCHER_TYPE}
            )
          ORDER BY o.order_date DESC, o.id DESC
        `
      : await sql`
          SELECT po.id, po.order_number, po.order_date, po.total_amount AS amount, po.workflow_status AS order_status,
                 po.discount_type, po.discount_amount, po.vat_amount AS vat_percent, po.currency_id, po.exchange_rate,
                 COALESCE(po.currency_code, cur.currency_code, '') AS currency_code,
                 COALESCE(s.supplier_name, '') AS account_name
          FROM purchase_orders po
          LEFT JOIN suppliers s ON s.id = po.supplier_id
          LEFT JOIN currency cur ON cur.id = po.currency_id
          WHERE po.supplier_id = ${supplierId}
            AND COALESCE(po.workflow_status, '') != 'cancelled'
            AND NOT EXISTS (
              SELECT 1
              FROM voucher_header_tbl inv
              WHERE inv.vch_type IN (12, 17)
                AND inv.invoice_source_type = 3
                AND inv.source_voucher_id = po.id
                AND inv.source_voucher_type = ${ORDER_SOURCE_VOUCHER_TYPE}
            )
            AND NOT EXISTS (
              SELECT 1
              FROM voucher_items_tbl vi
              WHERE vi.source_voucher_id = po.id
                AND vi.source_voucher_type = ${ORDER_SOURCE_VOUCHER_TYPE}
            )
          ORDER BY po.order_date DESC, po.id DESC
        `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching order list for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب قائمة الطلبات" }, { status: 500 })
  }
}
