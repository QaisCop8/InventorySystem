import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../../../_auth"
import { approveTaskCustomerOrder } from "@/lib/orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const order = await approveTaskCustomerOrder(id, actingUserId, data.receivedBy || null)
    return NextResponse.json(order)
  } catch (error: any) {
    console.error("Error approving customer order:", error)
    return NextResponse.json({ error: error?.message || "فشل في اعتماد الطلبية" }, { status: 400 })
  }
}
