import { type NextRequest, NextResponse } from "next/server"
import sql from "@/lib/database"
import { requirePermissionByName } from "@/lib/tenant-auth"
import { reportPermissionNameFor } from "@/lib/report-permission-definitions"
import { ensureExchangeRateAuditColumns, EXCHANGE_RATE_TIME_ZONE } from "@/lib/exchange-rate-access"

// «تقرير اسعار الصرف»: سعر كل عملة بكل يوم في الفترة، مع التغيّر عن اليوم السابق ومن أدخله (أو منسوخ تلقائياً من آخر سعر).
// العملة الرئيسية (أصغر معرّف، ثابتة عند 1) مستثناة.

const validDate = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null)

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermissionByName(request, reportPermissionNameFor("exchange-rates-report") || "تقرير اسعار الصرف")
    if (!auth.ok) return auth.response
    await ensureExchangeRateAuditColumns()

    const params = request.nextUrl.searchParams
    const rawCurrency = Number(params.get("currency_id"))
    const currencyId = Number.isInteger(rawCurrency) && rawCurrency > 0 ? rawCurrency : null
    const [range] = await sql`
      WITH input AS (SELECT COALESCE(${validDate(params.get("to"))}::date, (CURRENT_TIMESTAMP AT TIME ZONE ${EXCHANGE_RATE_TIME_ZONE})::date) AS to_date)
      SELECT to_char(to_date, 'YYYY-MM-DD') AS to_date,
             to_char(GREATEST(COALESCE(${validDate(params.get("from"))}::date, to_date - 30), to_date - 730), 'YYYY-MM-DD') AS from_date
      FROM input
    `

    const rows = await sql`
      WITH base AS (SELECT MIN(id) AS id FROM currency),
      daily AS (
        SELECT DISTINCT ON (er.currency_id, er.rate_date)
               er.id, er.currency_id, er.rate_date, er.buy_rate, er.sell_rate, er.exchange_rate, er.entered_at, er.entered_by
        FROM exchange_rates er
        WHERE er.currency_id <> (SELECT id FROM base)
          AND (${currencyId}::int IS NULL OR er.currency_id = ${currencyId})
          AND er.rate_date <= ${range.to_date}::date
        ORDER BY er.currency_id, er.rate_date, er.id DESC
      ),
      with_change AS (
        SELECT d.*, LAG(d.exchange_rate) OVER (PARTITION BY d.currency_id ORDER BY d.rate_date) AS previous_rate
        FROM daily d
      )
      SELECT w.id, w.currency_id, c.currency_code, c.currency_name,
             to_char(w.rate_date, 'YYYY-MM-DD') AS rate_date,
             w.buy_rate::float8 AS buy_rate, w.sell_rate::float8 AS sell_rate, w.exchange_rate::float8 AS exchange_rate,
             w.previous_rate::float8 AS previous_rate,
             (w.exchange_rate - w.previous_rate)::float8 AS change,
             w.entered_at, u.full_name AS entered_by_name
      FROM with_change w
      JOIN currency c ON c.id = w.currency_id
      LEFT JOIN user_settings u ON u.user_id = w.entered_by
      WHERE w.rate_date >= ${range.from_date}::date
      ORDER BY w.rate_date DESC, c.id
      LIMIT 5000
    `

    const currencies = await sql`
      SELECT id, currency_code, currency_name FROM currency
      WHERE id <> (SELECT MIN(id) FROM currency) AND COALESCE(is_active, true)
      ORDER BY id
    `
    return NextResponse.json({ from: range.from_date, to: range.to_date, rows, currencies })
  } catch (error) {
    console.error("[reports/exchange-rates] error:", error)
    return NextResponse.json({ error: "تعذّر تحميل تقرير أسعار الصرف" }, { status: 500 })
  }
}
