import { type NextRequest, NextResponse } from "next/server"
import { getTenantPool } from "@/lib/database"
import { deleteSalesOrder, updatePrintSalesOrder } from "@/lib/orders"
import { authorizeTransaction } from "@/lib/transaction-permissions"

async function getOrderType(id: number): Promise<number | null> {
  const result = await (await getTenantPool()).query(`SELECT order_type FROM orders WHERE id = $1`, [id])
  return result.rows[0]?.order_type ?? null
}

async function getOrderBranch(id: number): Promise<number | null> {
  const result = await (await getTenantPool()).query(`SELECT branch_id FROM orders WHERE id = $1`, [id])
  return result.rows[0]?.branch_id ?? null
}

async function getOrderStatus(id: number): Promise<number | null> {
  const result = await (await getTenantPool()).query(`SELECT order_status FROM orders WHERE id = $1`, [id])
  return result.rows[0]?.order_status == null ? null : Number(result.rows[0].order_status)
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
      const authorization = await authorizeTransaction(request, "sales_order", "update", await getOrderBranch(id))
      if (!authorization.ok) return authorization.response
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

    const orderStatus = await getOrderStatus(id)
    if (orderStatus === null) {
      return NextResponse.json({ error: "الطلبية غير موجودة" }, { status: 404 })
    }
    if (![1, 2].includes(orderStatus)) {
      return NextResponse.json(
        { error: "لا يمكن حذف الطلبية، تم إصدار فاتورة/فواتير من الطلبية" },
        { status: 400 },
      )
    }

    const authorization = await authorizeTransaction(request, "sales_order", "delete", await getOrderBranch(id))
    if (!authorization.ok) return authorization.response
    await deleteSalesOrder(id, orderType, userId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Delete sales order API error:", error)
    return NextResponse.json({ error: error?.message || "حدث خطأ أثناء حذف الطلبية" }, { status: 400 })
  }
}
