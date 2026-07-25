import { type NextRequest, NextResponse } from "next/server"
import { stopTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const item = await stopTask(Number(params.id), String(data.userId), data.note)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error stopping task:", error)
    return NextResponse.json({ error: error?.message || "فشل في إيقاف المهمة" }, { status: 400 })
  }
}
