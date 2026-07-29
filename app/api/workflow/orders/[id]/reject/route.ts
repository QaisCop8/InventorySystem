import { type NextRequest, NextResponse } from "next/server"
import { rejectOrderToAlternativeStage } from "@/lib/workflow"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const orderId = Number(params.id)
    if (!orderId) {
      return NextResponse.json({ error: "معرف الطلبية غير صالح" }, { status: 400 })
    }

    const body = await request.json()
    const { orderType, performedByUser, performedByDepartment, reason, notes } = body

    if (orderType !== "sales" && orderType !== "purchase") {
      return NextResponse.json({ error: "نوع الطلبية غير صالح" }, { status: 400 })
    }
    if (!reason || !String(reason).trim()) {
      return NextResponse.json({ error: "سبب الرفض مطلوب" }, { status: 400 })
    }

    const updated = await rejectOrderToAlternativeStage(
      orderId,
      orderType,
      performedByUser || "غير معروف",
      performedByDepartment || "عام",
      reason,
      notes,
    )

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("Error rejecting order:", error)
    return NextResponse.json({ error: error?.message || "فشل في رفض الطلبية" }, { status: 400 })
  }
}
