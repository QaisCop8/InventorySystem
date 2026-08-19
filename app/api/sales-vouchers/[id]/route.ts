import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import {
  ensureTables,
  fetchSalesVoucherItems,
  archiveAndDeleteSalesVoucher,
  fetchSalesVoucherJournalAccounts,
  resolveSalesVoucherJournalTypes,
  ITEM_ACCOUNT_VCH_TYPES,
} from "../_lib"
import { authorizeStoredVoucher } from "@/lib/transaction-permissions"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTables()
    const id = Number((await params).id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const authorization = await authorizeStoredVoucher(request, id, "view")
    if (!authorization.ok) return authorization.response

    const rows = await sql`
      SELECT vh.*, EXISTS(
        SELECT 1
        FROM voucher_items_tbl inv_item
        JOIN voucher_header_tbl inv ON inv.id = inv_item.voucher_id
        WHERE inv.vch_type IN (12, 17)
          AND inv_item.delivery_item_id IN (
            SELECT id FROM voucher_items_tbl WHERE voucher_id = vh.id
          )
      ) AS has_linked_invoice
      FROM voucher_header_tbl vh
      WHERE vh.id = ${id}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    }

    const voucher = rows[0]
    const hasJournalAccounts = (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(Number(voucher.vch_type))
    const journalTypes = hasJournalAccounts ? await resolveSalesVoucherJournalTypes(Number(voucher.vch_type)) : null
    const items = await fetchSalesVoucherItems(id, journalTypes?.itemJournalType)
    // Source information is intentionally stored on voucher item links, not
    // duplicated on voucher_header_tbl. Reconstruct the invoice source when
    // displaying an existing invoice so the UI does not fall back to "normal".
    const deliverySourceItem = items.find((item: any) => Number(item.delivery_item_id) > 0)
    const orderSourceItem = items.find((item: any) => Number(item.order_item_id) > 0)
    const invoiceSourceType = deliverySourceItem ? 2 : orderSourceItem ? 3 : 1
    const journalAccounts = hasJournalAccounts
      ? await fetchSalesVoucherJournalAccounts(id, Number(voucher.vch_type), Boolean(voucher.account_id))
      : { taxAccount: null, cashAccount: null }
    return NextResponse.json({
      ...voucher,
      city_id: voucher.location_id,
      invoice_source_type: invoiceSourceType,
      source_voucher_id: deliverySourceItem?.source_voucher_id ?? null,
      source_voucher_type: deliverySourceItem?.source_voucher_type ?? null,
      cash_account_id: journalAccounts.cashAccount?.id ?? null,
      cash_account_code: journalAccounts.cashAccount?.code ?? "",
      cash_account_name: journalAccounts.cashAccount?.name ?? "",
      tax_account_id: journalAccounts.taxAccount?.id ?? null,
      tax_account_code: journalAccounts.taxAccount?.code ?? "",
      tax_account_name: journalAccounts.taxAccount?.name ?? "",
      items,
    })
  } catch (error) {
    console.error("Error fetching sales voucher:", error)
    return NextResponse.json({ error: "Failed to fetch sales voucher" }, { status: 500 })
  }
}

// يُسجَّل عند أول طباعة لسند مُرحَّل فقط (is_printed=1) — مطابق لِـstock-vouchers/[id]/route.ts.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const authorization = await authorizeStoredVoucher(request, id, "view")
    if (!authorization.ok) return authorization.response

    const result = await sql`
      UPDATE voucher_header_tbl SET is_printed = 1 WHERE id = ${id} AND status = 2
      RETURNING id
    `
    if (result.length === 0) {
      return NextResponse.json({ error: "السند غير موجود أو غير مرحّل" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking sales voucher as printed:", error)
    return NextResponse.json({ error: "Failed to mark sales voucher as printed" }, { status: 500 })
  }
}

// حذف فعلي — متاح فقط لسند بحالة "فعال" (status=1). سند مُرحَّل يُلغى منطقياً عبر PUT بـstatus=3.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const authorization = await authorizeStoredVoucher(request, id, "delete")
    if (!authorization.ok) return authorization.response

    const result = await archiveAndDeleteSalesVoucher(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting sales voucher:", error)
    return NextResponse.json({ error: "Failed to delete sales voucher" }, { status: 500 })
  }
}
