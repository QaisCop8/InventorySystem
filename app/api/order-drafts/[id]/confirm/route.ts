import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { createOrder } from "@/lib/orders"
import { createOrderWorkflowStatus } from "@/lib/workflow"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id), body = await request.json()
    const [draft]: any = await sql`SELECT * FROM sales_order_drafts WHERE id=${id} AND status='draft'`
    if (!draft) return NextResponse.json({ error: "المسودة غير موجودة أو تم تأكيدها" }, { status: 404 })
    const items: any[] = await sql`SELECT i.*, p.minimum_order_quantity FROM sales_order_draft_items i JOIN products p ON p.id=i.product_id WHERE i.draft_id=${id}`
    for (const i of items) if (Number(i.quantity) < Number(i.minimum_order_quantity || 0)) return NextResponse.json({ error: `الكمية الحالية للصنف ${i.product_name} أقل من الحد الأدنى` }, { status: 400 })
    if (draft.checklist_template_id) {
      const fields: any[] = await sql`SELECT * FROM order_checklist_fields WHERE template_id=${draft.checklist_template_id} ORDER BY position`
      const values = body.checklist_values || {}
      for (const f of fields) {
        const v = values[f.id]
        if (f.is_required && (v === undefined || v === null || v === "" || (f.field_type === "boolean" && v !== true))) return NextResponse.json({ error: `الحقل «${f.label}» إلزامي` }, { status: 400 })
        if (f.max_length && String(v || "").length > f.max_length) return NextResponse.json({ error: `الحقل «${f.label}» يتجاوز الحد الأقصى` }, { status: 400 })
        if (f.field_type === "integer" && v !== "" && !Number.isInteger(Number(v))) return NextResponse.json({ error: `الحقل «${f.label}» يجب أن يكون عدداً صحيحاً` }, { status: 400 })
      }
    }
    const total = items.reduce((s,i)=>s+Number(i.quantity)*Number(i.price)-Number(i.discount),0)
    const order: any = await createOrder({ id:0, order_date:draft.order_date, customer_id:draft.customer_id, customer_name:draft.customer_name, customer_phone:draft.contact_phone||"", currency_id:1, exchange_rate:1, total_amount:total, order_type:1, order_status:1, order_status2:1, order_decision:1, general_notes:draft.notes||"", user_id:body.user_id||draft.created_by, branch_id:draft.branch_id }, items.map(i=>({ product_id:i.product_id, product_name:i.product_name, quantity:Number(i.quantity), price:Number(i.price), discount:Number(i.discount), bonus:0, barcode:i.barcode, unit_id:i.unit_id, delivered_quantity:0, item_status:1 })))
    try { await createOrderWorkflowStatus(order.id, "sales", order.order_number) } catch (e) { console.error(e) }
    await sql`UPDATE sales_order_drafts SET status='confirmed', confirmed_order_id=${order.id}, checklist_values=${JSON.stringify(body.checklist_values||{})}::jsonb, updated_at=NOW() WHERE id=${id}`
    return NextResponse.json({
      ...order,
      workflow_created: !order._taskTracking || order._taskTracking.opened === order._taskTracking.attempted,
      workflow_message: order._taskTracking?.error || null,
    })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
