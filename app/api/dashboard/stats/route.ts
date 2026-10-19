import { NextResponse } from "next/server"
import sql from "@/lib/database"

export async function GET() {
  try {
    const [stats] = await sql`
      SELECT
        (
          SELECT json_build_object(
            'total_sales_orders', COUNT(*)::text,
            'pending_sales', COUNT(*) FILTER (WHERE order_status = 'pending')::text,
            'approved_sales', COUNT(*) FILTER (WHERE order_status = 'approved')::text,
            'completed_sales', COUNT(*) FILTER (WHERE order_status = 'completed')::text,
            'total_sales_value', COALESCE(SUM(total_amount), 0)::text
          )
          FROM sales_orders
        ) AS sales_stats,
        (
          SELECT json_build_object(
            'total_purchase_orders', COUNT(*)::text,
            'pending_purchases', COUNT(*) FILTER (WHERE workflow_status = 'pending')::text,
            'approved_purchases', COUNT(*) FILTER (WHERE workflow_status = 'approved')::text,
            'completed_purchases', COUNT(*) FILTER (WHERE workflow_status = 'completed')::text,
            'total_purchase_value', COALESCE(SUM(total_amount), 0)::text
          )
          FROM purchase_orders
        ) AS purchase_stats,
        (
          SELECT COALESCE(json_agg(row_to_json(pending)), '[]'::json)
          FROM (
            SELECT order_number, customer_name, total_amount::text AS total_amount, order_date::text AS order_date,
              order_status AS workflow_status
            FROM sales_orders
            WHERE order_status IN ('pending', 'approved')
            ORDER BY order_date DESC
            LIMIT 10
          ) AS pending
        ) AS pending_sales_orders,
        (
          SELECT COALESCE(json_agg(row_to_json(pending)), '[]'::json)
          FROM (
            SELECT order_number, supplier_name, total_amount::text AS total_amount, order_date::text AS order_date,
              workflow_status
            FROM purchase_orders
            WHERE workflow_status IN ('pending', 'approved')
            ORDER BY order_date DESC
            LIMIT 10
          ) AS pending
        ) AS pending_purchase_orders
    `

    return NextResponse.json({
      salesStats: stats.sales_stats,
      purchaseStats: stats.purchase_stats,
      pendingSalesOrders: stats.pending_sales_orders,
      pendingPurchaseOrders: stats.pending_purchase_orders,
    })
  } catch (error) {
    console.error("Error fetching dashboard stats:", error)
    console.error("Error connecting to database:", error.message)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
