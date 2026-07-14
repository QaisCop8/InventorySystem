import { NextResponse } from "next/server"
import { getCustomerSession } from "@/lib/customer-auth"
import { sql } from "@vercel/postgres"

export async function GET() {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const customerId = session.customer.id

    // Get order statistics
    const ordersStats = await sql`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status IN ('pending', 'confirmed', 'preparing', 'ready')) as pending_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders
      FROM sales_orders
      WHERE customer_id = ${customerId}
    `

    // Get customer balance
    const balanceResult = await sql`
      SELECT balance FROM customers WHERE id = ${customerId}
    `

    // Get recent orders
    const recentOrders = await sql`
      SELECT id, order_date, total_amount, status
      FROM sales_orders
      WHERE customer_id = ${customerId}
      ORDER BY order_date DESC
      LIMIT 5
    `

    return NextResponse.json({
      totalOrders: Number.parseInt(ordersStats.rows[0].total_orders),
      pendingOrders: Number.parseInt(ordersStats.rows[0].pending_orders),
      completedOrders: Number.parseInt(ordersStats.rows[0].completed_orders),
      currentBalance: Number.parseFloat(balanceResult.rows[0]?.balance ?? 0),
      recentOrders: recentOrders.rows,
    })
  } catch (error) {
    console.error("Dashboard error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل البيانات" }, { status: 500 })
  }
}

