import { type NextRequest, NextResponse } from "next/server"
import sql, { UpdateOrderStatus } from "@/lib/orders"




export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = Number.parseInt(params.id);
    if (Number.isNaN(orderId)) {
      return NextResponse.json(
        { error: "رقم الطلبية غير صحيح" },
        { status: 400 }
      );
    }
    
    // ✅ قراءة القيم من body
    const body = await request.json();
    const { statusOrDecision,received_by } = body;

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
    await UpdateOrderStatus(orderId,statusOrDecision, voucherType,userId,received_by);

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

