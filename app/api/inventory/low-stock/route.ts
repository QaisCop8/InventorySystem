import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const result = await sql`
      SELECT 
        p.id,
        p.product_code,
        p.product_name,
        ps.current_stock,
        p.reorder_point,
        p.min_stock_level,
        p.max_stock_level,
        p.last_purchase_price,
        p.supplier_id,
        s.supplier_name,
        p.main_unit,
        p.status
      FROM products p
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 
        p.status = 'active'
        AND (
          ps.current_stock <= COALESCE(p.reorder_point, p.min_stock_level, 0)
          OR ps.current_stock IS NULL
        )
      ORDER BY ps.current_stock ASC, p.product_name ASC
    `

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error fetching low stock products:", error)
    return NextResponse.json({ error: "Failed to fetch low stock products" }, { status: 500 })
  }
}
