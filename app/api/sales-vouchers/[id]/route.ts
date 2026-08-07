import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { ensureTables, fetchSalesVoucherItems, archiveAndDeleteSalesVoucher, fetchTaxAccountForVoucher, ITEM_ACCOUNT_VCH_TYPES } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureTables()
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const rows = await sql`
      SELECT vh.*, EXISTS(
        SELECT 1
        FROM voucher_header_tbl inv
        WHERE inv.vch_type IN (12, 17)
          AND inv.id != vh.id
          AND (
            (inv.source_voucher_id = vh.id AND inv.source_voucher_type = vh.vch_type)
            OR EXISTS (
              SELECT 1
              FROM voucher_items_tbl vi
              WHERE vi.voucher_id = inv.id
                AND vi.source_voucher_id = vh.id
                AND vi.source_voucher_type = vh.vch_type
            )
          )
      ) AS has_linked_invoice
      FROM voucher_header_tbl vh
      WHERE vh.id = ${id}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 })
    }

    const voucher = rows[0]
    const items = await fetchSalesVoucherItems(id)
    // حساب الضريبة (تبويب "بيانات اضافية") لا عمود على voucher_header_tbl — يُشتَق من سطر القيد
    // المحفوظ (voucher_journal_detail_tbl) عند تحميل سند موجود، انظر buildSalesVoucherJournalRows/
    // fetchTaxAccountForVoucher في ../_lib.ts.
    const taxAccount = (ITEM_ACCOUNT_VCH_TYPES as readonly number[]).includes(Number(voucher.vch_type))
      ? await fetchTaxAccountForVoucher(id)
      : null
    return NextResponse.json({
      ...voucher,
      city_id: voucher.location_id,
      tax_account_id: taxAccount?.id ?? null,
      tax_account_code: taxAccount?.code ?? "",
      tax_account_name: taxAccount?.name ?? "",
      items,
    })
  } catch (error) {
    console.error("Error fetching sales voucher:", error)
    return NextResponse.json({ error: "Failed to fetch sales voucher" }, { status: 500 })
  }
}

// يُسجَّل عند أول طباعة لسند مُرحَّل فقط (is_printed=1) — مطابق لِـstock-vouchers/[id]/route.ts.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

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
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

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
