import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { createOrder } from "@/lib/orders"
import { createOrderWorkflowStatus } from "@/lib/workflow"
import { checkDraftProductionAvailability } from "@/lib/inventory-availability"
import { getSystemSettingValue } from "@/lib/system-settings"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureOrderDraftTables()
    const id = Number((await params).id), body = await request.json()
    const [draft]: any = await sql`SELECT * FROM sales_order_drafts WHERE id=${id} AND status='draft'`
    if (!draft) return NextResponse.json({ error: "المسودة غير موجودة أو تم تأكيدها" }, { status: 404 })
    const items: any[] = await sql`SELECT i.*, p.minimum_order_quantity FROM sales_order_draft_items i JOIN products p ON p.id=i.product_id WHERE i.draft_id=${id}`
    const missingStore = items.find((item) => !item.store_id)
    if (missingStore) return NextResponse.json({ error: `يجب تحديد مخزن للصنف ${missingStore.product_name} قبل تأكيد الطلبية` }, { status: 400 })
    const missingUnit = items.find((item) => !item.unit_id)
    if (missingUnit) return NextResponse.json({ error: `يجب تحديد وحدة للصنف ${missingUnit.product_name} قبل تأكيد الطلبية` }, { status: 400 })
    for (const i of items) if (Number(i.quantity) < Number(i.minimum_order_quantity || 0)) return NextResponse.json({ error: `الكمية الحالية للصنف ${i.product_name} أقل من الحد الأدنى` }, { status: 400 })
    const productionCheck = await checkDraftProductionAvailability(id)
    if (productionCheck.specification_errors.length) return NextResponse.json({ error: productionCheck.specification_errors[0], specification_errors: productionCheck.specification_errors }, { status: 400 })
    const unavailable = productionCheck.items.find((item) => !item.available)
    const allowConfirmationWithoutProductionMaterials = await getSystemSettingValue(
      "allow_order_confirmation_without_production_materials",
      false,
    )
    if (unavailable && allowConfirmationWithoutProductionMaterials !== true) return NextResponse.json({ error: `${unavailable.product_name}: المطلوب ${unavailable.quantity} والمتوفر ${unavailable.available_stock} بالوحدة الرئيسية`, availability: productionCheck.items }, { status: 400 })
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
    const order: any = await createOrder({ id:0, order_date:draft.order_date, customer_id:draft.account_id, customer_name:draft.customer_name, customer_phone:draft.contact_phone||"", currency_id:1, exchange_rate:1, total_amount:total, order_type:1, order_status:1, order_status2:1, order_decision:1, general_notes:draft.notes||"", user_id:body.user_id||draft.created_by, branch_id:draft.branch_id }, items.map(i=>({ product_id:i.product_id, product_name:i.product_name, quantity:Number(i.quantity), price:Number(i.price), discount:Number(i.discount), bonus:0, barcode:i.barcode, unit_id:i.unit_id, store_id:i.store_id, delivered_quantity:0, item_status:1, specifications:i.specifications })))
    try { await createOrderWorkflowStatus(order.id, "sales", order.order_number) } catch (e) { console.error(e) }
    await sql`UPDATE sales_order_drafts SET status='confirmed', confirmed_order_id=${order.id}, checklist_values=${JSON.stringify(body.checklist_values||{})}::jsonb, updated_at=NOW() WHERE id=${id}`
    await sql`INSERT INTO sales_order_draft_events (draft_id,event_type,user_id,details) VALUES (${id}, 'confirmed', ${String(body.user_id || draft.created_by || "")}, ${JSON.stringify({ order_id: order.id, order_number: order.order_number, checklist_values: body.checklist_values || {}, availability: productionCheck.items, continued_with_shortage: Boolean(unavailable) })}::jsonb)`
    return NextResponse.json({
      ...order,
      workflow_created: !order._taskTracking || order._taskTracking.opened === order._taskTracking.attempted,
      workflow_message: order._taskTracking?.error || null,
    })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
