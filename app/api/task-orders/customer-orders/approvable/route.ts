import { NextResponse } from "next/server"
import { listApprovableCustomerOrders } from "@/lib/task-orders"

export async function GET() {
  try {
    const orders = await listApprovableCustomerOrders()
    return NextResponse.json(orders)
  } catch (error) {
    console.error("Error fetching approvable customer orders:", error)
    return NextResponse.json({ error: "فشل في جلب الطلبيات القابلة للاعتماد" }, { status: 500 })
  }
}
