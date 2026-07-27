import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function POST(request: NextRequest) {
  try {
    const { query, orderType = "both" } = await request.json()

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ orders: [] })
    }

    const searchTerm = `%${query.trim()}%`
    const orders = []

    // Search sales orders
    if (orderType === "sales" || orderType === "both") {
      try {
        const salesOrders = await sql`
          SELECT 
            id,
            order_number,
            order_date,
            customer_name,
            total_amount,
            currency_code,
            order_status,
            'sales' as type
          FROM sales_orders 
          WHERE order_number ILIKE ${searchTerm}
             OR customer_name ILIKE ${searchTerm}
             OR notes ILIKE ${searchTerm}
          ORDER BY order_date DESC
          LIMIT 20
        `

        orders.push(
          ...salesOrders.map((order) => ({
            ...order,
            type: "sales",
          })),
        )
      } catch (error) {
        console.error("Error searching sales orders:", error)
      }
    }

    // Search purchase orders
    if (orderType === "purchase" || orderType === "both") {
      try {
        const purchaseOrders = await sql`
          SELECT 
            id,
            order_number,
            order_date,
            supplier_name,
            total_amount,
            currency_code,
            workflow_status,
            'purchase' as type
          FROM purchase_orders 
          WHERE order_number ILIKE ${searchTerm}
             OR supplier_name ILIKE ${searchTerm}
             OR notes ILIKE ${searchTerm}
          ORDER BY order_date DESC
          LIMIT 20
        `

        orders.push(
          ...purchaseOrders.map((order) => ({
            ...order,
            type: "purchase",
          })),
        )
      } catch (error) {
        console.error("Error searching purchase orders:", error)
      }
    }

    // Sort by date descending
    orders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())

    return NextResponse.json({
      orders: orders.slice(0, 20),
      total: orders.length,
    })
  } catch (error) {
    console.error("Order search API error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء البحث عن الطلبيات", orders: [] }, { status: 500 })
  }
}
