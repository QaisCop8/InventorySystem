import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fromDate =
      searchParams.get("from_date") || new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0]
    const toDate = searchParams.get("to_date") || new Date().toISOString().split("T")[0]
    const reportType = searchParams.get("type") || "overview"

    let data = {}

    switch (reportType) {
      case "overview":
        // Get KPI data
        const [salesData, purchaseData, inventoryData, customerData] = await Promise.all([
          // Sales summary
          sql`
            SELECT 
              COUNT(*) as total_orders,
              COALESCE(SUM(total_amount), 0) as total_sales,
              COALESCE(AVG(total_amount), 0) as avg_order_value
            FROM sales_orders 
            WHERE order_date BETWEEN ${fromDate} AND ${toDate}
          `,
          // Purchase summary
          sql`
            SELECT 
              COUNT(*) as total_orders,
              COALESCE(SUM(total_amount), 0) as total_purchases
            FROM purchase_orders 
            WHERE order_date BETWEEN ${fromDate} AND ${toDate}
          `,
          // Inventory summary
          sql`
            SELECT 
              COUNT(*) as total_products,
              COUNT(CASE WHEN ps.current_stock <= ps.reorder_level THEN 1 END) as low_stock_products,
              COUNT(CASE WHEN ps.current_stock = 0 THEN 1 END) as out_of_stock_products,
              COALESCE(SUM(ps.current_stock * p.last_purchase_price), 0) as inventory_value
            FROM products p
            LEFT JOIN product_stock ps ON p.id = ps.product_id
          `,
          // Customer data
          sql`
            SELECT COUNT(*) as total_customers
            FROM customers 
            WHERE status = 'نشط'
          `,
        ])

        data = {
          kpis: {
            total_sales: salesData[0]?.total_sales || 0,
            total_purchases: purchaseData[0]?.total_purchases || 0,
            total_orders: salesData[0]?.total_orders || 0,
            avg_order_value: salesData[0]?.avg_order_value || 0,
            total_customers: customerData[0]?.total_customers || 0,
            total_products: inventoryData[0]?.total_products || 0,
            low_stock_products: inventoryData[0]?.low_stock_products || 0,
            out_of_stock_products: inventoryData[0]?.out_of_stock_products || 0,
            inventory_value: inventoryData[0]?.inventory_value || 0,
          },
        }
        break

      case "sales_trend":
        // Monthly sales trend
        const salesTrend = await sql`
          SELECT 
            TO_CHAR(order_date, 'YYYY-MM') as month,
            COUNT(*) as order_count,
            COALESCE(SUM(total_amount), 0) as total_sales
          FROM sales_orders 
          WHERE order_date BETWEEN ${fromDate} AND ${toDate}
          GROUP BY TO_CHAR(order_date, 'YYYY-MM')
          ORDER BY month
        `
        data = { sales_trend: salesTrend }
        break

      case "top_products":
        // Top selling products
        const topProducts = await sql`
          SELECT 
            p.product_name,
            p.product_code,
            SUM(soi.quantity) as total_quantity,
            COALESCE(SUM(soi.total_price), 0) as total_revenue
          FROM sales_order_items soi
          JOIN products p ON soi.product_id = p.id
          JOIN sales_orders so ON soi.sales_order_id = so.id
          WHERE so.order_date BETWEEN ${fromDate} AND ${toDate}
          GROUP BY p.id, p.product_name, p.product_code
          ORDER BY total_revenue DESC
          LIMIT 10
        `
        data = { top_products: topProducts }
        break

      case "inventory_status":
        // Inventory status breakdown
        const inventoryStatus = await sql`
          SELECT 
            CASE 
              WHEN ps.current_stock = 0 THEN 'نفد المخزون'
              WHEN ps.current_stock <= ps.reorder_level THEN 'تحت الحد الأدنى'
              WHEN ps.current_stock >= ps.max_stock_level THEN 'فائض'
              ELSE 'متوفر'
            END as status,
            COUNT(*) as count
          FROM products p
          LEFT JOIN product_stock ps ON p.id = ps.product_id
          GROUP BY 
            CASE 
              WHEN ps.current_stock = 0 THEN 'نفد المخزون'
              WHEN ps.current_stock <= ps.reorder_level THEN 'تحت الحد الأدنى'
              WHEN ps.current_stock >= ps.max_stock_level THEN 'فائض'
              ELSE 'متوفر'
            END
        `
        data = { inventory_status: inventoryStatus }
        break

      default:
        data = { message: "Report type not supported" }
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching dashboard data:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
