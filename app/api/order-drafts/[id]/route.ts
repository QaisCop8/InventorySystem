import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"

async function validateItems(items: any[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("يجب إدخال صنف واحد على الأقل")
  const ids = items.map((item) => Number(item.product_id))
  const products: any[] = await sql`SELECT id, product_name, minimum_order_quantity FROM products WHERE id=ANY(${ids}::int[])`
  for (const item of items) {
    const product = products.find((row) => row.id === Number(item.product_id))
    if (!product || Number(item.quantity) <= 0) throw new Error("بيانات صنف أو كمية غير صالحة")
    if (Number(item.quantity) < Number(product.minimum_order_quantity || 0)) throw new Error(`الحد الأدنى لطلب ${product.product_name} هو ${product.minimum_order_quantity}`)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id)
    const data = await request.json()
    if (!data.account_id || !data.requested_delivery_date) return NextResponse.json({ error: "العميل وتاريخ التسليم مطلوبان" }, { status: 400 })
    await validateItems(data.items)
    const updated = await sql`
      UPDATE sales_order_drafts SET account_id=${data.account_id}, customer_name=${data.customer_name},
        order_date=${data.order_date}, requested_delivery_date=${data.requested_delivery_date},
        deposit_amount=${Number(data.deposit_amount)||0}, notes=${data.notes||null},
        delivery_address=${data.delivery_address||null}, contact_phone=${data.contact_phone||null},
        priority=${data.priority||"normal"}, checklist_template_id=${data.checklist_template_id||null},
        attachments=${JSON.stringify(data.attachments||[])}::jsonb, updated_at=NOW()
      WHERE id=${id} AND status='draft' RETURNING *
    `
    if (!updated.length) return NextResponse.json({ error: "لا يمكن تعديل مسودة مؤكدة أو غير موجودة" }, { status: 409 })
    await sql`DELETE FROM sales_order_draft_items WHERE draft_id=${id}`
    for (const item of data.items) await sql`
      INSERT INTO sales_order_draft_items (draft_id,product_id,product_name,quantity,price,discount,unit_id,barcode)
      VALUES (${id},${item.product_id},${item.product_name},${item.quantity},${item.price||0},${item.discount||0},${item.unit_id||null},${item.barcode||null})
    `
    return NextResponse.json(updated[0])
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }) }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id)
    const deleted = await sql`DELETE FROM sales_order_drafts WHERE id=${id} AND status='draft' RETURNING id`
    if (!deleted.length) return NextResponse.json({ error: "لا يمكن حذف مسودة مؤكدة أو غير موجودة" }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }) }
}
