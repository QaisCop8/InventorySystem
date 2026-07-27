import sql from "@/lib/database"
export async function GET() {
  try {
    const products = await sql`
      SELECT 
        p.id,
        p.product_name,
        p.product_code,
        ps.current_stock,
        ps.reorder_level,
        ps.available_stock,
        ps.reserved_stock,
        p.unit_price
      FROM products p
      LEFT JOIN product_stock ps ON p.id = ps.product_id
      WHERE ps.current_stock <= ps.reorder_level
      ORDER BY (ps.current_stock - ps.reorder_level) ASC
      LIMIT 50
    `

    return Response.json({ success: true, products })
  } catch (error) {
    console.error("[v0] Error fetching low stock products:", error)
    return Response.json({ success: false, error: "فشل في جلب المنتجات" }, { status: 500 })
  }
}
