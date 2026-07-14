import { type NextRequest, NextResponse } from "next/server"
import { getPurchaseOrders, createPurchaseOrder } from "@/lib/orders"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filters = {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      supplierId: searchParams.get("supplierId") ? Number.parseInt(searchParams.get("supplierId")!) : undefined,
    }

    const orders = await getPurchaseOrders(filters)

    return NextResponse.json(orders)
  } catch (error) {
    console.error("Purchase orders API error:", error)
    return NextResponse.json({ error: "حدث خطأ في جلب طلبات الشراء" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { orderData, items } = await request.json()

    if (!orderData.supplier_name || !items || items.length === 0) {
      return NextResponse.json({ error: "بيانات الطلبية غير مكتملة" }, { status: 400 })
    }

    const order = await createPurchaseOrder(orderData, items)

    return NextResponse.json(order)
  } catch (error) {
    console.error("Create purchase order API error:", error)
    return NextResponse.json({ error: "حدث خطأ في إنشاء طلبية الشراء" }, { status: 500 })
  }
}

