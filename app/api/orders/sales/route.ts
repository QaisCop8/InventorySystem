import { type NextRequest, NextResponse } from "next/server"
import { getSalesOrders, getPurchaseOrders, createOrder, createPurchaseOrder } from "@/lib/orders"
import { createOrderWorkflowStatus } from "@/lib/workflow"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { getTenantPool } from "@/lib/database"

async function normalizeSalesOrderStatuses(orderData: any, items: any[]) {
  const orderId = Number(orderData?.id || 0)
  if (!orderId || Number(orderData?.order_type || 1) !== 1) return

  const pool = await getTenantPool()
  const currentResult = await pool.query(
    `SELECT order_status FROM orders WHERE id = $1 AND COALESCE(deleted, false) = false`,
    [orderId],
  )
  if (currentResult.rows.length === 0) throw new Error("الطلبية غير موجودة")

  const currentStatus = Number(currentResult.rows[0].order_status || 1)
  const requestedStatus = Number(orderData.order_status || 1)
  if ([3, 4].includes(currentStatus) && requestedStatus !== currentStatus) {
    throw new Error("لا يمكن تغيير حالة طلبية مرسلة جزئياً أو مرسلة كلياً")
  }

  const statusRows = await pool.query(
    `SELECT oi.id, oi.product_id, oi.quantity, COALESCE(oi.bonus, 0) AS bonus, oi.item_status,
            COALESCE(SUM(vi.qnty) FILTER (WHERE vh.id IS NOT NULL), 0) AS sent_quantity,
            COALESCE(SUM(vi.bonus) FILTER (WHERE vh.id IS NOT NULL), 0) AS sent_bonus
     FROM order_items oi
     LEFT JOIN voucher_items_tbl vi ON vi.order_item_id = oi.id
     LEFT JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id AND vh.vch_type = 12 AND COALESCE(vh.status, 1) <> 3
     WHERE oi.order_id = $1
     GROUP BY oi.id, oi.product_id, oi.quantity, oi.bonus, oi.item_status
     ORDER BY oi.id`,
    [orderId],
  )
  const available = [...statusRows.rows]
  for (const item of items) {
    let index = available.findIndex((row: any) => Number(row.id) === Number(item.order_item_id || 0))
    if (index < 0) index = available.findIndex((row: any) => Number(row.product_id) === Number(item.product_id))
    if (index < 0) continue
    const oldItem = available.splice(index, 1)[0]
    const fullySent = Number(oldItem.sent_quantity) >= Number(oldItem.quantity) && Number(oldItem.sent_bonus) >= Number(oldItem.bonus)
    const partiallySent = Number(oldItem.sent_quantity) > 0 || Number(oldItem.sent_bonus) > 0

    if (currentStatus === 4 && Number(item.item_status) !== Number(oldItem.item_status)) {
      throw new Error("لا يمكن تغيير حالة الصنف عندما تكون الطلبية مرسلة كلياً")
    }
    if (requestedStatus === 6) {
      item.item_status = fullySent ? 4 : 6
    } else if (currentStatus === 6 && [1, 2].includes(requestedStatus)) {
      item.item_status = fullySent ? 4 : partiallySent ? 3 : requestedStatus
    }
  }

  if (currentStatus === 6 && [1, 2].includes(requestedStatus)) {
    const statuses = items.map((item) => Number(item.item_status || 1))
    orderData.order_status = statuses.length > 0 && statuses.every((status) => status === 4)
      ? 4
      : statuses.some((status) => status === 3 || status === 4) ? 3 : requestedStatus
  }
}

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

    await normalizeSalesOrderStatuses(orderData, items)

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
