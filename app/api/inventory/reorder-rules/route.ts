import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
export async function GET(request: NextRequest) {
  try {
    const reorderRules = await sql`
      SELECT 
        rr.*,
        p.product_name,
        p.product_code,
        s.supplier_name
      FROM reorder_rules rr
      LEFT JOIN products p ON rr.product_id = p.id
      LEFT JOIN suppliers s ON rr.supplier_id = s.id
      ORDER BY rr.created_at DESC
    `

    return NextResponse.json(reorderRules)
  } catch (error) {
    console.error("Error fetching reorder rules:", error)
    return NextResponse.json({ error: "فشل في تحميل قواعد إعادة الطلب" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      product_id,
      reorder_point,
      reorder_quantity,
      supplier_id,
      is_active = true,
      auto_create_po = false,
      notification_enabled = true,
    } = body

    // Check if rule already exists for this product
    const existingRule = await sql`
      SELECT id FROM reorder_rules WHERE product_id = ${product_id}
    `

    if (existingRule.length > 0) {
      return NextResponse.json({ error: "قاعدة إعادة الطلب موجودة مسبقاً لهذا المنتج" }, { status: 409 })
    }

    const newRule = await sql`
      INSERT INTO reorder_rules (
        product_id, reorder_point, reorder_quantity, supplier_id,
        is_active, auto_create_po, notification_enabled, created_at
      )
      VALUES (
        ${product_id}, ${reorder_point}, ${reorder_quantity}, ${supplier_id},
        ${is_active}, ${auto_create_po}, ${notification_enabled}, NOW()
      )
      RETURNING *
    `

    return NextResponse.json(newRule[0])
  } catch (error) {
    console.error("Error creating reorder rule:", error)
    return NextResponse.json({ error: "فشل في إنشاء قاعدة إعادة الطلب" }, { status: 500 })
  }
}
