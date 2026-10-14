import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/tenant-auth"
import { discountCardProblem, findDiscountCard, localDate } from "@/lib/pos-discount-cards"

// بحث بطاقة الخصم من الكاشير: برقم البطاقة (مسح/كتابة) أو بالعميل المختار. يُرجع أول بطاقة صالحة اليوم لهذا
// الفرع (شرط مبلغ الفاتورة يُفحص في الكاشير وعند الحفظ لأن المبلغ يتغيّر مع السلة).
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
  try {
    const params = request.nextUrl.searchParams
    const cardNumber = String(params.get("card_number") || "").trim()
    const customerId = Number(params.get("customer_id") || 0)
    const branchId = Number(params.get("branch_id") || 0) || null
    const today = localDate()
    if (cardNumber) {
      const [card] = await findDiscountCard({ cardNumber })
      if (!card) return NextResponse.json({ error: `بطاقة الخصم ${cardNumber} غير موجودة` }, { status: 404 })
      const problem = discountCardProblem(card, { branchId, date: today })
      if (problem) return NextResponse.json({ error: problem }, { status: 422 })
      return NextResponse.json({ card })
    }
    if (customerId > 0) {
      const cards = await findDiscountCard({ accountId: customerId })
      const card = cards.find((candidate) => !discountCardProblem(candidate, { accountId: customerId, branchId, date: today }))
      return NextResponse.json({ card: card ?? null })
    }
    return NextResponse.json({ card: null })
  } catch (error) {
    console.error("[pos/discount-cards/lookup] failed", error)
    return NextResponse.json({ error: "تعذر البحث عن بطاقة الخصم" }, { status: 500 })
  }
}
