import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

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

    const rows = orderType === 1
      ? await sql`
          SELECT o.id, o.order_number, o.order_date, o.total_amount AS amount, o.order_status,
                 o.discount_type, o.discount_amount, o.vat_percent, o.currency_id, o.exchange_rate,
                 COALESCE(NULLIF(o.customer_name, ''), c.name, '') AS account_name,
                 COALESCE(cur.currency_code, '') AS currency_code
          FROM orders o
          INNER JOIN account_tbl c ON c.id = o.customer_id
          INNER JOIN currency cur ON cur.id = o.currency_id
          WHERE COALESCE(o.deleted, false) = false
            AND o.order_type = 1
            AND o.customer_id = ${customerId}
            AND (${branchId} = 0 OR o.branch_id = ${branchId})
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
                WHERE vh.vch_type = ${SALES_INVOICE_TYPE}
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
      : await sql`
          SELECT po.id, po.order_number, po.order_date, po.total_amount AS amount, po.workflow_status AS order_status,
                 po.discount_type, po.discount_amount, po.vat_amount AS vat_percent, po.currency_id, po.exchange_rate,
                 COALESCE(po.currency_code, cur.currency_code, '') AS currency_code,
                 COALESCE(s.name, '') AS account_name
          FROM orders po
          INNER JOIN account_tbl s ON s.id = po.supplier_id
          LEFT JOIN currency cur ON cur.id = po.currency_id
          WHERE po.supplier_id = ${supplierId}
            AND (${branchId} = 0 OR po.branch_id = ${branchId})
            AND COALESCE(po.workflow_status, '') != 'cancelled'
            AND EXISTS (
              SELECT 1
              FROM order_items poi
              LEFT JOIN LATERAL (
                SELECT
                  COALESCE(SUM(vi.qnty), 0) AS invoiced_quantity,
                  COALESCE(SUM(vi.bonus), 0) AS invoiced_bonus
                FROM voucher_items_tbl vi
                JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
                WHERE vh.vch_type = ${PURCHASE_INVOICE_TYPE}
                  AND vh.status <> 3
                  AND vi.order_item_id = poi.id
              ) inv ON TRUE
              WHERE poi.order_id = po.id
                AND (
                  poi.quantity > COALESCE(inv.invoiced_quantity, 0)
                  OR COALESCE(poi.bonus, poi.quantity, 0) > COALESCE(inv.invoiced_bonus, 0)
                )
            )
          ORDER BY po.order_date DESC, po.id DESC
        `

    return NextResponse.json(rows)
  } catch (error) {
    console.error("Error fetching order list for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب قائمة الطلبات" }, { status: 500 })
  }
}
