import { NextResponse, type NextRequest } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { getPosCurrencies } from "@/lib/pos-currencies"
import { authorizeRestaurant, ensureRestaurantTables, errorStatus } from "@/lib/restaurant"
import {
  currencyAmounts, ensureRestaurantCustodyTables, evaluated, getOpenRestaurantSession, money2, restaurantSessionDetails,
} from "@/lib/restaurant-custody"

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status })
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function activeLocation(locationId: number) {
  const location = locationId ? (await sql`SELECT * FROM restaurant_locations_tbl WHERE id = ${locationId} AND status = 1`)[0] : null
  if (!location) throw fail("الموقع غير موجود أو موقوف", 404)
  if (!(Number(location.currency_id) > 0)) throw fail(`حدد عملة الموقع "${location.name}" من شاشة المواقع أولاً`)
  return location
}

// حالة العهدة للمستخدم على موقع: الوردية المفتوحة، العهد المسلَّمة بانتظار الاستلام، والوردية المفتوحة لمستخدم آخر
export async function GET(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureRestaurantTables(); await ensureRestaurantCustodyTables()
    const location = await activeLocation(Number(request.nextUrl.searchParams.get("location_id")) || 0)
    const auth = await authorizeRestaurant(request, [], location.branch_id)
    if (!auth.ok) return auth.response
    const [session, activeShift, pending, currencies] = await Promise.all([
      restaurantSessionDetails(Number(location.id), auth.userId),
      sql`
        SELECT s.id, s.user_id, s.shift_guid, COALESCE(NULLIF(us.full_name, ''), NULLIF(us.username, ''), s.user_id) AS user_name
        FROM restaurant_sessions_tbl s LEFT JOIN user_settings us ON us.user_id::text = s.user_id
        WHERE s.location_id = ${Number(location.id)} AND s.status = 'open' ORDER BY s.id DESC LIMIT 1
      `,
      sql`
        SELECT s.*, c.currency_name, c.currency_code, COALESCE(NULLIF(us.full_name, ''), us.username, s.user_id) AS from_user_name,
          COALESCE((SELECT json_agg(json_build_object('currency_id', sc.currency_id, 'currency_code', cc.currency_code, 'currency_name', cc.currency_name,
                      'amount', sc.handover_amount, 'rate_to_point', sc.rate_to_point) ORDER BY sc.currency_id)
                    FROM restaurant_session_currencies_tbl sc JOIN currency cc ON cc.id = sc.currency_id WHERE sc.session_id = s.id), '[]'::json) AS currency_amounts
        FROM restaurant_sessions_tbl s
        LEFT JOIN currency c ON c.id = ${Number(location.currency_id)}
        LEFT JOIN user_settings us ON us.user_id::text = s.user_id
        WHERE s.location_id = ${Number(location.id)} AND s.status = 'handover_pending'
          AND (s.handover_to_user_id IS NULL OR s.handover_to_user_id = ${auth.userId})
        ORDER BY s.id DESC
      `,
      getPosCurrencies(Number(location.currency_id)),
    ])
    return NextResponse.json({ session, pending, active_shift: activeShift[0] || null, currencies })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant custody GET", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل العهدة" }, { status: errorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await getSessionUser(request))) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    await ensureRestaurantTables(); await ensureRestaurantCustodyTables()
    const data = await request.json()
    const action = String(data.action || "")
    if (!["open", "receive", "handover", "cash_in", "cash_out", "close"].includes(action)) return NextResponse.json({ error: "عملية العهدة غير معروفة" }, { status: 400 })
    const location = await activeLocation(Number(data.location_id) || 0)
    const auth = await authorizeRestaurant(request, [["open", "receive"].includes(action) ? "receiveCustody" : "handoverCustody"], location.branch_id)
    if (!auth.ok) return auth.response
    const userId = auth.userId
    const locationId = Number(location.id), pointCurrencyId = Number(location.currency_id)
    const shiftGuid = String(data.shift_guid || "").trim()
    if (shiftGuid && !GUID.test(shiftGuid)) return NextResponse.json({ error: "رقم الوردية GUID غير صالح" }, { status: 400 })
    const note = String(data.note || "").slice(0, 500)

    const session = await withTenantTransaction(async () => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`restaurant-session:${locationId}`}))`
      let current = await getOpenRestaurantSession(locationId, userId)
      const otherOpen = async () => (await sql`SELECT 1 FROM restaurant_sessions_tbl WHERE location_id = ${locationId} AND status = 'open' LIMIT 1`)[0]
      if (action === "open") {
        if (current) throw fail("لديك عهدة مفتوحة على هذا الموقع")
        if (await otherOpen()) throw fail("توجد وردية مفتوحة على هذا الموقع؛ يجب تسليمها أو إغلاقها قبل فتح وردية جديدة", 409)
        const entered = currencyAmounts(data.currency_amounts, await getPosCurrencies(pointCurrencyId), pointCurrencyId, money2(data.amount))
        const opening = evaluated(entered)
        current = (await sql`
          INSERT INTO restaurant_sessions_tbl (location_id, user_id, shift_guid, opening_cash, expected_cash, notes)
          VALUES (${locationId}, ${userId}, COALESCE(${shiftGuid || null}::uuid, gen_random_uuid()), ${opening}, ${opening}, ${note}) RETURNING *
        `)[0]
        for (const item of entered) {
          await sql`INSERT INTO restaurant_session_currencies_tbl (session_id, currency_id, opening_amount, expected_amount, rate_to_point) VALUES (${Number(current.id)}, ${item.currency_id}, ${item.amount}, ${item.amount}, ${item.rate_to_point})`
        }
        await sql`INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, note, user_id) VALUES (${Number(current.id)}, 'opening', ${opening}, ${note}, ${userId})`
        return current
      }
      if (action === "receive") {
        if (current) throw fail("أغلق العهدة الحالية قبل استلام عهدة أخرى")
        if (await otherOpen()) throw fail("توجد وردية مفتوحة على هذا الموقع؛ يجب تسليمها أو إغلاقها أولاً", 409)
        const sourceId = Number(data.source_session_id) || 0
        const source = (await sql`
          SELECT * FROM restaurant_sessions_tbl
          WHERE id = ${sourceId} AND location_id = ${locationId} AND status = 'handover_pending' AND (handover_to_user_id IS NULL OR handover_to_user_id = ${userId})
          FOR UPDATE
        `)[0]
        if (!source) throw fail("العهدة المطلوب استلامها غير متاحة")
        const received = money2(source.handover_amount)
        current = (await sql`
          INSERT INTO restaurant_sessions_tbl (location_id, user_id, shift_guid, opening_cash, expected_cash, received_from_session_id, notes)
          VALUES (${locationId}, ${userId}, COALESCE(${shiftGuid || null}::uuid, gen_random_uuid()), ${received}, ${received}, ${sourceId}, ${note}) RETURNING *
        `)[0]
        await sql`
          INSERT INTO restaurant_session_currencies_tbl (session_id, currency_id, opening_amount, expected_amount, rate_to_point)
          SELECT ${Number(current.id)}, currency_id, COALESCE(handover_amount, 0), COALESCE(handover_amount, 0), rate_to_point
          FROM restaurant_session_currencies_tbl WHERE session_id = ${sourceId}
        `
        await sql`UPDATE restaurant_sessions_tbl SET status = 'handed_over', closed_at = NOW(), updated_at = NOW() WHERE id = ${sourceId}`
        await sql`INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, reference, note, user_id) VALUES (${Number(current.id)}, 'receive', ${received}, ${String(sourceId)}, ${note}, ${userId})`
        return current
      }

      if (!current) throw fail("يجب فتح أو استلام عهدة أولاً")
      const id = Number(current.id)
      const value = money2(data.amount)
      if (!Number.isFinite(value) || value < 0) throw fail("مبلغ العهدة غير صالح")
      const currencies = await getPosCurrencies(pointCurrencyId)
      const balances = await sql`SELECT currency_id, expected_amount, rate_to_point FROM restaurant_session_currencies_tbl WHERE session_id = ${id}`
      if (action === "cash_in" || action === "cash_out") {
        const entered = currencyAmounts(data.currency_amounts, currencies, pointCurrencyId, value).filter((row) => row.amount > 0)
        if (!entered.length) throw fail("أدخل مبلغاً أكبر من صفر")
        const movements = entered.map((row) => {
          const balance = balances.find((item: any) => Number(item.currency_id) === row.currency_id)
          return { ...row, rate_to_point: Number(balance?.rate_to_point || row.rate_to_point), available: Number(balance?.expected_amount || 0) }
        })
        const total = evaluated(movements)
        if (action === "cash_out" && movements.some((row) => row.amount > row.available + 0.009)) throw fail("مبلغ السحب أكبر من الرصيد المتاح لإحدى العملات")
        if (action === "cash_out" && Number(current.expected_cash) - total < -0.009) throw fail("لا يمكن أن يصبح رصيد العهدة سالباً")
        await sql`UPDATE restaurant_sessions_tbl SET expected_cash = expected_cash + ${action === "cash_in" ? total : -total}, updated_at = NOW() WHERE id = ${id}`
        for (const row of movements) {
          const delta = action === "cash_in" ? row.amount : -row.amount
          await sql`
            INSERT INTO restaurant_session_currencies_tbl (session_id, currency_id, opening_amount, expected_amount, rate_to_point) VALUES (${id}, ${row.currency_id}, 0, ${delta}, ${row.rate_to_point})
            ON CONFLICT (session_id, currency_id) DO UPDATE SET expected_amount = restaurant_session_currencies_tbl.expected_amount + ${delta}
          `
          await sql`
            INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, currency_id, currency_amount, reference, note, user_id)
            VALUES (${id}, ${action}, ${money2(row.amount * row.rate_to_point)}, ${row.currency_id}, ${row.amount}, ${String(data.reference || "")}, ${note}, ${userId})
          `
        }
        return current
      }
      if (action === "handover") {
        const entered = currencyAmounts(data.currency_amounts, currencies, pointCurrencyId, value || money2(current.expected_cash))
        const handover = evaluated(entered)
        if (handover < 0 || (!balances.length && handover > Number(current.expected_cash) + 0.009)) throw fail("مبلغ التسليم أكبر من رصيد العهدة")
        for (const item of entered) {
          const available = balances.find((row: any) => Number(row.currency_id) === item.currency_id)
          if (balances.length && item.amount > Number(available?.expected_amount || 0) + 0.009) throw fail(`مبلغ ${item.currency_code} أكبر من الرصيد المتاح`)
        }
        for (const item of entered) {
          await sql`
            INSERT INTO restaurant_session_currencies_tbl (session_id, currency_id, opening_amount, expected_amount, handover_amount, rate_to_point) VALUES (${id}, ${item.currency_id}, 0, 0, ${item.amount}, ${item.rate_to_point})
            ON CONFLICT (session_id, currency_id) DO UPDATE SET handover_amount = ${item.amount}
          `
        }
        await sql`
          UPDATE restaurant_sessions_tbl SET status = 'handover_pending', handover_amount = ${handover}, counted_cash = ${handover},
            handover_to_user_id = ${String(data.to_user_id || "") || null}, updated_at = NOW()
          WHERE id = ${id}
        `
        await sql`INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, note, user_id) VALUES (${id}, 'handover', ${handover}, ${note}, ${userId})`
        return null
      }
      // close
      const entered = currencyAmounts(data.currency_amounts, currencies, pointCurrencyId, money2(data.amount ?? current.expected_cash))
      const counted = evaluated(entered.map((row) => ({ ...row, rate_to_point: Number(balances.find((balance: any) => Number(balance.currency_id) === row.currency_id)?.rate_to_point || row.rate_to_point) })))
      await sql`UPDATE restaurant_sessions_tbl SET status = 'closed', counted_cash = ${counted}, closed_at = NOW(), updated_at = NOW() WHERE id = ${id}`
      await sql`INSERT INTO restaurant_cash_movements_tbl (session_id, movement_type, amount, note, user_id) VALUES (${id}, 'close', ${counted}, ${note}, ${userId})`
      return null
    })
    return NextResponse.json({ success: true, session: session ? await restaurantSessionDetails(locationId, userId) : null })
  } catch (error) {
    if (errorStatus(error) >= 500) console.error("restaurant custody POST", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ عملية العهدة" }, { status: errorStatus(error) })
  }
}
