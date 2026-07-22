import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { fetchCreditNoteDetails, archiveAndDeleteVoucher, markVoucherPrinted } from "../_lib"

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

    const details = await fetchCreditNoteDetails(id)
    return NextResponse.json({ ...rows[0], ...details })
  } catch (error) {
    console.error("Error fetching credit/debit note:", error)
    return NextResponse.json({ error: "Failed to fetch credit/debit note" }, { status: 500 })
  }
}

// حذف فعلي (مع أرشفة إلى جداول log) — متاح فقط لسند بحالة "فعال" (status=1). سند مُرحَّل
// يُلغى منطقياً عبر PUT بـ status=3 بدل هذا المسار.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const result = await archiveAndDeleteVoucher(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting credit/debit note:", error)
    return NextResponse.json({ error: "Failed to delete credit/debit note" }, { status: 500 })
  }
}

// يُستدعى عند ضغط زر الطباعة على سند مُرحَّل بالفعل — يسجّل printed=1 دون المرور بمسار PUT الرئيسي.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: "معرف السند غير صالح" }, { status: 400 })
    }

    const result = await markVoucherPrinted(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error marking credit/debit note as printed:", error)
    return NextResponse.json({ error: "Failed to mark credit/debit note as printed" }, { status: 500 })
  }
}
