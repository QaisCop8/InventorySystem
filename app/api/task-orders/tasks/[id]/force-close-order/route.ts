import { type NextRequest, NextResponse } from "next/server"
import { resolveActingUserId, unauthenticated } from "../../../_auth"
import { forceCloseOrderFromTaskInstance } from "@/lib/orders"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    const actingUserId = await resolveActingUserId(request)
    if (!actingUserId) return unauthenticated()
    const result = await forceCloseOrderFromTaskInstance(Number(params.id), actingUserId, data.note)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error force-closing order:", error)
    return NextResponse.json({ error: error?.message || "فشل في الإغلاق الإجباري" }, { status: 400 })
  }
}
