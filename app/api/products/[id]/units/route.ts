import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"

// وحدات صنف واحد بمعرّفه — يستدعيه ProductSearchPopup (عند اختيار صنف بالنقر المزدوج/Enter) وشاشتا
// فاتورة/طلبية المبيعات، بنفس الشكل الذي يعيده /api/inventory/products/search لتوحيد التعامل مع
// الوحدات المتعددة (to_main_qnty) في كل الشاشات.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const productId = Number(params.id)
    if (!productId) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const priceCategoryId = Number(searchParams.get("price_category_id") || 1)

    const client = await (await getTenantPool()).connect()
    try {
      const result = await client.query(
        `SELECT u.id AS unit_id, u.unit_name, pu.to_main_qnty,
                pub.barcode,
                COALESCE(pp_selected.price, pp_fallback.price, 0) AS price
         FROM product_units pu
         LEFT JOIN units u ON pu.unit_id = u.id
         LEFT JOIN product_unit_barcodes pub
           ON pu.product_id = pub.product_id AND pu.unit_id = pub.unit_id
         LEFT JOIN product_prices pp_selected
           ON pu.product_id = pp_selected.product_id
           AND pu.unit_id = pp_selected.unit_id
           AND pp_selected.price_category_id = $2
         LEFT JOIN product_prices pp_fallback
           ON pu.product_id = pp_fallback.product_id
           AND pu.unit_id = pp_fallback.unit_id
           AND pp_fallback.price_category_id = 1
         WHERE pu.product_id = $1
         ORDER BY pu.id ASC`,
        [productId, priceCategoryId],
      )
      return NextResponse.json(result.rows)
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error fetching product units:", error)
    return NextResponse.json({ error: "Failed to fetch product units" }, { status: 500 })
  }
}
