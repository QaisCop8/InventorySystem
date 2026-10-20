import { type NextRequest, NextResponse } from "next/server"
import { withVoucherAudit } from "@/lib/voucher-audit"
import { getSalesOrders, getPurchaseOrders, createOrder, createPurchaseOrder } from "@/lib/orders"
import { createOrderWorkflowStatus } from "@/lib/workflow"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { getTenantPool } from "@/lib/database"
import { validateAccountStops } from "@/lib/account-stops"

// حالات الطلبية/الأصناف (نفس منطق شامل ShamelAPI OrderItemsM): 1 غير جاهز، 2 جاهز، 3 مرسلة جزئياً، 4 مرسلة كلياً،
// 5 ملغي، 6 مغلق.
//  • "مرسلة جزئياً/كلياً" لا يختارها المستخدم أبداً — تُحسب فقط من فواتير المبيعات المرتبطة بالسطر
//    (refreshSalesOrderFulfillment بـapp/api/sales-vouchers/route.ts عند حفظ/إلغاء الفاتورة، وهنا عند حفظ الطلبية).
//  • سطر مرتبط بفاتورة: حالته من الفواتير (3/4)، ويُسمح فقط بإغلاق سطر مرسل جزئياً (6).
//  • سطر غير مرتبط: يدوي بين غير جاهز/جاهز/ملغي/مغلق.
//  • طلبية لها سطر مرتبط بفاتورة: لا تُغيَّر حالتها يدوياً (CheckOrderReadyStatus في شامل) إلا للإغلاق.
const MANUAL_STATUSES = [1, 2, 5, 6]
const SENT_STATUS_ERROR = "حالة \"مرسلة جزئياً/كلياً\" تتحدد تلقائياً من فواتير المبيعات فقط"

