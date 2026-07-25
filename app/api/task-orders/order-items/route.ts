import { type NextRequest, NextResponse } from "next/server"
import { listOrderItems, createOrderItem } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get("workflow_id")
    const status = searchParams.get("status")
    const search = searchParams.get("search")
    const items = await listOrderItems({
      workflowId: workflowId ? Number(workflowId) : undefined,
      status: status || undefined,
      search: search || undefined,
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching order items:", error)
    return NextResponse.json({ error: "فشل في جلب أصناف الطلبية" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    if (!data.title || !data.userId) {
      return NextResponse.json({ error: "العنوان والمستخدم مطلوبان" }, { status: 400 })
    }
    const item = await createOrderItem({
      customerOrderId: data.customerOrderId ? Number(data.customerOrderId) : null,
      title: data.title,
      description: data.description,
      productId: data.productId ? Number(data.productId) : null,
      itemType: data.itemType || null,
      workflowId: data.workflowId ? Number(data.workflowId) : null,
      qty: data.qty ? Number(data.qty) : null,
      attributes: data.attributes || {},
      priority: data.priority,
      createdBy: String(data.userId),
    })
    return NextResponse.json(item, { status: 201 })
  } catch (error: any) {
    console.error("Error creating order item:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنشاء الصنف" }, { status: 400 })
  }
}
