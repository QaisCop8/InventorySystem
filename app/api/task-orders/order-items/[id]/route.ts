import { type NextRequest, NextResponse } from "next/server"
import { getOrderItemDetail } from "@/lib/task-orders"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await getOrderItemDetail(Number(params.id))
    if (!item) return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 })
    return NextResponse.json(item)
  } catch (error) {
    console.error("Error fetching order item:", error)
    return NextResponse.json({ error: "فشل في جلب الصنف" }, { status: 500 })
  }
}
