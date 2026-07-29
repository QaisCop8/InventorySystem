import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchSalesVoucherItems, archiveAndDeleteSalesVoucher, fetchTaxAccountForVoucher, ITEM_ACCOUNT_VCH_TYPES } from "../_lib"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const rows = await sql`SELECT * FROM voucher_header_tbl WHERE id = ${id}`
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
