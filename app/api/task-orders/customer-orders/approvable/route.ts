import { type NextRequest, NextResponse } from "next/server"
import { requireTaskPermission } from "../../_auth"
import { listApprovableCustomerOrders } from "@/lib/task-orders"

export async function GET(request: NextRequest) {
  try {
    const denied = await requireTaskPermission(request, "task_order_approval", "access")
    if (denied) return denied
    const orders = await listApprovableCustomerOrders()
    return NextResponse.json(orders)
  } catch (error) {
    console.error("Error fetching approvable customer orders:", error)
    return NextResponse.json({ error: "فشل في جلب الطلبيات القابلة للاعتماد" }, { status: 500 })
  }
}
