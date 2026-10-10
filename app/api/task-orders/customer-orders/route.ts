import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../_auth"
import { listCustomerOrders, createCustomerOrder } from "@/lib/task-orders"

export async function GET() {
  try {
    const orders = await listCustomerOrders()
    return NextResponse.json(orders)
  } catch (error) {
    console.error("Error fetching customer orders:", error)
    return NextResponse.json({ error: "فشل في جلب الطلبيات" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const order = await createCustomerOrder({
      customerId: data.customerId ? Number(data.customerId) : null,
      priority: data.priority,
      createdBy: actingUserId,
    })
    return NextResponse.json(order, { status: 201 })
  } catch (error: any) {
    console.error("Error creating customer order:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنشاء الطلبية" }, { status: 500 })
  }
}
