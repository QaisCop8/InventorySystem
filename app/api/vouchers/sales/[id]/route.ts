import { type NextRequest, NextResponse } from "next/server"
import { deleteSalesVoucher, updatePrintSalesVoucher } from "@/lib/vouchers"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const voucherId = Number.parseInt(params.id)
    if (Number.isNaN(voucherId)) {
      return NextResponse.json({ error: "رقم الفاتورة غير صحيح" }, { status: 400 })
    }

    await deleteSalesVoucher(voucherId)
    return NextResponse.json({ message: "تم حذف الفاتورة بنجاح" })
  } catch (error: any) {
    console.error("Delete sales voucher API error:", error)
    return NextResponse.json(
      {
        error: error.message || "حدث خطأ في حذف الفاتورة",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}

export async function PUT(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const voucherId = Number.parseInt(params.id)
    if (Number.isNaN(voucherId)) {
      return NextResponse.json({ error: "رقم الفاتورة غير صحيح" }, { status: 400 })
    }

    await updatePrintSalesVoucher(voucherId)
    return NextResponse.json({ message: "" })
  } catch (error: any) {
    console.error("Print sales voucher API error:", error)
    return NextResponse.json(
      {
        error: error.message || "حدث خطأ في تحديث حالة الطباعة",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
