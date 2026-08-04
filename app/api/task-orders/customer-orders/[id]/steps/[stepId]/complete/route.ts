import { type NextRequest, NextResponse } from "next/server"
import { completeStepForOrder } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const item = await completeStepForOrder(Number(params.id), Number(params.stepId), String(data.userId), data.note)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error completing step for order:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنهاء المرحلة" }, { status: 400 })
  }
}
