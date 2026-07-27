import { NextResponse } from "next/server"
import { getCustomerSession } from "@/lib/customer-auth"
import sql from "@/lib/database"

export async function GET() {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    if (!session.permissions.can_view_products) {
      return NextResponse.json({ error: "ليس لديك صلاحية لعرض الأصناف" }, { status: 403 })
    }

    // Get all products
    const result = await sql`
      SELECT id, name, description, category, price, stock_quantity
      FROM products
      WHERE is_active = true
      ORDER BY category, name
    `

    return NextResponse.json({ products: result.rows })
  } catch (error) {
    console.error("Get customer products error:", error)
    return NextResponse.json({ error: "حدث خطأ أثناء تحميل الأصناف" }, { status: 500 })
  }
}
