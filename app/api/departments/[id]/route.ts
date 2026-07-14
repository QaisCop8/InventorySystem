import { NextResponse } from "next/server"
import { sql } from "@/lib/database"

export async function GET() {
  try {
    const [salesStats] = await sql`
      SELECT 
        COUNT(*) as total_sales_orders,
        COUNT(CASE WHEN order_status = 'pending' THEN 1 END) as pending_sales,
        COUNT(CASE WHEN order_status = 'approved' THEN 1 END) as approved_sales,
        COUNT(CASE WHEN order_status = 'completed' THEN 1 END) as completed_sales,
        COALESCE(SUM(total_amount), 0) as total_sales_value
      FROM sales_orders
    `

    const [purchaseStats] = await sql`
      SELECT 
        COUNT(*) as total_purchase_orders,
        COUNT(CASE WHEN workflow_status = 'pending' THEN 1 END) as pending_purchases,
        COUNT(CASE WHEN workflow_status = 'approved' THEN 1 END) as approved_purchases,
        COUNT(CASE WHEN workflow_status = 'completed' THEN 1 END) as completed_purchases,
        COALESCE(SUM(total_amount), 0) as total_purchase_value
      FROM purchase_orders
    `

    const pendingSalesOrders = await sql`
      SELECT order_number, customer_name, total_amount, order_date, order_status as workflow_status
      FROM sales_orders 
      WHERE order_status IN ('pending', 'approved')
      ORDER BY order_date DESC
      LIMIT 10
    `

    const pendingPurchaseOrders = await sql`
      SELECT order_number, supplier_name, total_amount, order_date, workflow_status
      FROM purchase_orders 
      WHERE workflow_status IN ('pending', 'approved')
      ORDER BY order_date DESC
      LIMIT 10
    `

    return NextResponse.json({
      salesStats,
      purchaseStats,
      pendingSalesOrders,
      pendingPurchaseOrders,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    console.error("Error connecting to database:", error.message)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}

