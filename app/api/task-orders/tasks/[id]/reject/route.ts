import { type NextRequest, NextResponse } from "next/server"
import { rejectTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    if (!data.userId || !data.reason) {
      return NextResponse.json({ error: "معرف المستخدم وسبب الرفض مطلوبان" }, { status: 400 })
    }
    const item = await rejectTask(Number(params.id), String(data.userId), data.reason, !!data.force)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error rejecting task:", error)
    return NextResponse.json({ error: error?.message || "فشل في رفض المهمة" }, { status: 400 })
  }
}
