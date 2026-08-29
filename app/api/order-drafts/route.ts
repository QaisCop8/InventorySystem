import { NextRequest, NextResponse } from "next/server"
import sql, { getTenantPool } from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { ensureTables as ensureReceiptTables } from "@/app/api/receipts/_lib"
import { DraftValidationError, syncDepositReceipt, validateDraftPayload, validateDraftReferences } from "@/lib/order-draft-transaction"
import { requirePermissionByName } from "@/lib/tenant-auth"

export async function GET(request: NextRequest) {
  const permission = await requirePermissionByName(request, "استعلام مسودة طلبية مبيعات")
  if (!permission.ok) return permission.response
  await ensureOrderDraftTables()
  const drafts = await sql`SELECT d.*, COALESCE(json_agg(i ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') items FROM sales_order_drafts d LEFT JOIN sales_order_draft_items i ON i.draft_id=d.id GROUP BY d.id ORDER BY d.created_at DESC`
  return NextResponse.json(drafts.map(({ customer_id: _deprecatedCustomerId, ...draft }: any) => draft))
}

export async function POST(request: NextRequest) {
  let client: any
  try {
    await ensureOrderDraftTables(); await ensureReceiptTables()
    const data = await request.json()
    const permission = await requirePermissionByName(request, "إضافة مسودة طلبية مبيعات", Number(data.branch_id))
    if (!permission.ok) return permission.response
    const { deposit, attachments } = validateDraftPayload(data)
    client = await (await getTenantPool()).connect(); await client.query("BEGIN")
    const account = await validateDraftReferences(client, data)
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["sales-order-draft-number"])
    const existingNumbers = await client.query("SELECT draft_number FROM sales_order_drafts WHERE draft_number ~ '^DR-[0-9]{7}$'")
    const lastNumber = existingNumbers.rows.reduce((highest: number, row: any) => Math.max(highest, Number(String(row.draft_number).slice(3)) || 0), 0)
    if (lastNumber >= 9999999) throw new Error("تم تجاوز الحد الأقصى لأرقام مسودات الطلبيات")
    const number = `DR-${String(lastNumber + 1).padStart(7, "0")}`
    const result = await client.query(`INSERT INTO sales_order_drafts (draft_number,account_id,customer_name,order_date,requested_delivery_date,deposit_amount,notes,delivery_address,contact_phone,priority,checklist_template_id,attachments,created_by,branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) RETURNING *`, [number, Number(data.account_id), account.name, data.order_date, data.requested_delivery_date, deposit, data.notes || null, data.delivery_address || null, data.contact_phone || null, data.priority || "normal", data.checklist_template_id || null, JSON.stringify(attachments), data.created_by || null, data.branch_id || null])
    const draft = result.rows[0]
    for (const item of data.items) await client.query(`INSERT INTO sales_order_draft_items (draft_id,product_id,product_name,quantity,price,discount,unit_id,barcode,store_id,specifications) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [draft.id, Number(item.product_id), item.product_name, Number(item.quantity), Number(item.price), Number(item.discount), item.unit_id || null, item.barcode || null, item.store_id || null, JSON.stringify(item.specifications || {})])
    await client.query(`INSERT INTO sales_order_draft_events (draft_id,event_type,user_id,details) VALUES ($1,'created',$2,$3::jsonb)`, [draft.id, permission.user.user_id, JSON.stringify({ item_count: data.items.length, customer_name: account.name })])
    const receiptVoucherId = await syncDepositReceipt(client, { draftId: draft.id, draftNumber: number, accountId: Number(data.account_id), customerName: account.name, orderDate: data.order_date, deposit, userId: Number(data.created_by) })
    await client.query("COMMIT")
    const { customer_id: _deprecatedCustomerId, ...savedDraft } = draft
    return NextResponse.json({ ...savedDraft, receipt_voucher_id: receiptVoucherId }, { status: 201 })
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => {})
    console.error("[order-drafts] Failed to create draft transaction:", error)
    return NextResponse.json({ error: error.message || "تعذر حفظ المسودة" }, { status: error instanceof DraftValidationError ? 400 : 500 })
  } finally { client?.release() }
}
