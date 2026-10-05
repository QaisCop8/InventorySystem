import { type NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import {
  INTERNAL_VOUCHER,
  createAutoJournal,
  dateOnly,
  getBaseCurrencyId,
  getRateByDate,
  linkRelatedVouchers,
  resolveJournalContext,
  round2,
} from "@/lib/auto-journals"
import { authorizeAutoJournal, autoJournalErrorResponse, ensureAutoJournalSchema, positiveIds } from "../_lib"

// قيود تحويل عملة حساب (ShamelAPI: AccountCurrencyConvertJournals) — لكل حساب له رصيد بعملة غير
// عملته (حركات مُرحَّلة بعملة أخرى) يُحوَّل ذلك الرصيد إلى عملة الحساب بقيدين مترابطين:
//   القيد الأول (عملة الحركة): يُقفَل الرصيد الأجنبي على الحساب مقابل حساب تحويل العملة
//   القيد الثاني (عملة الحساب): يُعاد نفس الرصيد على الحساب بعملته مقابل حساب تحويل العملة
// المبلغ المحوَّل له = الرصيد × سعر صرف عملة الحركة ÷ سعر صرف عملة الحساب (بتاريخ القيد).
// الرصيد هنا: مدين موجب، دائن سالب.

type BalanceRow = {
  account_id: number; account_code: string; account_name: string
  account_currency_id: number; account_currency_code: string
  trans_currency_id: number; trans_currency_code: string
  balance: number; base_balance: number
}

async function foreignBalances(date: string, accountIds: number[], accountTypes: number[], pairs?: { accountId: number; currencyId: number }[]) {
  const pairKeys = (pairs || []).map((pair) => `${pair.accountId}:${pair.currencyId}`)
  const rows = await sql`
    SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
      a.currency_id AS account_currency_id, ac.currency_code AS account_currency_code,
      vjd.currency_id AS trans_currency_id, tc.currency_code AS trans_currency_code,
      ROUND(SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.amount ELSE -vjd.amount END)::numeric, 2)::float8 AS balance,
      ROUND(SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.base_curr_amount ELSE -vjd.base_curr_amount END)::numeric, 2)::float8 AS base_balance
    FROM voucher_journal_detail_tbl vjd
    JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
    JOIN account_tbl a ON a.id = vjd.account_id
    LEFT JOIN currency ac ON ac.id = a.currency_id
    LEFT JOIN currency tc ON tc.id = vjd.currency_id
    WHERE vh.status <> 3 AND vh.vch_status = 2 AND vh.vch_date::date <= ${date}::date
      AND a.currency_id IS NOT NULL AND vjd.currency_id IS NOT NULL AND vjd.currency_id <> a.currency_id
      AND COALESCE(a.status, 1) <> 3
      AND NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id = a.id)
      AND (${accountIds.length === 0} OR a.id = ANY(${accountIds}::int[]))
      AND (${accountTypes.length === 0} OR a.type = ANY(${accountTypes}::int[]))
      AND (${pairKeys.length === 0} OR (a.id::text || ':' || vjd.currency_id::text) = ANY(${pairKeys}::text[]))
    GROUP BY a.id, a.code, a.name, a.currency_id, ac.currency_code, vjd.currency_id, tc.currency_code
    HAVING ROUND(SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.amount ELSE -vjd.amount END)::numeric, 2) <> 0
    ORDER BY a.code, vjd.currency_id
  `
  return rows.map((row: any) => ({ ...row, balance: Number(row.balance), base_balance: Number(row.base_balance) })) as BalanceRow[]
}

async function withRates(rows: BalanceRow[], date: string) {
  const baseCurrencyId = await getBaseCurrencyId()
  const cache = new Map<number, number | null>()
  const rateOf = async (currencyId: number) => {
    if (!cache.has(currencyId)) cache.set(currencyId, await getRateByDate(currencyId, date, baseCurrencyId))
    return cache.get(currencyId) ?? null
  }
  const result = []
  for (const row of rows) {
    const transRate = await rateOf(row.trans_currency_id)
    const accountRate = await rateOf(row.account_currency_id)
    result.push({
      ...row,
      trans_rate: transRate,
      account_rate: accountRate,
      converted_amount: transRate && accountRate ? round2((Math.abs(row.balance) * transRate) / accountRate) : null,
    })
  }
  return result
}

export async function GET(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const authorization = await authorizeTransaction(request, "journal", "view")
    if (!authorization.ok) return authorization.response
    const params = new URL(request.url).searchParams
    const date = dateOnly(params.get("date"))
    const balanceType = Number(params.get("balance_type") || 0) // 0 الكل، 1 مدين، 2 دائن
    let rows = await foreignBalances(date, positiveIds(params.get("account_ids")), positiveIds(params.get("account_types")))
    if (balanceType === 1) rows = rows.filter((row) => row.balance > 0)
    if (balanceType === 2) rows = rows.filter((row) => row.balance < 0)
    return NextResponse.json({ rows: await withRates(rows, date) })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر احتساب أرصدة العملات")
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const body = await request.json()
    const date = dateOnly(body.vch_date)
    const convertAccountId = Number(body.convert_account_id) || 0
    if (!convertAccountId) return NextResponse.json({ error: "اختر حساب تحويل العملة" }, { status: 400 })
    const requested: { account_id: number; trans_currency_id: number; trans_rate?: number; account_rate?: number }[] =
      (Array.isArray(body.rows) ? body.rows : []).filter((row: any) => Number(row?.account_id) > 0 && Number(row?.trans_currency_id) > 0)
    if (!requested.length) return NextResponse.json({ error: "اختر حساباً واحداً على الأقل" }, { status: 400 })
    if (requested.some((row) => Number(row.account_id) === convertAccountId)) {
      return NextResponse.json({ error: "حساب تحويل العملة لا يمكن أن يكون أحد الحسابات المحوَّلة" }, { status: 400 })
    }

    const authorization = await authorizeAutoJournal(request, body.branch_id)
    if (!authorization.ok) return authorization.response
    const note = String(body.note || "").trim() || "تحويل عملة حساب"

    return await withTenantTransaction(async () => {
      // الرصيد يُعاد احتسابه هنا (لا يُؤخذ من الواجهة) — قد يكون تغيّر منذ عرضه.
      const balances = await withRates(await foreignBalances(date, [], [], requested.map((row) => ({ accountId: Number(row.account_id), currencyId: Number(row.trans_currency_id) }))), date)
      const byKey = new Map(balances.map((row) => [`${row.account_id}:${row.trans_currency_id}`, row]))
      const work = []
      for (const row of requested) {
        const balance = byKey.get(`${Number(row.account_id)}:${Number(row.trans_currency_id)}`)
        if (!balance) return NextResponse.json({ error: "أحد الحسابات المختارة لم يعد له رصيد بعملة أخرى. حدّث القائمة." }, { status: 409 })
        // سعر الصرف قابل للتعديل من الشاشة (كما في Shamel)؛ بدونه يُستخدم سعر التاريخ.
        const transRate = Number(row.trans_rate) > 0 ? Number(row.trans_rate) : balance.trans_rate
        const accountRate = Number(row.account_rate) > 0 ? Number(row.account_rate) : balance.account_rate
        if (!transRate || !accountRate) {
          return NextResponse.json({ error: `لا يوجد سعر صرف للعملة ${balance.trans_currency_code} أو ${balance.account_currency_code} بتاريخ القيد` }, { status: 400 })
        }
        work.push({ ...balance, transRate, accountRate, converted: round2((Math.abs(balance.balance) * transRate) / accountRate) })
      }

      const context = await resolveJournalContext(authorization.userId)
      const journals: { id: number; code: string }[] = []
      for (const row of work) {
        const amount = Math.abs(row.balance)
        // رصيد مدين (موجب) يُقفَل بجعل الحساب دائناً في القيد الأول، ثم مديناً بعملته في القيد الثاني.
        const closeSide: 1 | 2 = row.balance > 0 ? 2 : 1
        const reopenSide: 1 | 2 = closeSide === 1 ? 2 : 1
        const common = { userId: authorization.userId, branchId: authorization.branchId, date, internalVoucherId: INTERNAL_VOUCHER.ACCOUNT_CURRENCY_CONVERT }
        const text = `${note} - ${row.account_code} ${row.account_name}: ${row.trans_currency_code} ← ${row.account_currency_code}`
        const first = await createAutoJournal({
          ...common, currencyId: row.trans_currency_id, rate: row.transRate, note: text,
          lines: [
            // مبلغ الحساب بعملته = نفس المبلغ المحوَّل له في القيد الثاني بالضبط، فيبقى رصيده بعملته
            // دون تغيير صافٍ حتى لو عُدِّل سعر الصرف من الشاشة.
            { accountId: row.account_id, creditDebit: closeSide, amount, currencyId: row.trans_currency_id, rate: row.transRate, accountAmountOverride: row.converted },
            { accountId: convertAccountId, creditDebit: reopenSide, amount, currencyId: row.trans_currency_id, rate: row.transRate },
          ],
        }, context)
        const second = await createAutoJournal({
          ...common, currencyId: row.account_currency_id, rate: row.accountRate, note: text,
          lines: [
            { accountId: row.account_id, creditDebit: reopenSide, amount: row.converted, currencyId: row.account_currency_id, rate: row.accountRate },
            { accountId: convertAccountId, creditDebit: closeSide, amount: row.converted, currencyId: row.account_currency_id, rate: row.accountRate },
          ],
        }, context)
        await linkRelatedVouchers(first.id, second.id)
        journals.push(first, second)
      }

      return NextResponse.json({
        message: `تم تحويل عملة ${work.length} رصيد بإنشاء ${journals.length} قيد: ${journals.map((journal) => journal.code).join(", ")}`,
        journal_vouchers: journals,
      })
    })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر إنشاء قيود تحويل عملة الحساب")
  }
}
