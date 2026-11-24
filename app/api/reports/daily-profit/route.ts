import { NextResponse, type NextRequest } from "next/server"
import { reportAccessDenied } from "@/lib/report-permissions"
import { getSessionUser } from "@/lib/tenant-auth"
import { briefingBranchIds } from "@/lib/morning-briefing"
import { buildDailyProfit } from "@/lib/daily-profit"

export const dynamic = "force-dynamic"

// «ربحك اليومي بضغطة»: GET ?date=YYYY-MM-DD (افتراضياً اليوم) ⇐ ربح اليوم + مقارنة بالأمس · ?check=1 للتحقق من الصلاحية فقط
// (زر الهيدر يختفي لمن لا يملك صلاحية تقارير الأرباح). الصلاحية = أي صلاحية استعلام على تقارير الأرباح.
const PROFIT_REPORTS = ["period-profit-report", "items-profit-report", "invoice-profit-report"]

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const previousDay = (day: string) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() - 1)
  return isoDay(date)
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const denied = await reportAccessDenied(request, PROFIT_REPORTS)
    if (denied) return denied
    const params = request.nextUrl.searchParams
    if (params.get("check") === "1") return NextResponse.json({ ok: true })
    const requested = params.get("date") || ""
    const day = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : isoDay(new Date())
    const branchIds = await briefingBranchIds(user.user_id)
    const [today, yesterday] = await Promise.all([buildDailyProfit(day, branchIds), buildDailyProfit(previousDay(day), branchIds)])
    return NextResponse.json({ ...today, previous: yesterday }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Daily profit error:", error)
    return NextResponse.json({ error: "تعذر حساب ربح اليوم" }, { status: 500 })
  }
}
