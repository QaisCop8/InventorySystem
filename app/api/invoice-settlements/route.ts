import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { allocateSettlement, autoDistribute, canSettle, ensureSettlementTables, getSettlementView, removeSettlement, settlementBranch } from "@/lib/invoice-settlements"

// GET ?voucher_id= — بيانات شاشة تسديد الفواتير لفاتورة مبيعات أو لسند قبض/إشعار دائن/مرتجع مبيعات.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const voucherId = Number(request.nextUrl.searchParams.get("voucher_id") || 0)
    if (!voucherId) return NextResponse.json({ error: "يجب تحديد السند" }, { status: 400 })
    const view = await getSettlementView(voucherId)
    return NextResponse.json({ ...view, can_settle: await canSettle(user.user_id, view.voucher.branch_id) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر تحميل بيانات التسديد" }, { status: 400 })
  }
}

// POST {action: "allocate", voucher_id, other_id, amount} | {action: "auto", voucher_id, order} | {action: "remove", id, voucher_id}
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureSettlementTables()
    const data = await request.json().catch(() => ({}))
    const voucherId = Number(data.voucher_id || 0)
    if (!voucherId) return NextResponse.json({ error: "يجب تحديد السند" }, { status: 400 })
    if (!(await canSettle(user.user_id, await settlementBranch(voucherId)))) {
      return NextResponse.json({ error: "لا يوجد لديك صلاحية تسديد الفواتير" }, { status: 403 })
    }
    const userId = Number(user.user_id)
    if (data.action === "allocate") await allocateSettlement({ voucherId, otherId: Number(data.other_id), amount: Number(data.amount), userId })
    else if (data.action === "auto") await autoDistribute({ voucherId, order: data.order === "lifo" ? "lifo" : "fifo", userId })
    else if (data.action === "remove") await removeSettlement(Number(data.id))
    else return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 })
    return NextResponse.json(await getSettlementView(voucherId))
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "تعذر تنفيذ التسديد" }, { status: 400 })
  }
}
