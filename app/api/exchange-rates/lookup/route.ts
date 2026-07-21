import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"

// سعر الصرف المستخدم في السندات: عملة الأساس (أصغر معرّف في جدول currency) سعرها دائماً 1،
// وإلا آخر سعر بتاريخ <= تاريخ السند من exchange_rates، وإن لم يوجد سعر مسجل يُرجع 1.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const currencyId = Number(searchParams.get("currency_id") || 0)
    const date = searchParams.get("date")
    if (!currencyId) return NextResponse.json({ error: "currency_id required" }, { status: 400 })

    const baseRows = await sql`SELECT MIN(id) AS id FROM currency`
    const baseCurrencyId = baseRows[0]?.id != null ? Number(baseRows[0].id) : null
    if (baseCurrencyId !== null && currencyId === baseCurrencyId) {
      return NextResponse.json({ rate: 1, is_base: true })
    }

    const effectiveDate = date || new Date().toISOString().slice(0, 10)
    const rows = await sql`
      SELECT exchange_rate FROM exchange_rates
      WHERE currency_id = ${currencyId} AND rate_date <= ${effectiveDate} AND is_active = true
      ORDER BY rate_date DESC, created_at DESC
      LIMIT 1
    `
    const rate = rows[0]?.exchange_rate != null ? Number(rows[0].exchange_rate) : 1
    return NextResponse.json({ rate, is_base: false })
  } catch (error) {
    console.error("Error looking up exchange rate:", error)
    return NextResponse.json({ error: "Failed to look up exchange rate" }, { status: 500 })
  }
}
