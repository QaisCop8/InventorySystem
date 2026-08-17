import { NextRequest, NextResponse } from "next/server"
import sql, { getTenantPool } from "@/lib/database"
import { ensureOrderDraftTables } from "@/lib/order-drafts"
import { ensureTables as ensureReceiptTables } from "@/app/api/receipts/_lib"
import { DraftValidationError, syncDepositReceipt, validateDraftPayload, validateDraftReferences } from "@/lib/order-draft-transaction"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let client: any
  try {
    await ensureOrderDraftTables(); await ensureReceiptTables()
    const id = Number((await params).id), data = await request.json()
    if (!Number.isInteger(id) || id <= 0) throw new DraftValidationError("رقم المسودة غير صالح")
    const { deposit, attachments } = validateDraftPayload(data)
    client = await (await getTenantPool()).connect(); await client.query("BEGIN")
    const currentResult = await client.query("SELECT * FROM sales_order_drafts WHERE id=$1 AND status='draft' FOR UPDATE", [id])
    if (!currentResult.rowCount) throw new DraftValidationError("لا يمكن تعديل مسودة مؤكدة أو غير موجودة")
    const current = currentResult.rows[0], account = await validateDraftReferences(client, data)
    const updatedResult = await client.query(`UPDATE sales_order_drafts SET account_id=$2,customer_name=$3,order_date=$4,requested_delivery_date=$5,deposit_amount=$6,notes=$7,delivery_address=$8,contact_phone=$9,priority=$10,checklist_template_id=$11,attachments=$12::jsonb,branch_id=$13,updated_at=NOW() WHERE id=$1 RETURNING *`, [id, Number(data.account_id), account.name, data.order_date, data.requested_delivery_date, deposit, data.notes || null, data.delivery_address || null, data.contact_phone || null, data.priority || "normal", data.checklist_template_id || null, JSON.stringify(attachments), data.branch_id || current.branch_id || null])
    await client.query("DELETE FROM sales_order_draft_items WHERE draft_id=$1", [id])
    for (const item of data.items) await client.query(`INSERT INTO sales_order_draft_items (draft_id,product_id,product_name,quantity,price,discount,unit_id,barcode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, Number(item.product_id), item.product_name, Number(item.quantity), Number(item.price), Number(item.discount), item.unit_id || null, item.barcode || null])
    const receiptVoucherId = await syncDepositReceipt(client, { draftId: id, draftNumber: current.draft_number, receiptVoucherId: current.receipt_voucher_id, accountId: Number(data.account_id), customerName: account.name, orderDate: data.order_date, deposit, userId: Number(data.created_by || current.created_by) })
    await client.query("COMMIT")
    const { customer_id: _deprecatedCustomerId, ...savedDraft } = updatedResult.rows[0]
    return NextResponse.json({ ...savedDraft, receipt_voucher_id: receiptVoucherId })
  } catch (error: any) {
    if (client) await client.query("ROLLBACK").catch(() => {})
    console.error("[order-drafts] Failed to update draft transaction:", error)
    return NextResponse.json({ error: error.message || "تعذر تحديث المسودة" }, { status: error instanceof DraftValidationError ? 400 : 500 })
  } finally { client?.release() }
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
