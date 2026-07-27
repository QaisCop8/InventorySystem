import { NextResponse } from "next/server"
import { getCustomerSession } from "@/lib/customer-auth"
import sql from "@/lib/database"

export async function GET() {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    if (!session.permissions.can_view_orders) {
      return NextResponse.json({ error: "ليس لديك صلاحية لعرض الطلبيات" }, { status: 403 })
    }

    const customerId = session.customer.id

    const result = await sql`
      SELECT id, order_date, total_amount, status, notes
      FROM sales_orders
      WHERE customer_id = ${customerId}
      ORDER BY order_date DESC
    `

    return NextResponse.json({ orders: result.rows })
  } catch (error) {
    console.error("Get customer orders error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الطلبيات" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    if (!session.permissions.can_create_orders) {
      return NextResponse.json({ error: "ليس لديك صلاحية لإنشاء طلبيات" }, { status: 403 })
    }

    const body = await request.json()
    const { items, notes } = body

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "يجب إضافة صنف واحد على الأقل" }, { status: 400 })
    }

    const customerId = session.customer.id

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0)

    // Create order
    const orderResult = await sql`
      INSERT INTO sales_orders (customer_id, order_date, total_amount, status, notes)
      VALUES (${customerId}, CURRENT_DATE, ${totalAmount}, 'pending', ${notes || null})
      RETURNING id
    `

    const orderId = orderResult.rows[0].id

    // Create order items
    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price

      await sql`
        INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price, total_price)
        VALUES (${orderId}, ${item.product_id}, ${item.quantity}, ${item.unit_price}, ${totalPrice})
      `
    }

    return NextResponse.json({ success: true, orderId })
  } catch (error) {
    console.error("Create customer order error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الطلبية" }, { status: 500 })
  }
}
