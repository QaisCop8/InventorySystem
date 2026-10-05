import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderReadColumns } from "@/lib/order-schema"
import { authorizeTransaction } from "@/lib/transaction-permissions"

const ORDER_SOURCE_VOUCHER_TYPE = 3
const SALES_INVOICE_TYPE = 12
const PURCHASE_INVOICE_TYPE = 17

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderType = Number(searchParams.get("order_type") || 1)
    const customerId = Number(searchParams.get("customer_id") || 0)
    const supplierId = Number(searchParams.get("supplier_id") || 0)
    const branchId = Number(searchParams.get("branch_id") || 0)

    if (orderType === 1 && !customerId) {
      return NextResponse.json({ error: "معرف العميل مطلوب" }, { status: 400 })
    }
    if (orderType === 2 && !supplierId) {
      return NextResponse.json({ error: "معرف المورد مطلوب" }, { status: 400 })
    }

    if (![1,2].includes(orderType)) return NextResponse.json({error:"Invalid order type"},{status:400})
    await ensureOrderReadColumns()
    const access=await authorizeTransaction(request,orderType===2?"purchase_invoice":"sales_invoice","view",branchId||undefined)
    if(!access.ok)return access.response
    const accountId=orderType===2?supplierId:customerId,invoiceType=orderType===2?PURCHASE_INVOICE_TYPE:SALES_INVOICE_TYPE
    const rows = await sql`
          SELECT o.id, o.order_number, o.order_date, o.total_amount AS amount, o.order_status,
                 o.discount_type, o.discount_amount, o.vat_percent, o.currency_id, o.exchange_rate,
                 COALESCE(NULLIF(o.customer_name, ''), c.name, '') AS account_name,
                 COALESCE(cur.currency_code, '') AS currency_code
          FROM orders o
          INNER JOIN account_tbl c ON c.id = o.customer_id
          INNER JOIN currency cur ON cur.id = o.currency_id
          WHERE COALESCE(o.deleted, false) = false
            AND o.order_type = ${orderType}
            AND o.customer_id = ${accountId}
            AND o.branch_id = ANY(${access.branchIds}::int[])
            AND o.order_status IN (2, 3, 4)
            AND EXISTS (
              SELECT 1
              FROM order_items oi
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE(SUM(vi.qnty), 0) AS invoiced_quantity,
                  COALESCE(SUM(vi.bonus), 0) AS invoiced_bonus
                FROM voucher_items_tbl vi
                JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                WHERE vh.vch_type = ${invoiceType}
                  AND vh.status <> 3
                  AND vi.order_item_id = oi.id
                  AND vi.delivery_item_id IS NULL
              ) inv ON TRUE
              WHERE oi.order_id = o.id
                AND oi.item_status IN (2, 3, 4)
                AND (
                  COALESCE(oi.quantity, 0) > COALESCE(inv.invoiced_quantity, 0)
                  OR COALESCE(oi.bonus, 0) > COALESCE(inv.invoiced_bonus, 0)
                )
            )
          ORDER BY o.order_date DESC, o.id DESC
        `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching order list for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب قائمة الطلبات" }, { status: 500 })
  }
}
