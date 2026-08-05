import sql from "@/lib/database"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const [salesData, purchaseData, productsData, customersData] = await Promise.all([
      sql`SELECT COUNT(*) as count, SUM(total_amount) as total FROM sales_orders`,
      sql`SELECT COUNT(*) as count, SUM(total_amount) as total FROM purchase_orders`,
      sql`SELECT COUNT(*) as count FROM products`,
      sql`SELECT COUNT(*) as count FROM customers`,
    ])

    const reportsData = {
      sales: {
        totalOrders: Number.parseInt(salesData[0]?.count || "0"),
        totalAmount: Number.parseFloat(salesData[0]?.total || "0"),
      },
      purchases: {
        totalOrders: Number.parseInt(purchaseData[0]?.count || "0"),
        totalAmount: Number.parseFloat(purchaseData[0]?.total || "0"),
      },
      products: {
        totalProducts: Number.parseInt(productsData[0]?.count || "0"),
      },
      customers: {
        totalCustomers: Number.parseInt(customersData[0]?.count || "0"),
      },
    }

    return NextResponse.json(reportsData)
  } catch (error) {
    console.error("Error fetching reports data:", error)
    return NextResponse.json({ error: "Failed to fetch reports data" }, { status: 500 })
  }
}
