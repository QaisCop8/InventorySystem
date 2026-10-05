import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderReadColumns } from "@/lib/order-schema"
import { authorizeTransaction } from "@/lib/transaction-permissions"

const SALES_INVOICE_TYPE = 12
const PURCHASE_INVOICE_TYPE = 17

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = Number(searchParams.get("order_id") || 0)
    const orderType = Number(searchParams.get("order_type") || 1)

    if (!orderId) {
      return NextResponse.json({ error: "معرف الطلبية مطلوب" }, { status: 400 })
    }

    if ([1,2].includes(orderType)) {
      await ensureOrderReadColumns()
      const access=await authorizeTransaction(request,orderType===2?"purchase_invoice":"sales_invoice","view",searchParams.get("branch_id"))
      if(!access.ok)return access.response
      const invoiceType=orderType===2?PURCHASE_INVOICE_TYPE:SALES_INVOICE_TYPE
      const orders = await sql`
        SELECT o.*, COALESCE(NULLIF(o.customer_name, ''), c.name, '') AS account_name,
               COALESCE(cur.currency_code, '') AS currency_code
        FROM orders o
        INNER JOIN account_tbl c ON c.id = o.customer_id
        LEFT JOIN currency cur ON cur.id = o.currency_id
        WHERE o.id = ${orderId} AND o.order_type=${orderType} AND COALESCE(o.deleted,false)=false AND o.order_status IN(2,3,4) AND o.branch_id=ANY(${access.branchIds}::int[])
        LIMIT 1
      `
      if (!orders.length) {
        return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
      }

      const items = await sql`
        SELECT oi.id AS order_item_id,
               oi.id,
               oi.order_id,
               oi.product_id,
               COALESCE(p.product_code, '') AS product_code,
               COALESCE(p.product_name, '') AS product_name,
               COALESCE(p.product_name, '') AS item_name,
               COALESCE(p.product_code, '') AS product_code_alias,
               COALESCE(p.product_name, '') AS current_product_name,
               oi.barcode,
               oi.store_id AS warehouse_id,
               oi.store_id AS store_id,
               COALESCE(wh.warehouse_name, '') AS warehouse_name,
               oi.unit_id,
               u.unit_name AS unit,
               oi.price AS unit_price,
               oi.discount AS discount_percent,
               COALESCE(oi.bonus, 0) AS bonus_quantity,
               oi.quantity,
               oi.quantity AS remaining_quantity_raw,
               COALESCE(inv.invoiced_quantity, 0) + COALESCE(inv.invoiced_bonus, 0) AS sent_quantity,
               COALESCE(inv.invoiced_bonus, 0) AS sent_bonus,
               GREATEST(oi.quantity - COALESCE(inv.invoiced_quantity, 0), 0) AS remaining_quantity,
               GREATEST(COALESCE(oi.bonus, 0) - COALESCE(inv.invoiced_bonus, 0), 0) AS remaining_bonus
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
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN units u ON u.id = oi.unit_id
        LEFT JOIN warehouses wh ON wh.id = oi.store_id
        WHERE oi.order_id = ${orderId}
          AND oi.item_status IN (2, 3, 4)
          AND (
            COALESCE(oi.quantity, 0) > COALESCE(inv.invoiced_quantity, 0)
            OR COALESCE(oi.bonus, 0) > COALESCE(inv.invoiced_bonus, 0)
          )
        ORDER BY oi.id
      `

      return NextResponse.json({ order: orders[0], items })
    }

    return NextResponse.json({ error: "نوع الطلبية غير مدعوم" }, { status: 400 })
  } catch (error) {
    console.error("Error fetching order items for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب عناصر الطلب" }, { status: 500 })
  }
}
