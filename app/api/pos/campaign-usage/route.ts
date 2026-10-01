import { NextRequest, NextResponse } from "next/server"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"
import { ensurePosTables, getPosPoint, requestUserId } from "../_lib"
import { getPosCampaignUsage } from "@/lib/pos-campaign-storage"

export async function GET(request: NextRequest) {
  try {
    await ensureSalesTables()
    await ensurePosTables()
    const pointId = Number(request.nextUrl.searchParams.get("point_id") || 0)
    const userId = requestUserId(request)
    if (!pointId || !userId) return NextResponse.json({ error: "نقطة البيع والمستخدم مطلوبان" }, { status: 400 })
    const point = await getPosPoint(pointId, userId)
    if (!point) return NextResponse.json({ error: "نقطة البيع غير متاحة لهذا المستخدم" }, { status: 403 })
    return NextResponse.json({ campaignUsage: await getPosCampaignUsage() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل استهلاك الحملات" }, { status: 500 })
  }
}
