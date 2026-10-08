import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { loadOverview } from "@/lib/dashboard-overview"
import { resolveCurrentDbName } from "@/lib/database"
import { ensureTables as ensureSalesTables } from "@/app/api/sales-vouchers/_lib"

// لوحة المعلومات أول ما تفتحه شركة جديدة — قبل أي شاشة سندات تُنشئ أعمدة voucher_header_tbl الإضافية
// (branch_id، الخصم...). تُجهَّز الجداول مرة واحدة لكل قاعدة شركة لكل عملية خادم.
const preparedDatabases = new Map<string, Promise<void>>()
async function prepareTables() {
  const dbName = await resolveCurrentDbName()
  let pending = preparedDatabases.get(dbName)
  if (!pending) {
    pending = ensureSalesTables().catch((error) => { preparedDatabases.delete(dbName); throw error })
    preparedDatabases.set(dbName, pending)
  }
  return pending
}

async function allowedBranches(userId: string) {
  const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${userId}`
  if (memberships.length) return memberships.map((row: any) => Number(row.branch_id))
  return (await sql`SELECT id FROM branches`).map((row: any) => Number(row.id))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await prepareTables()

    const allowed = await allowedBranches(user.user_id)
    const current = Number(request.headers.get("x-branch-id"))
    const scopeAll = request.nextUrl.searchParams.get("scope") === "all"
    const branchIds = scopeAll || !allowed.includes(current) ? allowed : [current]
    if (!branchIds.length) return NextResponse.json({ error: "لا توجد فروع متاحة" }, { status: 403 })

    return NextResponse.json(await loadOverview(branchIds, branchIds.length > 1 || scopeAll, allowed.length > 1))
  } catch (error) {
    console.error("[dashboard/overview]", error)
    return NextResponse.json({ error: "تعذر تحميل بيانات لوحة المعلومات" }, { status: 500 })
  }
}
