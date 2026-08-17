import { NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"

export async function GET() {
  await ensureOrderDraftTables()
  const drafts = await sql`SELECT d.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') items FROM sales_order_drafts d LEFT JOIN sales_order_draft_items i ON i.draft_id=d.id GROUP BY d.id ORDER BY d.created_at DESC`
  return NextResponse.json(drafts.map(({ customer_id: _deprecatedCustomerId, ...draft }: any) => draft))
}

export async function POST(request: NextRequest) {
  try {
    await ensureOrderDraftTables()
    const d = await request.json()
    if (!d.account_id || !d.requested_delivery_date || !Array.isArray(d.items) || !d.items.length) return NextResponse.json({ error: "العميل وتاريخ التسليم وصنف واحد على الأقل مطلوبة" }, { status: 400 })
    const customerAccounts = await sql`SELECT id, name FROM account_tbl WHERE id=${Number(d.account_id)} AND type=2 AND COALESCE(status, 1) IN (1, 2) LIMIT 1`
    if (!customerAccounts.length) return NextResponse.json({ error: "حساب العميل غير موجود أو ليس من النوع 2" }, { status: 400 })
    const ids = d.items.map((i: any) => Number(i.product_id))
    const products = await sql`SELECT id, product_name, minimum_order_quantity FROM products WHERE id = ANY(${ids}::int[])`
    for (const item of d.items) {
      const p: any = products.find((x: any) => x.id === Number(item.product_id))
      const qty = Number(item.quantity)
      if (!p || qty <= 0) return NextResponse.json({ error: "بيانات صنف أو كمية غير صالحة" }, { status: 400 })
      if (qty < Number(p.minimum_order_quantity || 0)) return NextResponse.json({ error: `الحد الأدنى لطلب ${p.product_name} هو ${p.minimum_order_quantity}` }, { status: 400 })
    }
    const attachments = Array.isArray(d.attachments) ? d.attachments : []
    if (attachments.some((a: any) => !String(a.type || "").match(/^(image\/(jpeg|png|webp)|application\/pdf)$/) || String(a.data || "").length > 7_000_000)) return NextResponse.json({ error: "المرفقات المسموحة صور أو PDF وبحد أقصى 5MB للملف" }, { status: 400 })
    const number = `DR-${Date.now()}`
    const [draft] = await sql`INSERT INTO sales_order_drafts (draft_number,account_id,customer_name,order_date,requested_delivery_date,deposit_amount,notes,delivery_address,contact_phone,priority,checklist_template_id,attachments,created_by,branch_id) VALUES (${number},${d.account_id},${customerAccounts[0].name},${d.order_date || new Date().toISOString().slice(0,10)},${d.requested_delivery_date},${Number(d.deposit_amount)||0},${d.notes||null},${d.delivery_address||null},${d.contact_phone||null},${d.priority||"normal"},${d.checklist_template_id||null},${JSON.stringify(attachments)}::jsonb,${d.created_by||null},${d.branch_id||null}) RETURNING *`
    for (const i of d.items) await sql`INSERT INTO sales_order_draft_items (draft_id,product_id,product_name,quantity,price,discount,unit_id,barcode) VALUES (${draft.id},${i.product_id},${i.product_name},${i.quantity},${i.price||0},${i.discount||0},${i.unit_id||null},${i.barcode||null})`
    const { customer_id: _deprecatedCustomerId, ...savedDraft } = draft as any
    return NextResponse.json(savedDraft, { status: 201 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
