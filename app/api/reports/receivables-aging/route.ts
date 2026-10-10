import { NextResponse, type NextRequest } from "next/server"
import { reportAccessDenied } from "@/lib/report-permissions"
import sql, { resolveCurrentDbName } from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { reportAmountSql } from "@/lib/report-currency"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// تقرير تعمير الذمم بالأرصدة — منقول من ShamelAPI (CustomersCreditHistoryReportM.CalculateAging):
// رصيد كل ذمة حتى التاريخ يُوزَّع على أحدث حركاتها في نفس اتجاه الرصيد أولاً (الرصيد المدين على حركات
// المدين — الفواتير، والدائن على حركات الدائن)، وكل جزء يوضع في فترة حسب عمره بالأيام
// (تاريخ التقرير − تاريخ الحركة + 1). الفترات قابلة للتعديل (aging_periods_tbl) + عمود "فأكثر".
// احتساب الشيكات (اختياري): شيكات واردة لم تُحصَّل بعد تُضاف للرصيد المدين (سند القبض خفّض الذمة عند
// الاستلام قبل التحصيل الفعلي)، والصادرة غير المصروفة تُطرح منه.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const RECEIVABLE_TYPES = [2, 3, 5]
const DEFAULT_PERIODS = [30, 60, 90, 120]

const parseIds = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const validDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100

const periodsReady = new Map<string, Promise<void>>()
async function ensureAgingPeriodsTable() {
  const dbName = await resolveCurrentDbName()
  let pending = periodsReady.get(dbName)
  if (!pending) {
    pending = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS aging_periods_tbl (id SERIAL PRIMARY KEY, days INTEGER NOT NULL, order_no INTEGER NOT NULL DEFAULT 0)`
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM aging_periods_tbl`
      if (!count) {
        for (const [index, days] of DEFAULT_PERIODS.entries()) await sql`INSERT INTO aging_periods_tbl (days, order_no) VALUES (${days}, ${index + 1})`
      }
    })().catch((error) => { periodsReady.delete(dbName); throw error })
    periodsReady.set(dbName, pending)
  }
  return pending
}

async function loadPeriods(): Promise<number[]> {
  await ensureAgingPeriodsTable()
  const rows = await sql`SELECT days FROM aging_periods_tbl ORDER BY order_no, days`
  return (rows as any[]).map((row) => Number(row.days)).filter((days) => days > 0)
}

/** فترات متصاعدة صحيحة (أيام موجبة بلا تكرار). */
function normalizePeriods(values: unknown): number[] | null {
  const list = (Array.isArray(values) ? values : String(values || "").split(",")).map(Number)
  if (!list.length || list.some((days) => !Number.isInteger(days) || days <= 0)) return null
  for (let i = 1; i < list.length; i++) if (list[i] <= list[i - 1]) return null
  return list.slice(0, 12)
}

type Movement = { account_id: number; vch_date: string; credit_debit: number; amount: number }

