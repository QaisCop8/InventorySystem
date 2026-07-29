import { type NextRequest, NextResponse } from "next/server"
import { advanceOrderToNextStage } from "@/lib/workflow"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const orderId = Number(params.id)
    if (!orderId) {
      return NextResponse.json({ error: "معرف الطلبية غير صالح" }, { status: 400 })
    }

    const body = await request.json()
    const { orderType, performedByUser, performedByDepartment, notes } = body

    if (orderType !== "sales" && orderType !== "purchase") {
      return NextResponse.json({ error: "نوع الطلبية غير صالح" }, { status: 400 })
    }

    const updated = await advanceOrderToNextStage(
      orderId,
      orderType,
      performedByUser || "غير معروف",
      performedByDepartment || "عام",
      notes,
    )

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Error advancing order:", error)
    return NextResponse.json({ error: error?.message || "فشل في تقديم الطلبية للمرحلة التالية" }, { status: 400 })
  }
}
