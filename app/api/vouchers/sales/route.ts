import { type NextRequest, NextResponse } from "next/server"
import { createVoucher, getSalesVouchers } from "@/lib/vouchers"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("voucher_type") || searchParams.get("vch_type") || searchParams.get("type") || "5"
    const filters = {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      salesman: searchParams.get("salesman") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      customerId: searchParams.get("customerId") ? Number.parseInt(searchParams.get("customerId")!) : undefined,
      voucher_type: type,
      vch_type: type,
    }

    const vouchers = await getSalesVouchers(filters)
    return NextResponse.json(vouchers)
  } catch (error) {
    console.error("Vouchers API error:", error)
    return NextResponse.json({ error: "حدث خطأ في جلب الفواتير" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json()
    const { orderData: od, items: it, ...rest } = requestData

    const voucherData = od || rest
    const items = it || requestData.items || []

    if (voucherData && voucherData.voucher_type == null) {
      voucherData.voucher_type = voucherData.vch_type ?? voucherData.order_type ?? 5
    }

    if (!voucherData) {
      return NextResponse.json({ error: "بيانات الفاتورة مطلوبة" }, { status: 400 })
    }

    if (!voucherData.customer_name && !voucherData.customer_id) {
      return NextResponse.json({ error: "اسم العميل أو رقم العميل مطلوب" }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "عناصر الفاتورة مطلوبة" }, { status: 400 })
    }

    const voucher = await createVoucher(voucherData, items)
    return NextResponse.json(voucher, { status: 201 })
  } catch (error: any) {
    console.error("Create voucher API error:", error)
    return NextResponse.json(
      {
        error: error.message || "حدث خطأ في إنشاء الفاتورة",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
