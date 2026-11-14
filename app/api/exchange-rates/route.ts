import { type NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"
import sql, { getCurrenciesWithLatestRate, getOrCreateRatesForDate, getTenantPool, updateExchangeRate } from "@/lib/database"
import { authorizeExchangeRateChange, ensureExchangeRateAuditColumns, exchangeRatePermissionFor, markExchangeRateEntered, resolveExchangeRateTarget } from "@/lib/exchange-rate-access"
import { EXCHANGE_RATE_PERMISSIONS } from "@/lib/transaction-permission-definitions"
import { runSchemaOnce } from "@/lib/schema-once"

const MIN_EXCHANGE_RATE = 0.001

// الرمز المختصر (₪ $) والعملة الفرعية وعدد خاناتها — للتفقيط في الفواتير وكشوف الحساب (lib/currency-catalog.ts)
// لكل قاعدة شركة (runSchemaOnce) — يُنفَّذ قبل فتح معاملة القفل (LOCK TABLE currency)
function ensureCurrencyExtraColumns() {
  return runSchemaOnce("app/api/exchange-rates/route.ts#ensureCurrencyExtraColumns", async () => {
    await sql`ALTER TABLE currency ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(10), ADD COLUMN IF NOT EXISTS sub_currency_name VARCHAR(50), ADD COLUMN IF NOT EXISTS fraction_digits SMALLINT`
  })
}
function currencyExtras(body: any) {
  const symbol = String(body?.currency_symbol ?? "").trim().slice(0, 10) || null
  const subName = String(body?.sub_currency_name ?? "").trim().slice(0, 50) || null
  const digits = Number(body?.fraction_digits)
  return { symbol, subName, digits: Number.isInteger(digits) && digits >= 0 && digits <= 4 ? digits : null }
}
const MAX_EXCHANGE_RATE = 100000

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
    // entered (أُدخل من مستخدم) يحتاج أعمدة exchange_rates.entered_at — lib/exchange-rate-access.ts
    if (date) await ensureExchangeRateAuditColumns()
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
    // عملة جديدة بسعرها = إضافة سعر صرف
    const auth = await authorizeExchangeRateChange(request, EXCHANGE_RATE_PERMISSIONS.add)
    if (!auth.ok) return auth.response
    await ensureExchangeRateAuditColumns()
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
        { error: "سعر الشراء وسعر البيع وسعر الصرف يجب أن تكون بين 0.001 و 100000" },
        { status: 400 },
      )
    }

    await ensureCurrencyExtraColumns()
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

    const extras = currencyExtras(body)
    const currencyResult = await client.query(
      `INSERT INTO currency (id, currency_code, currency_name, is_active, currency_symbol, sub_currency_name, fraction_digits)
       VALUES ($1, $2, $3, true, $4, $5, $6)
       RETURNING *`,
      [newId, currencyCode, currencyName, extras.symbol, extras.subName, extras.digits],
    )
    const rateResult = await client.query(
      `
      INSERT INTO exchange_rates (
        currency_id,
        buy_rate,
        sell_rate,
        exchange_rate,
        is_active,
        rate_date,
        entered_at,
        entered_by
      ) VALUES (
        $1, $2, $3, $4, $5, CURRENT_DATE, CURRENT_TIMESTAMP, $6
      ) RETURNING *
      `,
      [newId, buyRate, sellRate, exchangeRate, is_active !== false, Number(auth.user.user_id) || null],
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
// PATCH - Update currency name / code
// ==============================
// تعديل بيانات العملة نفسها (الاسم والرمز) بصلاحية «تعديل سعر صرف». السندات تربط العملة بمعرّفها، لكن
// جداول قديمة تحفظ نسخة من الرمز (عمود currency_code) ⇐ تُحدَّث معها في نفس المعاملة (ما عدا عموداً أقصر من الرمز الجديد).
export async function PATCH(request: NextRequest) {
  let client: PoolClient | null = null
  try {
    const auth = await authorizeExchangeRateChange(request, EXCHANGE_RATE_PERMISSIONS.edit)
    if (!auth.ok) return auth.response
    const body = await request.json()
    const currencyId = Number(body?.currency_id)
    const currencyName = String(body?.currency_name || "").trim()
    const currencyCode = String(body?.currency_code || "").trim().toUpperCase()

    if (!Number.isInteger(currencyId) || currencyId <= 0) {
      return NextResponse.json({ error: "العملة غير موجودة" }, { status: 404 })
    }
    if (!currencyName || !currencyCode) {
      return NextResponse.json({ error: "اسم العملة ورمزها مطلوبان" }, { status: 400 })
    }
    if (!/^[A-Z]{1,10}$/.test(currencyCode)) {
      return NextResponse.json({ error: "رمز العملة يجب أن يكون حروفاً إنجليزية (حتى 10)" }, { status: 400 })
    }

    await ensureCurrencyExtraColumns()
    const pool = await getTenantPool()
    client = await pool.connect()
    await client.query("BEGIN")
    await client.query("LOCK TABLE currency IN EXCLUSIVE MODE")

    const current = await client.query("SELECT id, currency_code, currency_name FROM currency WHERE id = $1", [currencyId])
    if (current.rows.length === 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "العملة غير موجودة" }, { status: 404 })
    }
    const duplicateCode = await client.query(
      "SELECT 1 FROM currency WHERE UPPER(currency_code) = $1 AND id <> $2 LIMIT 1",
      [currencyCode, currencyId],
    )
    if (duplicateCode.rows.length > 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "رمز العملة مكرر" }, { status: 400 })
    }
    const duplicateName = await client.query(
      "SELECT 1 FROM currency WHERE BTRIM(currency_name) = $1 AND id <> $2 LIMIT 1",
      [currencyName, currencyId],
    )
    if (duplicateName.rows.length > 0) {
      await client.query("ROLLBACK")
      return NextResponse.json({ error: "اسم العملة مكرر" }, { status: 400 })
    }

    const extras = currencyExtras(body)
    const updated = await client.query(
      // حقول لم تُرسل تبقى كما هي (مستدعون قدامى يرسلون الاسم والرمز فقط)
      `UPDATE currency SET currency_name = $1, currency_code = $2,
         currency_symbol = CASE WHEN $7 THEN $4 ELSE currency_symbol END,
         sub_currency_name = CASE WHEN $8 THEN $5 ELSE sub_currency_name END,
         fraction_digits = CASE WHEN $9 THEN $6::smallint ELSE fraction_digits END
       WHERE id = $3 RETURNING *`,
      [currencyName, currencyCode, currencyId, extras.symbol, extras.subName, extras.digits, "currency_symbol" in body, "sub_currency_name" in body, "fraction_digits" in body],
    )

    const oldCode = String(current.rows[0].currency_code || "").trim()
    if (oldCode && oldCode.toUpperCase() !== currencyCode) {
      const copies = await client.query(
        `SELECT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
         WHERE c.table_schema = current_schema() AND c.column_name = 'currency_code' AND c.table_name <> 'currency'
           AND c.data_type IN ('character varying', 'text', 'character')
           AND (c.character_maximum_length IS NULL OR c.character_maximum_length >= $1)`,
        [currencyCode.length],
      )
      for (const row of copies.rows) {
        const table = String(row.table_name).replace(/"/g, '""')
        await client.query(`UPDATE "${table}" SET currency_code = $1 WHERE currency_code = $2`, [currencyCode, oldCode])
      }
    }
    await client.query("COMMIT")

    return NextResponse.json({ currency: updated.rows[0] })
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK")
      } catch {}
    }
    console.error("Error updating currency:", error)
    return NextResponse.json({ error: "تعذر تعديل العملة" }, { status: 500 })
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
    // إضافة / تعديل / يوم سابق حسب السطر المستهدف (lib/exchange-rate-access.ts)
    const target = await resolveExchangeRateTarget(id, rates)
    if (Number(rates.type) !== 1 && !target) return NextResponse.json({ error: "سعر الصرف غير موجود" }, { status: 404 })
    const auth = await authorizeExchangeRateChange(request, exchangeRatePermissionFor(target))
    if (!auth.ok) return auth.response

    const result = await updateExchangeRate(id, rates)

    if (!result.success || !result.data || result.data.length === 0) {
      return NextResponse.json({ error: result.error ?? "No data returned" }, { status: 500 })
    }
    await markExchangeRateEntered(Number(result.data[0].id), auth.user.user_id)

    return NextResponse.json({ rate: result.data[0] })
  } catch (error) {
    console.error("Error updating exchange rate:", error)
    return NextResponse.json({ error: "Failed to update exchange rate" }, { status: 500 })
  }
}
