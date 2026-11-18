import { NextResponse, type NextRequest } from "next/server"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { carProfitReport, cashVanSummary, handOverVanCash, recordCarExpense, type CarExpenseKind } from "@/lib/cash-van"

export const dynamic = "force-dynamic"

// البيع المتجول: GET ?from&to ملخص السيارات · POST { action: "expense" | "handover", ... } قيد مصروف/تسليم نقدية
const isoDate = (value: unknown, fallback: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : fallback

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "cash_van", "view")
    if (!auth.ok) return auth.response
    const today = new Date().toISOString().slice(0, 10)
    const params = request.nextUrl.searchParams
    const from = isoDate(params.get("from"), today)
    const to = isoDate(params.get("to"), today)
    if (params.get("view") === "profit") {
      // ربح/خسارة كل سيارة: ربح الأصناف − المصاريف − راتب المندوب
      const way = params.get("pricing")
      const pricing = way === "last" || way === "fifo" ? way : "average"
      return NextResponse.json({ from, to, pricing, rows: await carProfitReport(from <= to ? from : to, to, pricing) }, { headers: { "Cache-Control": "no-store" } })
    }
    return NextResponse.json({ from, to, rows: await cashVanSummary(from <= to ? from : to, to) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("cash van GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل البيع المتجول" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeTransaction(request, "cash_van", "create")
    if (!auth.ok) return auth.response
    const body = await request.json()
    const userId = String(auth.userId)
    const date = isoDate(body.date, new Date().toISOString().slice(0, 10))
    const amount = Number(body.amount)
    if (body.action === "expense") {
      const kind = String(body.kind) as CarExpenseKind
      if (!["insurance", "fuel", "maintenance"].includes(kind)) return NextResponse.json({ error: "نوع المصروف غير صالح" }, { status: 400 })
      const journal = await recordCarExpense({ carId: Number(body.car_id), kind, amount, date, paidAccountId: Number(body.paid_account_id) || null, note: String(body.note || ""), userId })
      return NextResponse.json({ journal })
    }
    if (body.action === "handover") {
      const journal = await handOverVanCash({ carId: Number(body.car_id), amount, date, toAccountId: Number(body.to_account_id), note: String(body.note || ""), userId })
      return NextResponse.json({ journal })
    }
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 })
  } catch (error) {
    console.error("cash van POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ العملية" }, { status: 400 })
  }
}
