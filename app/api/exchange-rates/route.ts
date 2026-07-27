import { type NextRequest, NextResponse } from "next/server"
import { getCurrenciesWithLatestRate, getOrCreateRatesForDate, updateExchangeRate } from "@/lib/database"
import sql from "@/lib/database"
// ❌ removed export default sql
// ✅ leave sql as an internal helper variable

// ==============================
// GET - Fetch currencies + rates
// ==============================
// بلا ?date=: آخر سعر معروف لكل عملة (أياً كان تاريخه) — سلوك الشاشة الكاملة (components/data/
// exchange-rates.tsx) كما كان دوماً. مع ?date=YYYY-MM-DD: أسعار "كما كانت" بذلك التاريخ تحديداً،
// مع نسخ آخر سعر سابق تلقائياً وحفظه كسعر ذلك التاريخ إن لم يوجد سعر مسجَّل له أصلاً — تستخدمها
// نافذة أسعار الصرف اليومية الجديدة.
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date")
    const result = date ? await getOrCreateRatesForDate(date) : await getCurrenciesWithLatestRate()

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ rates: result.data })
  } catch (error) {
    console.error("Error fetching exchange rates:", error)
    return NextResponse.json({ error: "Failed to fetch exchange rates" }, { status: 500 })
  }
}

// ==============================
// POST - Add currency + rate
// ==============================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { currency_name, currency_code, buy_rate, sell_rate, exchange_rate, is_active } = body

    if (!currency_name || !currency_code) {
      return NextResponse.json({ error: "Currency name and code are required" }, { status: 400 })
    }

    // Check if currency exists
    let currency = await sql`
      SELECT * FROM currency WHERE currency_code = ${currency_code}
    `

    if (currency.length === 0) {
      const lastIdRow = await sql`SELECT MAX(id) AS max_id FROM currency`
      const lastId = lastIdRow[0]?.max_id ?? 0
      const newId = lastId + 1

      if (newId === 1 && (buy_rate !== 1 || sell_rate !== 1 || exchange_rate !== 1)) {
        return NextResponse.json(
          { error: "عملة الأساس يجب أن يكون سعر الصرف والبيع والشراء يساوي 1" },
          { status: 400 }
        )
      }

      const inserted = await sql`
        INSERT INTO currency (id, currency_code, currency_name, is_active)
        VALUES (${newId}, ${currency_code}, ${currency_name}, true)
        RETURNING *
      `
      currency = inserted
    }

    const currencyId = currency[0].id

    // Insert new exchange rate
    const result = await sql`
      INSERT INTO exchange_rates (
        currency_id,
        buy_rate,
        sell_rate,
        exchange_rate,
        is_active
      ) VALUES (
        ${currencyId},
        ${buy_rate || 0},
        ${sell_rate || 0},
        ${exchange_rate || 0},
        ${is_active !== false}
      ) RETURNING *
    `

    return NextResponse.json({ rate: result[0] }, { status: 201 })
  } catch (error) {
    console.error("Error creating exchange rate:", error)
    return NextResponse.json({ error: "Failed to create exchange rate" }, { status: 500 })
  }
}

// ==============================
// PUT - Update existing rate
// ==============================
export async function PUT(request: NextRequest) {
  try {
    const { id, ...rates } = await request.json()
    const result = await updateExchangeRate(id, rates)

    if (!result.success || !result.data || result.data.length === 0) {
      return NextResponse.json({ error: result.error ?? "No data returned" }, { status: 500 })
    }

    return NextResponse.json({ rate: result.data[0] })
  } catch (error) {
    console.error("Error updating exchange rate:", error)
    return NextResponse.json({ error: "Failed to update exchange rate" }, { status: 500 })
  }
}

// ==============================
// Utility - Manual insert helper
// ==============================
export async function createExchangeRate(data: {
  currency_id: number
  buy_rate: number
  sell_rate: number
  exchange_rate: number
  is_active?: boolean
}) {
  return sql`
    INSERT INTO exchange_rates (
      currency_id,
      buy_rate,
      sell_rate,
      exchange_rate,
      is_active,
      rate_date
    ) VALUES (
      ${data.currency_id},
      ${data.buy_rate},
      ${data.sell_rate},
      ${data.exchange_rate},
      ${data.is_active ?? true},
      CURRENT_DATE
    ) RETURNING *
  `
}