async function normalizeSalesOrderStatuses(orderData: any, items: any[]) {
  if (Number(orderData?.order_type || 1) !== 1) return
  const orderId = Number(orderData?.id || 0)
  const manualOr = (value: unknown, fallback: number) => (MANUAL_STATUSES.includes(Number(value)) ? Number(value) : fallback)

  // طلبية جديدة: لا فواتير مرتبطة بعد ⇐ لا حالات إرسال
  if (!orderId) {
    if ([3, 4].includes(Number(orderData.order_status))) throw new Error(SENT_STATUS_ERROR)
    for (const item of items) item.item_status = manualOr(item.item_status ?? 1, 1)
    return
  }

  const pool = await getTenantPool()
  const currentResult = await pool.query(
    `SELECT order_status FROM orders WHERE id = $1 AND COALESCE(deleted, false) = false`,
    [orderId],
  )
  if (currentResult.rows.length === 0) throw new Error("الطلبية غير موجودة")

  const currentStatus = Number(currentResult.rows[0].order_status || 1)
  const requestedStatus = Number(orderData.order_status || 1)

  const statusRows = await pool.query(
    `SELECT oi.id, oi.product_id, oi.quantity, COALESCE(oi.bonus, 0) AS bonus, oi.item_status,
            COALESCE(SUM(vi.qnty) FILTER (WHERE vh.id IS NOT NULL AND vi.delivery_item_id IS NULL), 0) AS sent_quantity,
            COALESCE(SUM(vi.bonus) FILTER (WHERE vh.id IS NOT NULL AND vi.delivery_item_id IS NULL), 0) AS sent_bonus
     FROM order_items oi
     LEFT JOIN voucher_items_tbl vi ON vi.order_item_id = oi.id
     LEFT JOIN voucher_header_tbl vh ON vh.id = vi.voucher_id AND vh.vch_type IN (12, 13) AND COALESCE(vh.status, 1) <> 3
     WHERE oi.order_id = $1
     GROUP BY oi.id, oi.product_id, oi.quantity, oi.bonus, oi.item_status
     ORDER BY oi.id`,
    [orderId],
  )
  const available = [...statusRows.rows]
  const anyInvoiced = statusRows.rows.some((row: any) => Number(row.sent_quantity) > 0 || Number(row.sent_bonus) > 0)

  // الطلبية المرتبطة بفاتورة: تُغلق فقط (أو تبقى كما هي) — أي حالة يدوية أخرى مرفوضة كما في شامل
  if (anyInvoiced && requestedStatus !== currentStatus && requestedStatus !== 6) {
    throw new Error("لا يمكن تغيير حالة الطلبية بعد ارتباطها بفاتورة مبيعات — تتغير تلقائياً من الفواتير (يمكن إغلاقها فقط)")
  }
  if (!anyInvoiced && [3, 4].includes(requestedStatus)) {
    // أُلغيت فواتيرها بعد أن كانت مرسلة ⇐ تعود "جاهز" (نفس UndoLinkWithVoucher في شامل)؛ اختيارها يدوياً مرفوض
    if (requestedStatus !== currentStatus) throw new Error(SENT_STATUS_ERROR)
    orderData.order_status = 2
  }

  for (const item of items) {
    let index = available.findIndex((row: any) => Number(row.id) === Number(item.order_item_id || 0))
    if (index < 0) index = available.findIndex((row: any) => Number(row.product_id) === Number(item.product_id))
    const requested = Number(item.item_status || 1)
    if (index < 0) {
      // سطر جديد: غير مرتبط بأي فاتورة ⇐ يدوي فقط
      if ([3, 4].includes(requested)) throw new Error(SENT_STATUS_ERROR)
      item.item_status = requestedStatus === 6 ? 6 : manualOr(requested, 1)
      continue
    }
    const oldItem = available.splice(index, 1)[0]
    const fullySent = Number(oldItem.sent_quantity) >= Number(oldItem.quantity) && Number(oldItem.sent_bonus) >= Number(oldItem.bonus)
    const partiallySent = !fullySent && (Number(oldItem.sent_quantity) > 0 || Number(oldItem.sent_bonus) > 0)

    if (fullySent) { item.item_status = 4; continue }
    if (partiallySent) {
      // مرسل جزئياً: من الفواتير، أو مغلق (إغلاق المتبقي) — يدوياً أو بإغلاق الطلبية كاملة
      item.item_status = requested === 6 || requestedStatus === 6 ? 6 : 3
      continue
    }
    // غير مرتبط بفاتورة: لا يمكن اختيار مرسل جزئياً/كلياً يدوياً
    if ([3, 4].includes(requested) && requested !== Number(oldItem.item_status)) throw new Error(SENT_STATUS_ERROR)
    // (سطر كان مرسلاً ثم أُلغيت فاتورته يعود "جاهز")
    item.item_status = requestedStatus === 6 ? 6 : manualOr(requested, [3, 4].includes(Number(oldItem.item_status)) ? 2 : manualOr(oldItem.item_status, 1))
  }

  // حالة الطلبية المرتبطة بفواتير تُشتق من أسطرها (ما لم تُغلق)
  if (anyInvoiced && requestedStatus !== 6) {
    const statuses = items.map((item) => Number(item.item_status || 1)).filter((status) => status !== 5)
    orderData.order_status = statuses.length > 0 && statuses.every((status) => status === 4 || status === 6) && statuses.some((status) => status === 4) ? 4 : 3
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "1" // 1 = sales, 2 = purchase
    const authorization = await authorizeTransaction(request, Number(type) === 2 ? "purchase_order" : "sales_order", "view")
    if (!authorization.ok) return authorization.response

    const filters = {
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      salesman: searchParams.get("salesman") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      customerId: searchParams.get("customerId") ? Number.parseInt(searchParams.get("customerId")!) : undefined,
      order_type : type,
      branchIds: authorization.branchIds,
    }

    const orders = await getSalesOrders(filters)

    return NextResponse.json(orders)
  } catch (error: any) {
    console.error("Orders API error:", error)
    return NextResponse.json({ error: error?.message || "حدث خطأ في جلب الطلبات" }, { status: 500 })
  }
}

async function postHandler(request: NextRequest) {
  try {
    const requestData = await request.json(); // read once

    const { type, orderData: od, items: it, ...rest } = requestData;

    const orderData = od || rest; // fallback if no nested orderData
    const items = it || requestData.items || [];

    const action = orderData?.id && Number(orderData.id) > 0 ? "update" : "create"
    const orderFamily = Number(orderData?.order_type ?? type ?? 1) === 2 ? "purchase_order" : "sales_order"
    const authorization = await authorizeTransaction(request, orderFamily, action, orderData?.branch_id)
    if (!authorization.ok) return authorization.response
    orderData.branch_id = authorization.branchId

    if (!orderData) return NextResponse.json({ error: "بيانات الطلبية مطلوبة" }, { status: 400 });
    if (!orderData.customer_name && !orderData.customer_id)
      return NextResponse.json({ error: "اسم العميل أو رقم العميل مطلوب" }, { status: 400 });
    if (!items || items.length === 0)
      return NextResponse.json({ error: "عناصر الطلبية مطلوبة" }, { status: 400 });
    // إيقاف الحركات على حساب العميل لنوع "طلبية مبيعات" (1) — أو "طلبية مشتريات" (2) لطلبيات الشراء
    const stopError = await validateAccountStops([orderData.customer_id], Number(orderData.order_type) === 2 ? 2 : 1, orderData.order_date)
    if (stopError) return NextResponse.json({ error: stopError }, { status: 400 });

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

// أرشفة السندات (تقرير ارشفة السندات): نسخة قبل/بعد + نوع العملية والمستخدم
export const POST = withVoucherAudit(postHandler, { source: "order", kind: "save" })
