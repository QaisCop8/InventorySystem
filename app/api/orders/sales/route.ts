import { type NextRequest, NextResponse } from "next/server"
import { getSalesOrders, getPurchaseOrders, createOrder, createPurchaseOrder } from "@/lib/orders"
import { createOrderWorkflowStatus } from "@/lib/workflow"
import { authorizeTransaction } from "@/lib/transaction-permissions"

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "sales_order", "view")
    if (!authorization.ok) return authorization.response
    const { searchParams } = new URL(request.url)

    const type = searchParams.get("type") || "1" // 1 = sales, 2 = purchase
    const filters = {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      salesman: searchParams.get("salesman") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      customerId: searchParams.get("customerId") ? Number.parseInt(searchParams.get("customerId")!) : undefined,
      order_type : type,
      branchId: authorization.branchId,
    }

    const orders = await getSalesOrders(filters)

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Orders API error:", error)
    return NextResponse.json({ error: error?.message || "حدث خطأ في جلب الطلبات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestData = await request.json(); // read once

    const { type, orderData: od, items: it, ...rest } = requestData;

    const orderData = od || rest; // fallback if no nested orderData
    const items = it || requestData.items || [];

    const action = orderData?.id && Number(orderData.id) > 0 ? "update" : "create"
    const authorization = await authorizeTransaction(request, "sales_order", action, orderData?.branch_id)
    if (!authorization.ok) return authorization.response
    orderData.branch_id = authorization.branchId

    if (!orderData) return NextResponse.json({ error: "بيانات الطلبية مطلوبة" }, { status: 400 });
    if (!orderData.customer_name && !orderData.customer_id)
      return NextResponse.json({ error: "اسم العميل أو رقم العميل مطلوب" }, { status: 400 });
    if (!items || items.length === 0)
      return NextResponse.json({ error: "عناصر الطلبية مطلوبة" }, { status: 400 });

    const isNewOrder = !orderData.id || orderData.id <= 0;

    const order = await createOrder(orderData, items);

    if (isNewOrder) {
      try {
        await createOrderWorkflowStatus(order.id, "sales", order.order_number);
      } catch (workflowError) {
        console.error("Error creating order workflow status:", workflowError);
        // لا يُفشِل إنشاء الطلبية نفسها إن تعذّر إنشاء سجل سير العمل (كأن تسلسل sales_order
        // الافتراضي غير مُهيَّأ بعد على هذه القاعدة).
      }
    }

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error("Create order API error:", error);
    return NextResponse.json(
      {
        error: error.message || "حدث خطأ في إنشاء الطلبية",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