/** يوزّع الرصيد على أحدث الحركات المطابقة لاتجاهه ويجمعها حسب فترات العمر. */
function ageBalance(balance: number, movements: Movement[], toDate: string, periods: number[]) {
  const buckets = new Array(periods.length + 1).fill(0)
  if (Math.abs(balance) < 0.005) return buckets
  const side = balance > 0 ? 1 : 2
  let remaining = Math.abs(balance)
  const end = Date.parse(toDate)
  const sorted = movements.filter((row) => row.credit_debit === side).sort((a, b) => b.vch_date.localeCompare(a.vch_date))
  for (const row of sorted) {
    if (remaining <= 0.005) break
    const take = Math.min(remaining, row.amount)
    const age = Math.round((end - Date.parse(row.vch_date)) / 86_400_000) + 1
    const index = periods.findIndex((days) => age <= days)
    buckets[index === -1 ? periods.length : index] += take
    remaining -= take
  }
  // ما تبقى (رصيد افتتاحي أقدم من كل الحركات المطابقة) يُعدّ في الفترة الأقدم
  if (remaining > 0.005) buckets[periods.length] += remaining
  const sign = balance > 0 ? 1 : -1
  return buckets.map((value) => round(value * sign))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["receivables-aging-report"])
    if (reportDenied) return reportDenied
    await ensureAccountsTable()
    await ensureVoucherTables()

    const params = request.nextUrl.searchParams
    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permittedBranchIds = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const branchIds = parseIds(params.get("branch_ids"))
    const effectiveBranchIds = branchIds.length ? branchIds.filter((id) => permittedBranchIds.length === 0 || permittedBranchIds.includes(id)) : permittedBranchIds

    const [accounts, currencies, branches, salesmen, savedPeriods] = await Promise.all([
      sql`SELECT a.id, a.code, a.name, a.type, a.currency_id FROM account_tbl a
          WHERE COALESCE(a.status, 1) <> 3 AND a.type = ANY(${RECEIVABLE_TYPES}::int[]) ORDER BY a.code`,
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
      effectiveBranchIds.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE id = ANY(${effectiveBranchIds}::int[]) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
      sql`SELECT id, name FROM salesmen WHERE COALESCE(is_active, true) ORDER BY name`.catch(() => []),
      loadPeriods(),
    ])
    const meta = { accounts, currencies, branches, salesmen, periods: savedPeriods }
    const accountIds = parseIds(params.get("account_ids"))
    if (params.get("meta") === "1" || accountIds.length === 0) return NextResponse.json({ meta })
    if (branchIds.length && !effectiveBranchIds.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const toDate = validDate(params.get("to_date"), new Date().toISOString().slice(0, 10))
    const periods = normalizePeriods(params.get("periods")) || savedPeriods
    const behavior = params.get("behavior") || "all"
    const includeCheques = params.get("include_cheques") === "1"
    const showZero = params.get("show_zero") === "1"
    const salesmanIds = parseIds(params.get("salesman_ids"))
    const selectedCurrency = Number(params.get("report_currency_id") || currencies[0]?.id || 0)
    const baseCurrency = Number(currencies[0]?.id || selectedCurrency)
    const targetCurrency = currencies.find((currency: any) => Number(currency.id) === selectedCurrency)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })
    const amountSql = reportAmountSql(selectedCurrency, baseCurrency)

    // الذمم المختارة: المندوب مخزّن باسمه في customers.salesman، وسقف الرصيد في account_tbl.max_balance_amount
    const salesmanNames = salesmanIds.length
      ? ((salesmen as any[]).filter((row) => salesmanIds.includes(Number(row.id))).map((row) => String(row.name || "").trim()))
      : []
    const scopedAccounts = await sql`
      SELECT a.id, a.code, a.name, a.type, NULLIF(BTRIM(c.salesman), '') AS salesman_name,
        COALESCE(c.mobile1, '') AS phone, NULLIF(a.max_balance_amount, 0) AS credit_limit
      FROM account_tbl a
      LEFT JOIN LATERAL (SELECT salesman, mobile1 FROM customers WHERE account_id = a.id ORDER BY id LIMIT 1) c ON TRUE
      WHERE a.id = ANY(${accountIds}::int[]) AND COALESCE(a.status, 1) <> 3 AND a.type = ANY(${RECEIVABLE_TYPES}::int[])
        AND (${salesmanNames.length === 0} OR BTRIM(c.salesman) = ANY(${salesmanNames}::text[]))
    `.catch(async () => sql`
      SELECT a.id, a.code, a.name, a.type, NULL::text AS salesman_name, '' AS phone, NULL::numeric AS credit_limit
      FROM account_tbl a WHERE a.id = ANY(${accountIds}::int[]) AND COALESCE(a.status, 1) <> 3 AND a.type = ANY(${RECEIVABLE_TYPES}::int[])
    `)
    const ids = (scopedAccounts as any[]).map((row) => Number(row.id))
    if (!ids.length) return NextResponse.json({ meta, rows: [], periods, summary: { buckets: new Array(periods.length + 1).fill(0), balance: 0 } })

    const movements = (await sql`
      SELECT vjd.account_id, vh.vch_date::date::text AS vch_date, vjd.credit_debit, (${sql.unsafe(amountSql)})::float AS amount,
        vh.vch_code, vh.vch_type
      FROM voucher_journal_detail_tbl vjd
      JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
      WHERE vjd.account_id = ANY(${ids}::int[]) AND vh.status <> 3 AND vh.vch_date::date <= ${toDate}::date
        AND (${effectiveBranchIds.length === 0} OR vh.branch_id = ANY(${effectiveBranchIds}::int[]))
      ORDER BY vh.vch_date DESC, vh.id DESC
    `) as any[]

    const cheques = includeCheques ? ((await sql`
      SELECT c.customer_id AS account_id,
        SUM(CASE WHEN c.cheq_type = 1 THEN 1 ELSE -1 END *
          CASE WHEN c.currency_id = ${selectedCurrency} THEN ABS(c.amount)
               ELSE ABS(c.amount * COALESCE(NULLIF(c.rate, 0), 1)) / COALESCE((SELECT er.exchange_rate FROM exchange_rates er
                 WHERE er.currency_id = ${selectedCurrency} AND er.rate_date::date <= ${toDate}::date AND er.exchange_rate > 0
                 ORDER BY er.rate_date DESC, er.id DESC LIMIT 1), 1) END)::float AS amount
      FROM cheques_tbl c
      JOIN voucher_header_tbl vh ON vh.id = c.voucher_id AND vh.status <> 3
      WHERE c.customer_id = ANY(${ids}::int[]) AND COALESCE(c.received_date, vh.vch_date)::date <= ${toDate}::date
        AND (c.status_id IN (1, 2, 3, 8) OR (c.status_id = 7 AND c.due_date::date > ${toDate}::date))
      GROUP BY c.customer_id
    `.catch(() => [])) as any[]) : []
    const chequesByAccount = new Map(cheques.map((row) => [Number(row.account_id), Number(row.amount) || 0]))

    const movementsByAccount = new Map<number, Movement[]>()
    const lastByAccount = new Map<number, { vch_code: string; vch_date: string }>()
    for (const row of movements) {
      const accountId = Number(row.account_id)
      const list = movementsByAccount.get(accountId) || []
      list.push({ account_id: accountId, vch_date: String(row.vch_date), credit_debit: Number(row.credit_debit), amount: Number(row.amount) || 0 })
      movementsByAccount.set(accountId, list)
      if (!lastByAccount.has(accountId)) lastByAccount.set(accountId, { vch_code: row.vch_code, vch_date: String(row.vch_date) })
    }

    const rows = (scopedAccounts as any[])
      .map((account) => {
        const list = movementsByAccount.get(Number(account.id)) || []
        const debit = list.filter((row) => row.credit_debit === 1).reduce((sum, row) => sum + row.amount, 0)
        const credit = list.filter((row) => row.credit_debit === 2).reduce((sum, row) => sum + row.amount, 0)
        const ledgerBalance = round(debit - credit)
        const chequesAmount = round(chequesByAccount.get(Number(account.id)) || 0)
        const agingBalance = round(ledgerBalance + chequesAmount)
        const last = lastByAccount.get(Number(account.id))
        return {
          id: Number(account.id),
          account_code: account.code,
          account_name: account.name,
          salesman_name: account.salesman_name || "",
          phone: account.phone || "",
          credit_limit: account.credit_limit == null ? null : Number(account.credit_limit),
          balance: ledgerBalance,
          cheques: chequesAmount,
          aging_balance: agingBalance,
          buckets: ageBalance(agingBalance, list, toDate, periods),
          last_vch_code: last?.vch_code || "",
          last_vch_date: last?.vch_date || "",
        }
      })
      .filter((row) => showZero || Math.abs(row.aging_balance) >= 0.005)
      .filter((row) => behavior === "all" || (behavior === "debit" ? row.aging_balance > 0 : row.aging_balance < 0))
      .sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)))

    const summary = {
      balance: round(rows.reduce((sum, row) => sum + row.aging_balance, 0)),
      buckets: new Array(periods.length + 1).fill(0).map((_, index) => round(rows.reduce((sum, row) => sum + row.buckets[index], 0))),
    }
    return NextResponse.json({ meta, rows, periods, summary, currency: targetCurrency, filters: { to_date: toDate } })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ إحدى الحركات. يرجى تعريف سعر الصرف وإعادة عرض التقرير." }, { status: 400 })
    }
    console.error("Receivables aging report error:", error)
    return NextResponse.json({ error: "تعذر تحميل تقرير تعمير الذمم" }, { status: 500 })
  }
}

// حفظ فترات التعمير الافتراضية (تعديل الفترات من شاشة التقرير)
export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, ["receivables-aging-report"])
    if (reportDenied) return reportDenied
    const body = await request.json().catch(() => ({}))
    const periods = normalizePeriods(body?.periods)
    if (!periods) return NextResponse.json({ error: "خطأ في الفترات المدخلة، الرجاء إدخال فترات متصاعدة بأيام موجبة" }, { status: 400 })
    await ensureAgingPeriodsTable()
    await sql`DELETE FROM aging_periods_tbl`
    for (const [index, days] of periods.entries()) await sql`INSERT INTO aging_periods_tbl (days, order_no) VALUES (${days}, ${index + 1})`
    return NextResponse.json({ periods })
  } catch (error) {
    console.error("Save aging periods error:", error)
    return NextResponse.json({ error: "تعذر حفظ الفترات" }, { status: 500 })
  }
}
