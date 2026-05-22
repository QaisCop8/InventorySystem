import { type NextRequest, NextResponse } from "next/server"
import sql, { updateSalesOrder, deleteSalesOrder,updatePrintSalesOrder } from "@/lib/orders"

export async function PUT_old(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    console.log("[v0] PUT /api/orders/sales/[id] - Starting request processing")

    const orderId = Number.parseInt(params.id)
    if (Number.isNaN(orderId)) {
      console.error("[v0] Invalid order ID:", params.id)
      return NextResponse.json({ error: "رقم الطلبية غير صحيح" }, { status: 400 })
    }

    const requestData = await request.json()
    console.log("[v0] Update request data received for order:", orderId)

    let orderData, items

    if (requestData.orderData && requestData.items) {
      // New structure: { orderData, items }
      orderData = requestData.orderData
      items = requestData.items
    } else {
      // Legacy structure: direct order data with items array
      const { items: itemsArray, ...orderFields } = requestData
      orderData = orderFields
      items = itemsArray || []
    }

    if (!orderData) {
      console.error("[v0] Validation failed: No order data")
      return NextResponse.json({ error: "بيانات الطلبية مطلوبة" }, { status: 400 })
    }

    if (!items || items.length === 0) {
      console.error("[v0] Validation failed: No items")
      return NextResponse.json({ error: "عناصر الطلبية مطلوبة" }, { status: 400 })
    }

    console.log("[v0] Validation passed, updating order...")
    const order = await updateSalesOrder(orderId, orderData, items)
    console.log("[v0] Order updated successfully:", order.id)

    return NextResponse.json(order)
  } catch (error: any) {
    console.error("[v0] Update sales order API error:", error)
    console.error("[v0] Error stack:", error.stack)

    const errorMessage = error.message || "حدث خطأ في تحديث طلبية المبيعات"
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[v0] DELETE /api/orders/sales/[id] - Starting request processing");

    const orderId = Number.parseInt(params.id);
    if (Number.isNaN(orderId)) {
      return NextResponse.json(
        { error: "رقم الطلبية غير صحيح" },
        { status: 400 }
      );
    }

    // احصل على userId من الجلسة أو request headers (مثال)
    const userId = request.headers.get("x-user-id") || "";

    // احصل على order_type إذا تريد استخدامه كـ voucherType
    const orderData = await sql`SELECT order_type FROM orders WHERE id = ${orderId}`;
    if (!orderData || orderData.length === 0) {
      return NextResponse.json(
        { error: "الطلبية غير موجودة" },
        { status: 404 }
      );
    }

    const voucherType = orderData[0].order_type;
    await deleteSalesOrder(orderId, voucherType, userId);

    return NextResponse.json({ message: "تم حذف الطلبية بنجاح" });
  } catch (error: any) {
    console.error("[v0] Delete sales order API error:", error);
    console.error("[v0] Error stack:", error.stack);

    const errorMessage = error.message || "حدث خطأ في حذف طلبية المبيعات";
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}


export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[v0] Print /api/orders/sales/[id] - Starting request processing");

    const orderId = Number.parseInt(params.id);
    if (Number.isNaN(orderId)) {
      return NextResponse.json(
        { error: "رقم الطلبية غير صحيح" },
        { status: 400 }
      );
    }

    // احصل على userId من الجلسة أو request headers (مثال)
    const userId = request.headers.get("x-user-id") || "";

    // احصل على order_type إذا تريد استخدامه كـ voucherType
    const orderData = await sql`SELECT order_type FROM orders WHERE id = ${orderId}`;
    if (!orderData || orderData.length === 0) {
      return NextResponse.json(
        { error: "الطلبية غير موجودة" },
        { status: 404 }
      );
    }

    const voucherType = orderData[0].order_type;
    await updatePrintSalesOrder(orderId, voucherType, userId);

    return NextResponse.json({ message: "" });
  } catch (error: any) {
    console.error("[v0] Delete sales order API error:", error);
    console.error("[v0] Error stack:", error.stack);

    const errorMessage = error.message || "حدث خطأ في طباعة الطلبية ";
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

