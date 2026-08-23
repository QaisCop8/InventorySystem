import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "رقم المسودة غير صالح" }, { status: 400 })
    const rows = await sql`
      SELECT i.product_name, i.quantity, COALESCE(ps.current_stock, 0) AS available_stock
      FROM sales_order_draft_items i
      LEFT JOIN product_stock ps ON ps.product_id = i.product_id
      WHERE i.draft_id = ${id}
      ORDER BY i.id
    `
    return NextResponse.json({ items: rows.map((row: any) => ({ ...row, quantity: Number(row.quantity), available_stock: Number(row.available_stock), available: Number(row.available_stock) >= Number(row.quantity) })) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "تعذر فحص توفر مواد الانتاج" }, { status: 500 })
  }
}
