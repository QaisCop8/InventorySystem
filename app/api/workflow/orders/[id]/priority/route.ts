import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

const VALID_PRIORITIES = ["low", "normal", "high", "urgent"]

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const orderId = Number(params.id)
    if (!orderId) {
      return NextResponse.json({ error: "معرف الطلبية غير صالح" }, { status: 400 })
    }

    const { orderType, priority_level } = await request.json()

    if (orderType !== "sales" && orderType !== "purchase") {
      return NextResponse.json({ error: "نوع الطلبية غير صالح" }, { status: 400 })
    }
    if (!VALID_PRIORITIES.includes(priority_level)) {
      return NextResponse.json({ error: "مستوى الأولوية غير صالح" }, { status: 400 })
    }

    const result = await sql`
      UPDATE order_workflow_status
      SET priority_level = ${priority_level}, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ${orderId} AND order_type = ${orderType}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "لا توجد حالة سير عمل لهذه الطلبية" }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error("Error updating order priority:", error)
    return NextResponse.json({ error: "فشل في تحديث الأولوية" }, { status: 500 })
  }
}
