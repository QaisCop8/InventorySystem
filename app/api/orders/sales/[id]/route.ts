import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"
import { deleteSalesOrder, updatePrintSalesOrder } from "@/lib/orders"

async function getOrderType(id: number): Promise<number | null> {
  const result = await (await getTenantPool()).query(`SELECT order_type FROM orders WHERE id = $1`, [id])
  return result.rows[0]?.order_type ?? null
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const userId = request.headers.get("x-user-id")
    const data = await request.json()

    const orderType = await getOrderType(id)
    if (orderType === null) {
      return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
    }

    if (data.printed) {
      await updatePrintSalesOrder(id, orderType, userId)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Update sales order API error:", error)
    return NextResponse.json({ error: error?.message || "حدث خطأ أثناء تحديث الطلبية" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id)
    const userId = request.headers.get("x-user-id")

    const orderType = await getOrderType(id)
    if (orderType === null) {
      return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
    }

    await deleteSalesOrder(id, orderType, userId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete sales order API error:", error)
    return NextResponse.json({ error: error?.message || "حدث خطأ أثناء حذف الطلبية" }, { status: 400 })
  }
}
