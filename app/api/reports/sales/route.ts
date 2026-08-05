import sql from "@/lib/database"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const salesData = await sql`
      SELECT 
        DATE_TRUNC('month', order_date) as month,
        COUNT(*) as total_orders,
        SUM(total_amount) as total_sales,
        AVG(total_amount) as avg_order_value
      FROM sales_orders 
      WHERE order_date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', order_date)
      ORDER BY month DESC
    `

    const topCustomers = await sql`
      SELECT 
        name,
        COUNT(*) as order_count,
        SUM(total_amount) as total_spent
      FROM sales_orders
      WHERE order_date >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY name
      ORDER BY total_spent DESC
      LIMIT 10
    `

    const ordersByStatus = await sql`
      SELECT 
        order_status,
        COUNT(*) as count
      FROM sales_orders
      GROUP BY order_status
    `

    return NextResponse.json({
      salesData,
      topCustomers,
      ordersByStatus,
      summary: {
        totalOrders: salesData.reduce((sum, item) => sum + Number(item.total_orders), 0),
        totalRevenue: salesData.reduce((sum, item) => sum + Number(item.total_sales), 0),
        avgOrderValue:
          salesData.length > 0
            ? salesData.reduce((sum, item) => sum + Number(item.avg_order_value), 0) / salesData.length
            : 0,
      },
    })
  } catch (error) {
    console.error("Error fetching sales reports:", error)
    return NextResponse.json({ error: "Failed to fetch sales reports" }, { status: 500 })
  }
}
