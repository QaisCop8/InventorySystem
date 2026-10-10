import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../../../_auth"
import { adminTransferTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    if (!data.reason) {
      return NextResponse.json({ error: "سبب التحويل مطلوب" }, { status: 400 })
    }
    const item = await adminTransferTask(Number(params.id), actingUserId, {
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
