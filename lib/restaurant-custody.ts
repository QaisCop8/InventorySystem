import sql from "@/lib/database"
import { runSchemaOnce } from "@/lib/schema-once"
import { getPosCurrencies, type PosCurrency } from "@/lib/pos-currencies"

// عهدة المطعم (استلام/تسليم/إيداع/سحب/إغلاق) — نفس سير عهدة الكاشير (app/api/pos/sessions) لكن لكل موقع مطعم
// بدل نقطة بيع: وردية مفتوحة واحدة لكل موقع، والدفع على طاولات الموقع يتطلب عهدة مفتوحة للمستخدم عليه.

export async function ensureRestaurantCustodyTables() {
  return runSchemaOnce("lib/restaurant-custody.ts#ensureRestaurantCustodyTables", async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_sessions_tbl (
        id BIGSERIAL PRIMARY KEY,
        shift_guid UUID NOT NULL DEFAULT gen_random_uuid(),
        location_id INTEGER NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'open',
        opening_cash NUMERIC(18,4) NOT NULL DEFAULT 0,
        expected_cash NUMERIC(18,4) NOT NULL DEFAULT 0,
        counted_cash NUMERIC(18,4),
        handover_amount NUMERIC(18,4),
        handover_to_user_id VARCHAR(50),
        received_from_session_id BIGINT,
        notes TEXT,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_sessions_shift_uq ON restaurant_sessions_tbl (shift_guid)`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_sessions_open_uq ON restaurant_sessions_tbl (location_id) WHERE status = 'open'`
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_session_currencies_tbl (
        session_id BIGINT NOT NULL REFERENCES restaurant_sessions_tbl(id) ON DELETE CASCADE,
        currency_id INTEGER NOT NULL,
        opening_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
        expected_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
        handover_amount NUMERIC(18,4),
        rate_to_point NUMERIC(18,8) NOT NULL,
        PRIMARY KEY (session_id, currency_id)
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_cash_movements_tbl (
        id BIGSERIAL PRIMARY KEY,
        session_id BIGINT NOT NULL REFERENCES restaurant_sessions_tbl(id) ON DELETE CASCADE,
        movement_type VARCHAR(24) NOT NULL,
        amount NUMERIC(18,4) NOT NULL,
        currency_id INTEGER,
        currency_amount NUMERIC(18,4),
        reference VARCHAR(120),
        note TEXT,
        user_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`ALTER TABLE restaurant_order_payments_tbl ADD COLUMN IF NOT EXISTS session_id BIGINT`
  })
}

export const money2 = (value: unknown) => Math.round(Number(value || 0) * 100) / 100

export async function getOpenRestaurantSession(locationId: number, userId: string) {
  return (await sql`
    SELECT * FROM restaurant_sessions_tbl WHERE location_id = ${locationId} AND user_id = ${String(userId)} AND status = 'open'
    ORDER BY id DESC LIMIT 1
  `)[0] || null
}

/** نفس شكل sessionDetails في عهدة الكاشير (يعرضه PosHandoverDialog كما هو) */
export async function restaurantSessionDetails(locationId: number, userId: string) {
  const session = await getOpenRestaurantSession(locationId, userId)
  if (!session) return null
  const id = Number(session.id)
  const [movements, payments, totals, currencies] = await Promise.all([
    sql`SELECT m.*, c.currency_code FROM restaurant_cash_movements_tbl m LEFT JOIN currency c ON c.id = m.currency_id WHERE m.session_id = ${id} ORDER BY m.id DESC LIMIT 100`,
    sql`
      SELECT p.payment_method, COALESCE(SUM(p.amount), 0) AS sale_amount, 0 AS refund_amount, COALESCE(SUM(p.amount), 0) AS amount, COUNT(*) AS count
      FROM restaurant_order_payments_tbl rp
      JOIN voucher_header_tbl v ON v.id = rp.voucher_id AND v.status <> 3
      JOIN pos_sale_payments_tbl p ON p.voucher_id = rp.voucher_id
      WHERE rp.session_id = ${id}
      GROUP BY p.payment_method ORDER BY p.payment_method
    `,
    sql`SELECT movement_type, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count FROM restaurant_cash_movements_tbl WHERE session_id = ${id} GROUP BY movement_type`,
    sql`SELECT sc.*, c.currency_code, c.currency_name FROM restaurant_session_currencies_tbl sc JOIN currency c ON c.id = sc.currency_id WHERE sc.session_id = ${id} ORDER BY sc.currency_id`,
  ])
  return { ...session, movements, payments, movement_totals: totals, currencies }
}

export function currencyAmounts(input: unknown, currencies: PosCurrency[], pointCurrencyId: number, fallback: number) {
  const entries = Array.isArray(input) ? input : [{ currency_id: pointCurrencyId, amount: fallback }]
  if (!entries.length) throw Object.assign(new Error("لا توجد عملات متاحة للعهدة"), { status: 400 })
  const seen = new Set<number>()
  return entries.map((entry: any) => {
    const currencyId = Number(entry.currency_id), currency = currencies.find((row) => row.currency_id === currencyId)
    const value = Number(entry.amount)
    if (!currency || seen.has(currencyId) || !Number.isFinite(value) || value < 0 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) {
      throw Object.assign(new Error("تفاصيل مبالغ العهدة حسب العملة غير صالحة"), { status: 400 })
    }
    seen.add(currencyId)
    return { ...currency, amount: money2(value) }
  })
}

export const evaluated = (rows: Array<{ amount: number; rate_to_point: number }>) => money2(rows.reduce((sum, row) => sum + row.amount * row.rate_to_point, 0))

/**
 * يسجّل نقد فاتورة طاولة في العهدة: المستلم بكل عملة، والباقي للعميل يُخصم من عملة الموقع — مطابق لمعالجة الكاشير
 * (drawerCash في api/pos/_sale-core.ts).
 */
export async function recordRestaurantSaleCash(session: any, point: any, data: any, vchCode: string, userId: string) {
  const currencies = await getPosCurrencies(Number(point.currency_id))
  const pointCurrencyId = Number(point.currency_id)
  const received = new Map<number, number>()
  if (Array.isArray(data.cash_currency_amounts)) {
    for (const entry of data.cash_currency_amounts) received.set(Number(entry.currency_id), (received.get(Number(entry.currency_id)) || 0) + money2(entry.amount))
  } else {
    for (const payment of data.pos_payments || []) {
      if (String(payment.payment_method || payment.method) !== "cash") continue
      const currencyId = Number(payment.currency_id || pointCurrencyId)
      received.set(currencyId, (received.get(currencyId) || 0) + money2(payment.currency_amount ?? payment.amount))
    }
  }
  const change = money2(data.cash_change_amount)
  if (change > 0) received.set(pointCurrencyId, money2((received.get(pointCurrencyId) || 0) - change))
  let total = 0
  for (const [currencyId, currencyAmount] of received) {
    if (Math.abs(currencyAmount) < 0.0001) continue
    const rate = currencies.find((row) => row.currency_id === currencyId)?.rate_to_point || 1
    total += currencyAmount * rate
    await sql`
      INSERT INTO restaurant_session_currencies_tbl (session_id, currency_id, opening_amount, expected_amount, rate_to_point)
      VALUES (${Number(session.id)}, ${currencyId}, 0, ${currencyAmount}, ${rate})
      ON CONFLICT (session_id, currency_id) DO UPDATE SET expected_amount = restaurant_session_currencies_tbl.expected_amount + ${currencyAmount}
    `
  }
  total = money2(total)
  if (Math.abs(total) < 0.005) return
  await sql`UPDATE restaurant_sessions_tbl SET expected_cash = expected_cash + ${total}, updated_at = NOW() WHERE id = ${Number(session.id)}`
  await sql`
    INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, reference, note, user_id)
    VALUES (${Number(session.id)}, 'sale', ${total}, ${vchCode}, 'بيع نقدي - مطعم', ${String(userId)})
  `
}
