import { type NextRequest, NextResponse } from "next/server"
import { approveTaskCustomerOrder } from "@/lib/orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const order = await approveTaskCustomerOrder(id, String(data.userId), data.receivedBy || null)
    return NextResponse.json(order)
  } catch (error: any) {
    console.error("Error approving customer order:", error)
    return NextResponse.json({ error: error?.message || "فشل في اعتماد الطلبية" }, { status: 400 })
  }
}
