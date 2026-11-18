import { NextResponse, type NextRequest } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { vanCarFor, vanForUser } from "@/lib/van-car"

export const dynamic = "force-dynamic"

// صندوق السيارة المقفل (lib/van-car.ts):
//   GET ?mine=1                                   ⇐ مندوب المستخدم الحالي وسيارته (تعبئة افتراضية)
//   GET ?salesman_id=..&warehouse_ids=1,2         ⇐ سيارة السند (لقفل حقل الصندوق في الشاشة)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request)
    if (!session) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const params = request.nextUrl.searchParams
    if (params.get("mine") === "1") return NextResponse.json({ van: await vanForUser(session.user_id) }, { headers: { "Cache-Control": "no-store" } })
    const warehouseIds = String(params.get("warehouse_ids") || "").split(",").map(Number).filter((id) => id > 0)
    const car = await vanCarFor({ salesmanId: Number(params.get("salesman_id")) || null, warehouseIds })
    return NextResponse.json({ car }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("cash-van car GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل سيارة المندوب" }, { status: 500 })
  }
}
