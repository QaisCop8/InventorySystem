import { type NextRequest, NextResponse } from "next/server"
import { forceCloseOrderFromTaskInstance } from "@/lib/orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const result = await forceCloseOrderFromTaskInstance(Number(params.id), String(data.userId), data.note)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error force-closing order:", error)
    return NextResponse.json({ error: error?.message || "فشل في الإغلاق الإجباري" }, { status: 400 })
  }
}
