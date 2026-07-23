import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchVoucherItems, archiveAndDeleteStockVoucher } from "../_lib"

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

    const items = await fetchVoucherItems(id)
    return NextResponse.json({ ...rows[0], items })
  } catch (error) {
    console.error("Error fetching stock voucher:", error)
    return NextResponse.json({ error: "Failed to fetch stock voucher" }, { status: 500 })
  }
}

// يُسجَّل عند أول طباعة لسند مُرحَّل فقط (is_printed=1)، لتمييز "نسخة اصلية" عن أي طباعة لاحقة له
// ("نسخة") — مطابق لِـ markVoucherPrinted في receipts/_lib.ts.
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
    console.error("Error marking stock voucher as printed:", error)
    return NextResponse.json({ error: "Failed to mark stock voucher as printed" }, { status: 500 })
  }
}

// حذف فعلي — متاح فقط لسند بحالة "فعال" (status=1، لم يُرحَّل بعد). سند مُرحَّل يُلغى منطقياً
// عبر PUT بـ status=3 بدل هذا المسار (انظر archiveAndDeleteStockVoucher في _lib.ts).
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const result = await archiveAndDeleteStockVoucher(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting stock voucher:", error)
    return NextResponse.json({ error: "Failed to delete stock voucher" }, { status: 500 })
  }
}
