import { type NextRequest, NextResponse } from "next/server"
import {
  getOrderItemDetail,
  updateOrderItemQty,
  updatePreparedQty,
  deleteOrderItem,
  setLoadingChecked,
} from "@/lib/task-orders"

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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const userId = String(data.userId)

    let item
    if (data.action === "qty") {
      item = await updateOrderItemQty(id, Number(data.value), userId)
    } else if (data.action === "prepared_qty") {
      item = await updatePreparedQty(id, Number(data.value), userId)
    } else if (data.action === "loading_checked") {
      item = await setLoadingChecked(id, !!data.value, userId)
    } else {
      return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
    }
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error updating order item:", error)
    return NextResponse.json({ error: error?.message || "فشل في تعديل الصنف" }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    await deleteOrderItem(id, userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting order item:", error)
    return NextResponse.json({ error: error?.message || "فشل في حذف الصنف" }, { status: 400 })
  }
}
