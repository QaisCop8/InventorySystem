import { type NextRequest, NextResponse } from "next/server"
import { completeTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    if (!data.userId) return NextResponse.json({ error: "معرف المستخدم مطلوب" }, { status: 400 })
    const item = await completeTask(Number(params.id), String(data.userId), data.note, !!data.force)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error completing task:", error)
    return NextResponse.json({ error: error?.message || "فشل في إنهاء المهمة" }, { status: 400 })
  }
}
