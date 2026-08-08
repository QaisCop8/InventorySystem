import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

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
        SELECT o.*, COALESCE(c.name, '') AS account_name,
               COALESCE(cur.currency_code, '') AS currency_code
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN currency cur ON cur.id = o.currency_id
        WHERE o.id = ${orderId}
        LIMIT 1
      `
      if (!orders.length) {
        return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
      }

      const items = await sql`
        SELECT oi.*, p.product_code,
               COALESCE(oi.product_name, p.product_name, '') AS product_name,
               p.barcode,
               COALESCE(u.unit_name, p.main_unit, '') AS unit,
               oi.price AS unit_price,
               oi.discount AS discount_percent,
               oi.bonus AS bonus_quantity
        FROM order_items oi
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN units u ON u.id = oi.unit_id
        WHERE oi.order_id = ${orderId}
        ORDER BY oi.id
      `

      return NextResponse.json({ order: orders[0], items })
    }

    if (orderType === 2) {
      const orders = await sql`
        SELECT po.*, COALESCE(s.supplier_name, '') AS account_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ${orderId}
        LIMIT 1
      `
      if (!orders.length) {
        return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
      }

      const items = await sql`
        SELECT poi.*, p.product_code, p.product_name, p.barcode, p.main_unit AS unit
        FROM purchase_order_items poi
        LEFT JOIN products p ON p.id = poi.product_id
        WHERE poi.purchase_order_id = ${orderId}
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
