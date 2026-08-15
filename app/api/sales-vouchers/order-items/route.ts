import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

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

    if (orderType === 1) {
      const orders = await sql`
        SELECT o.*, COALESCE(c.account_name, '') AS account_name,
               COALESCE(cur.currency_code, '') AS currency_code
        FROM orders o
        LEFT JOIN accounts c ON c.id = o.customer_id
        LEFT JOIN currency cur ON cur.id = o.currency_id
        WHERE o.id = ${orderId}
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
               u.unit_name AS unit,
               oi.price AS unit_price,
               oi.discount AS discount_percent,
               COALESCE(oi.bonus, 0) AS bonus_quantity,
               oi.quantity,
               oi.quantity AS remaining_quantity_raw,
               COALESCE(inv.invoiced_quantity, 0) AS sent_quantity,
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
          WHERE vh.vch_type = ${SALES_INVOICE_TYPE}
            AND vh.status = 2
            AND vi.order_item_id = oi.id
        ) inv ON TRUE
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN units u ON u.id = oi.unit_id
        LEFT JOIN warehouses wh ON wh.id = oi.store_id
        WHERE oi.order_id = ${orderId}
          AND (
            oi.quantity > COALESCE(inv.invoiced_quantity, 0)
            OR COALESCE(oi.bonus, 0) > COALESCE(inv.invoiced_bonus, 0)
          )
        ORDER BY oi.id
      `

      return NextResponse.json({ order: orders[0], items })
    }

    if (orderType === 2) {
      const orders = await sql`
        SELECT po.*, COALESCE(s.account_name, '') AS account_name
        FROM purchase_orders po
        LEFT JOIN accounts s ON s.id = po.supplier_id
        WHERE po.id = ${orderId}
        LIMIT 1
      `
      if (!orders.length) {
        return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
      }

      const items = await sql`
        SELECT poi.id AS order_item_id,
               poi.id,
               poi.purchase_order_id AS order_id,
               poi.product_id,
               COALESCE(p.product_code, '') AS product_code,
               COALESCE(p.product_name, '') AS product_name,
               COALESCE(p.product_name, '') AS item_name,
               COALESCE(p.product_code, '') AS product_code_alias,
               COALESCE(p.product_name, '') AS current_product_name,
               poi.barcode,
               NULL::integer AS warehouse_id,
               NULL::integer AS store_id,
               '' AS warehouse_name,
               COALESCE(poi.unit, '') AS unit,
               poi.unit_price,
               COALESCE(poi.discount, 0) AS discount_percent,
               COALESCE(poi.bonus_quantity, 0) AS bonus_quantity,
               poi.quantity,
               COALESCE(inv.invoiced_quantity, 0) AS sent_quantity,
               COALESCE(inv.invoiced_bonus, 0) AS sent_bonus,
               GREATEST(poi.quantity - COALESCE(inv.invoiced_quantity, 0), 0) AS remaining_quantity,
               GREATEST(COALESCE(poi.bonus_quantity, 0) - COALESCE(inv.invoiced_bonus, 0), 0) AS remaining_bonus
        FROM purchase_order_items poi
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(vi.qnty), 0) AS invoiced_quantity,
            COALESCE(SUM(vi.bonus), 0) AS invoiced_bonus
          FROM voucher_items_tbl vi
          JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
          WHERE vh.vch_type = ${PURCHASE_INVOICE_TYPE}
            AND vh.status = 2
            AND vi.order_item_id = poi.id
        ) inv ON TRUE
        LEFT JOIN products p ON p.id = poi.product_id
        WHERE poi.purchase_order_id = ${orderId}
          AND (
            poi.quantity > COALESCE(inv.invoiced_quantity, 0)
            OR COALESCE(poi.bonus_quantity, 0) > COALESCE(inv.invoiced_bonus, 0)
          )
        ORDER BY poi.id
      `

      return NextResponse.json({ order: orders[0], items })
    }

    return NextResponse.json({ error: "نوع الطلبية غير مدعوم" }, { status: 400 })
  } catch (error) {
    console.error("Error fetching order items for invoice source:", error)
    return NextResponse.json({ error: "فشل في جلب عناصر الطلب" }, { status: 500 })
  }
}
