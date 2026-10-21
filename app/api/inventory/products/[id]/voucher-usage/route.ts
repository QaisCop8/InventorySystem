import { authorizeStoredProduct } from "@/app/api/inventory/products/_permissions"
import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"

// يتحقق أن للصنف سطراً واحداً على الأقل بـvoucher_items_tbl (سندات ادخال/اخراج بضاعة، ارسالية
// داخلية، استعمال — voucher_items_tbl مشترك بينها جميعاً، انظر app/api/stock-vouchers/_lib.ts)
// ضمن سند لم يُلغَ منطقياً (status != 3) — تُستخدَم من compact-product-form.tsx لتعطيل خانات
// "له تاريخ صلاحية"/"له رقم تشغيلي"/"له رقم متسلسل" على صنف استُخدِم فعلياً في حركة مخزون، إذ
// تغيير هذه الخصائص بأثر رجعي على صنف له سطور فعلية يُناقض بيانات تلك السطور القائمة أصلاً.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const { id } = await ctx.params
    const permission = await authorizeStoredProduct(request, id, "lookup")
    if (!permission.ok) return permission.response
    const productId = Number(id)
    if (!productId) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 })
    }

    const client = await (await getTenantPool()).connect()
    try {
      const result = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM voucher_items_tbl vi
           JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id
           WHERE vi.item_id = $1 AND vh.status != 3
         ) AS used`,
        [productId],
      )
      return NextResponse.json({ used: Boolean(result.rows[0]?.used) })
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Error checking product voucher usage:", error)
    return NextResponse.json({ error: "Failed to check product voucher usage" }, { status: 500 })
  }
}
