import { type NextRequest, NextResponse } from "next/server"
import { listSiblingOrderItems } from "@/lib/task-orders"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const items = await listSiblingOrderItems(Number(params.id))
    return NextResponse.json(items)
  } catch (error) {
    console.error("Error fetching sibling order items:", error)
    return NextResponse.json({ error: "فشل في جلب أصناف الطلبية" }, { status: 500 })
  }
}
