import { type NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import {
  INTERNAL_VOUCHER,
  JOURNAL_TYPE_CURRENCY_CONVERT,
  createAutoJournal,
  dateOnly,
  getBaseCurrencyId,
  getRateByDate,
  resolveJournalContext,
  round2,
} from "@/lib/auto-journals"
import { authorizeAutoJournal, autoJournalErrorResponse, ensureAutoJournalSchema, positiveIds } from "../_lib"

// قيود فرق عملة (ShamelAPI: AccountCurrencyDifferenceJournals) — إعادة تقييم رصيد الحسابات بعملة
// أجنبية بسعر صرف جديد. تشمل حسابات الميزانية (finanical_list_id=1) الخاضعة لفرق العملة
// (iscalc_curr_diff_rates) فقط. لكل حساب (مدين موجب في كل الأرقام):
//   الرصيد بالعملة          = مجموع حركاته المُرحَّلة بهذه العملة
//   الرصيد بعملة الأساس     = مجموع قيمة نفس الحركات بعملة الأساس (بأسعارها التاريخية)
//   فروقات سابقة            = مجموع قيود فرق العملة السابقة لنفس العملة على الحساب
//   الرصيد مقيّم            = الرصيد بالعملة × سعر إعادة التقييم
//   فرق العملة              = الرصيد مقيّم − الرصيد بعملة الأساس − فروقات سابقة
// فرق موجب (ربح): مدين الحساب / دائن حساب فرق العملة؛ سالب (خسارة): العكس. القيد بعملة الأساس،
// ومُعلَّم بـ manual_voucher = رمز العملة (كما في Shamel) لاحتساب "الفروقات السابقة" لاحقاً.

async function differences(date: string, currencyId: number, currencyCode: string, rate: number, accountIds: number[]) {
  const rows = await sql`
    WITH movements AS (
      SELECT vjd.account_id,
        SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.amount ELSE -vjd.amount END) AS balance,
        SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.base_curr_amount ELSE -vjd.base_curr_amount END) AS base_balance
      FROM voucher_journal_detail_tbl vjd
      JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
      WHERE vh.status <> 3 AND vh.vch_status = 2 AND vh.vch_date::date <= ${date}::date
        AND vjd.currency_id = ${currencyId}
      GROUP BY vjd.account_id
    ),
    previous AS (
      SELECT vjd.account_id,
        SUM(CASE WHEN vjd.credit_debit = 1 THEN vjd.base_curr_amount ELSE -vjd.base_curr_amount END) AS previous_differences
      FROM voucher_journal_detail_tbl vjd
      JOIN voucher_header_tbl vh ON vh.id = vjd.voucher_id
      WHERE vh.status <> 3 AND vh.vch_status = 2 AND vh.vch_date::date <= ${date}::date
        AND vh.internal_voucher_id = ${INTERNAL_VOUCHER.CURRENCY_DIFFERENCE} AND vh.manual_voucher = ${currencyCode}
      GROUP BY vjd.account_id
    )
    SELECT a.id AS account_id, a.code AS account_code, a.name AS account_name,
      ROUND(m.balance::numeric, 2)::float8 AS balance,
      ROUND(m.base_balance::numeric, 2)::float8 AS base_balance,
      ROUND(COALESCE(p.previous_differences, 0)::numeric, 2)::float8 AS previous_differences
    FROM movements m
    JOIN account_tbl a ON a.id = m.account_id
    LEFT JOIN previous p ON p.account_id = a.id
    WHERE COALESCE(a.status, 1) <> 3
      AND a.finanical_list_id = 1 AND COALESCE(a.iscalc_curr_diff_rates, false) = true
      AND NOT EXISTS (SELECT 1 FROM account_tbl child WHERE child.father_id = a.id)
      AND (${accountIds.length === 0} OR a.id = ANY(${accountIds}::int[]))
    ORDER BY a.code
  `
  return rows
    .map((row: any) => {
      const balance = Number(row.balance)
      const baseBalance = Number(row.base_balance)
      const previous = Number(row.previous_differences)
      const evaluated = round2(balance * rate)
      const difference = round2(evaluated - baseBalance - previous)
      return { ...row, balance, base_balance: baseBalance, previous_differences: previous, evaluated_balance: evaluated, difference }
    })
    .filter((row: any) => Math.abs(row.difference) >= 0.01)
}

async function resolveCurrency(currencyId: number) {
  const currency = (await sql`SELECT id, currency_code FROM currency WHERE id = ${currencyId}`)[0]
  return currency ? { id: Number(currency.id), code: String(currency.currency_code) } : null
}

export async function GET(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const authorization = await authorizeTransaction(request, "journal", "view")
    if (!authorization.ok) return authorization.response
    const params = new URL(request.url).searchParams
    const date = dateOnly(params.get("date"))
    const currency = await resolveCurrency(Number(params.get("currency_id") || 0))
    if (!currency) return NextResponse.json({ error: "اختر العملة" }, { status: 400 })
    if (currency.id === (await getBaseCurrencyId())) return NextResponse.json({ error: "لا يُحتسب فرق عملة لعملة الأساس" }, { status: 400 })
    const rate = Number(params.get("rate")) > 0 ? Number(params.get("rate")) : await getRateByDate(currency.id, date)
    if (!rate) return NextResponse.json({ error: "أدخل سعر الصرف — لا يوجد سعر مسجّل لهذه العملة بالتاريخ" }, { status: 400 })
    const rows = await differences(date, currency.id, currency.code, rate, positiveIds(params.get("account_ids")))
    return NextResponse.json({ rate, rows })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر احتساب فرق العملة")
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const body = await request.json()
    const date = dateOnly(body.vch_date)
    const rate = Number(body.rate)
    const differenceAccountId = Number(body.difference_account_id) || 0
    const accountIds = positiveIds(body.account_ids)
    const currency = await resolveCurrency(Number(body.currency_id) || 0)
    if (!currency) return NextResponse.json({ error: "اختر العملة" }, { status: 400 })
    const baseCurrencyId = await getBaseCurrencyId()
    if (!baseCurrencyId || currency.id === baseCurrencyId) return NextResponse.json({ error: "لا يُحتسب فرق عملة لعملة الأساس" }, { status: 400 })
    if (!(rate > 0)) return NextResponse.json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" }, { status: 400 })
    if (!differenceAccountId) return NextResponse.json({ error: "اختر حساب فرق العملة أولا" }, { status: 400 })
    if (!accountIds.length) return NextResponse.json({ error: "اختر حساباً واحداً على الأقل" }, { status: 400 })
    if (accountIds.includes(differenceAccountId)) return NextResponse.json({ error: "حساب فرق العملة لا يمكن أن يكون أحد الحسابات المُقيَّمة" }, { status: 400 })

    const authorization = await authorizeAutoJournal(request, body.branch_id)
    if (!authorization.ok) return authorization.response
    const note = String(body.note || "").trim() || "فرق عملة حساب"

    return await withTenantTransaction(async () => {
      // قفل لكل عملة: تنفيذان متزامنان لنفس العملة كانا سيحتسبان نفس الفرق مرتين.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`currency-difference:${currency.id}`}))`
      const rows = await differences(date, currency.id, currency.code, rate, accountIds)
      if (!rows.length) return NextResponse.json({ error: "لا يوجد فرق عملة للحسابات المختارة" }, { status: 409 })

      const context = await resolveJournalContext(authorization.userId)
      const journals: { id: number; code: string }[] = []
      for (const row of rows) {
        const gain = row.difference > 0
        const amount = Math.abs(row.difference)
        const journal = await createAutoJournal({
          userId: authorization.userId,
          branchId: authorization.branchId,
          date,
          currencyId: baseCurrencyId,
          rate: 1,
          manualVoucher: currency.code,
          internalVoucherId: INTERNAL_VOUCHER.CURRENCY_DIFFERENCE,
          note: `${note} ${currency.code} @ ${rate} - ${row.account_code} ${row.account_name} (${gain ? "ربح" : "خسارة"})`,
          lines: [
            // إعادة التقييم تغيّر قيمة الرصيد بعملة الأساس فقط — لا أثر على رصيد الحساب بعملته.
            { accountId: Number(row.account_id), creditDebit: gain ? 1 : 2, amount, currencyId: baseCurrencyId, rate: 1, accountAmountOverride: 0 },
            { accountId: differenceAccountId, creditDebit: gain ? 2 : 1, amount, currencyId: baseCurrencyId, rate: 1, journalTypeId: JOURNAL_TYPE_CURRENCY_CONVERT },
          ],
        }, context)
        journals.push(journal)
      }

      return NextResponse.json({
        message: `تم إنشاء ${journals.length} قيد فرق عملة: ${journals.map((journal) => journal.code).join(", ")}`,
        journal_vouchers: journals,
      })
    })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر إنشاء قيود فرق العملة")
  }
}
