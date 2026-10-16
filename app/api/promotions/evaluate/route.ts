import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { activeRules, computePromotions, ensurePromotionTables, type EvaluateLine } from "@/lib/promotions"
import { getBaseCurrencyId } from "@/lib/auto-journals"

// تقييم العروض لأسطر حركة مبيعات (تستدعيه شاشة الفاتورة/الإرسالية عند تغيّر العميل/التاريخ/الأصناف/الكميات).
// body: { account_id, date, branch_id, vch_type, currency_id, lines: [{ key, product_id, unit_id, quantity }] }
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensurePromotionTables()
    const body = await request.json().catch(() => ({}))
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || "").slice(0, 10)) ? String(body.date).slice(0, 10) : new Date().toISOString().slice(0, 10)
    const lines: EvaluateLine[] = (Array.isArray(body?.lines) ? body.lines : [])
      .slice(0, 1000)
      .map((line: any) => ({ key: String(line?.key ?? ""), product_id: Number(line?.product_id), unit_id: Number(line?.unit_id) || null, quantity: Number(line?.quantity) || 0 }))
      .filter((line: EvaluateLine) => line.key && Number.isInteger(line.product_id) && line.product_id > 0)
    if (!lines.length) return NextResponse.json({ lines: [], free_lines: [] })
    const rules = await activeRules({
      accountId: Number(body?.account_id) || null,
      date,
      branchId: Number(body?.branch_id) || Number(request.headers.get("x-branch-id")) || null,
      vchType: Number(body?.vch_type) || 12,
      productIds: [...new Set(lines.map((line) => line.product_id))],
    })
    if (!rules.length) return NextResponse.json({ lines: [], free_lines: [] })
    return NextResponse.json(computePromotions(lines, rules, { voucherCurrencyId: Number(body?.currency_id) || null, baseCurrencyId: await getBaseCurrencyId() }))
  } catch (error) {
    console.error("[promotions] evaluate failed", error)
    return NextResponse.json({ error: "تعذر تقييم العروض" }, { status: 500 })
  }
}
