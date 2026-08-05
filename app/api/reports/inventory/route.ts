import sql from "@/lib/database"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const inventoryData = await sql`
      SELECT 
        category,
        COUNT(*) as product_count,
        AVG(last_purchase_price) as avg_price,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_products
      FROM products
      GROUP BY category
      ORDER BY product_count DESC
    `

    const lowStockProducts = await sql`
      SELECT 
        product_name,
        product_code,
        order_quantity,
        max_quantity,
        status
      FROM products
      WHERE order_quantity < max_quantity * 0.2
      AND status = 'active'
      ORDER BY (order_quantity / NULLIF(max_quantity, 0)) ASC
      LIMIT 20
    `

    const productsByType = await sql`
      SELECT 
        product_type,
        COUNT(*) as count
      FROM products
      GROUP BY product_type
    `

    return NextResponse.json({
      inventoryData,
      lowStockProducts,
      productsByType,
      summary: {
        totalProducts: inventoryData.reduce((sum, item) => sum + Number(item.product_count), 0),
        activeProducts: inventoryData.reduce((sum, item) => sum + Number(item.active_products), 0),
        lowStockCount: lowStockProducts.length,
      },
    })
  } catch (error) {
    console.error("Error fetching inventory reports:", error)
    return NextResponse.json({ error: "Failed to fetch inventory reports" }, { status: 500 })
  }
}
