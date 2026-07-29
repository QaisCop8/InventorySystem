import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// يتحقق من عدم تكرار الرقم الأصلي (type=1) أو رقم المصنع (type=2) مع أي صنف آخر — تُستخدَم عند
// تحرير خانة في نافذة ProductNumbers (components/products/ProductNumbers.tsx) عبر
// components/products/compact-product-form.tsx. exclude_id يستثني الصنف الحالي نفسه من الفحص
// (0 عند صنف جديد لم يُحفَظ بعد، فلا يستثني شيئاً فعلياً).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = Number(searchParams.get("type"))
    const number = String(searchParams.get("number") || "").trim()
    const excludeId = Number(searchParams.get("exclude_id") || 0)

    if ((type !== 1 && type !== 2) || !number) {
      return NextResponse.json({ duplicate: false })
    }

    const rows = await sql`
      SELECT p.id, p.product_name
      FROM product_numbers pn
      JOIN products p ON p.id = pn.product_id
      WHERE pn.type = ${type} AND LOWER(pn.number) = LOWER(${number}) AND pn.product_id != ${excludeId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json({ duplicate: false })
    }

    return NextResponse.json({ duplicate: true, product_id: rows[0].id, product_name: rows[0].product_name })
  } catch (error) {
    console.error("Error checking product number duplicate:", error)
    return NextResponse.json({ duplicate: false })
  }
}
