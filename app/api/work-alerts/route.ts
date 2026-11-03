import { NextResponse, type NextRequest } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { briefingBranchIds } from "@/lib/morning-briefing"
import { buildWorkAlerts } from "@/lib/work-alerts"

export const dynamic = "force-dynamic"

// تنبيهات العمل لجرس الرأس — فروع المستخدم (لا عضويات = كل الفروع) والفرع النشط من x-branch-id
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const branchIds = await briefingBranchIds(user.user_id)
    const activeBranchId = Number(request.headers.get("x-branch-id")) || null
    const alerts = await buildWorkAlerts(branchIds, activeBranchId && activeBranchId > 0 ? activeBranchId : null, user.user_id)
    return NextResponse.json({ alerts })
  } catch (error) {
    console.error("[work-alerts] error:", error)
    return NextResponse.json({ error: "تعذّر جلب التنبيهات" }, { status: 500 })
  }
}
