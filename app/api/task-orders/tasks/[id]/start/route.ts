import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../../../_auth"
import { startTask } from "@/lib/task-orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const item = await startTask(Number(params.id), actingUserId)
    return NextResponse.json(item)
  } catch (error: any) {
    console.error("Error starting task:", error)
    return NextResponse.json({ error: error?.message || "فشل في بدء المهمة" }, { status: 400 })
  }
}
