import { type NextRequest, NextResponse } from "next/server"
import { adminTransferTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    if (!data.userId || !data.reason) {
      return NextResponse.json({ error: "معرف المستخدم وسبب التحويل مطلوبان" }, { status: 400 })
    }
    const item = await adminTransferTask(Number(params.id), String(data.userId), {
      toSectionId: data.toSectionId ? Number(data.toSectionId) : null,
      toUserId: data.toUserId ? String(data.toUserId) : null,
      reason: data.reason,
    })
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error transferring task:", error)
    return NextResponse.json({ error: error?.message || "فشل في تحويل المهمة" }, { status: 400 })
  }
}
