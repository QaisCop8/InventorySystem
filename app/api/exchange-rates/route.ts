import { type NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"
import { getCurrenciesWithLatestRate, getOrCreateRatesForDate, getTenantPool, updateExchangeRate } from "@/lib/database"

const MIN_EXCHANGE_RATE = 0.0001
const MAX_EXCHANGE_RATE = 10000

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
  let client: PoolClient | null = null
  try {
    const body = await request.json()
    const { currency_name, currency_code, buy_rate, sell_rate, exchange_rate, is_active } = body
    const currencyName = String(currency_name || "").trim()
    const currencyCode = String(currency_code || "").trim().toUpperCase()
    const buyRate = Number(buy_rate)
    const sellRate = Number(sell_rate)
    const exchangeRate = Number(exchange_rate)

    if (!currencyName || !currencyCode) {
      return NextResponse.json({ error: "Currency name and code are required" }, { status: 400 })
    }
    if (
      ![buyRate, sellRate, exchangeRate].every(
        (rate) => Number.isFinite(rate) && rate >= MIN_EXCHANGE_RATE && rate <= MAX_EXCHANGE_RATE,
      )
    ) {
      return NextResponse.json(
        { error: "سعر الشراء وسعر البيع وسعر الصرف يجب أن تكون بين 0.0001 و 10000" },
        { status: 400 },
      )
    }

    const pool = await getTenantPool()
    client = await pool.connect()
    await client.query("BEGIN")
    // IDs are assigned manually in this schema. Locking prevents two concurrent
    // currency requests from choosing the same MAX(id) + 1 value.
    await client.query("LOCK TABLE currency IN EXCLUSIVE MODE")

    const duplicateCode = await client.query(
      "SELECT id FROM currency WHERE UPPER(currency_code) = UPPER($1) LIMIT 1",
      [currencyCode],
    )
    if (duplicateCode.rows.length > 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "رمز العملة مكرر" }, { status: 400 })
    }

    const duplicateName = await client.query(
      "SELECT id FROM currency WHERE currency_name = $1 LIMIT 1",
      [currencyName],
    )
    if (duplicateName.rows.length > 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "اسم العملة مكرر" }, { status: 400 })
    }

    const lastIdResult = await client.query("SELECT COALESCE(MAX(id), 0) AS max_id FROM currency")
    const newId = Number(lastIdResult.rows[0]?.max_id || 0) + 1
    if (newId === 1 && (buyRate !== 1 || sellRate !== 1 || exchangeRate !== 1)) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "عملة الأساس يجب أن يكون سعر الصرف والبيع والشراء يساوي 1" },
        { status: 400 },
      )
    }

    const currencyResult = await client.query(
      `INSERT INTO currency (id, currency_code, currency_name, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [newId, currencyCode, currencyName],
    )
    const rateResult = await client.query(
      `
      INSERT INTO exchange_rates (
        currency_id,
        buy_rate,
        sell_rate,
        exchange_rate,
        is_active,
        rate_date
      ) VALUES (
        $1, $2, $3, $4, $5, CURRENT_DATE
      ) RETURNING *
      `,
      [newId, buyRate, sellRate, exchangeRate, is_active !== false],
    )
    await client.query("COMMIT")

    return NextResponse.json(
      { currency: currencyResult.rows[0], rate: rateResult.rows[0] },
      { status: 201 },
    )
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK")
      } catch {}
    }
    console.error("Error creating exchange rate:", error)
    return NextResponse.json({ error: "Failed to create exchange rate" }, { status: 500 })
  } finally {
    client?.release()
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
