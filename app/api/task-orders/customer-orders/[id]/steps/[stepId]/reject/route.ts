import { type NextRequest, NextResponse } from "next/server"
import { rejectStepForOrder } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    if (!data.reason) return NextResponse.json({ error: "سبب الرفض مطلوب" }, { status: 400 })
    const item = await rejectStepForOrder(Number(params.id), Number(params.stepId), String(data.userId), String(data.reason))
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error rejecting step for order:", error)
    return NextResponse.json({ error: error?.message || "فشل في رفض المرحلة" }, { status: 400 })
  }
}
