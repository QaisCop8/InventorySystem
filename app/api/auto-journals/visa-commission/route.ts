import { type NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { RECEIPT_VCH_TYPE, JOURNAL_TYPE_CARD } from "@/app/api/receipts/_lib"
import {
  INTERNAL_VOUCHER,
  createAutoJournal,
  dateOnly,
  resolveJournalContext,
  round2,
} from "@/lib/auto-journals"
import { authorizeAutoJournal, autoJournalErrorResponse, ensureAutoJournalSchema, positiveIds } from "../_lib"

// قيود عمولة الفيزا (ShamelAPI: CreditCardsJournals). لكل حركة بطاقة ائتمان في سند قبض مُرحَّل لم
// يُنشأ لها قيد عمولة بعد (voucher_cards_detail_tbl.fees_voucher_id فارغ) يُنشأ قيد واحد:
//   مدين  حساب البنك (financial_account_id لنوع البطاقة)   بمبلغ الحركة
//   دائن  حساب البطاقات في سند القبض                        بمبلغ الحركة
//   مدين  حساب العمولة (commission_account_id)             بالعمولة
//   دائن  حساب البنك                                       بالعمولة
// العمولة: نوع 1 = نسبة من المبلغ، نوع 2 = مبلغ مقطوع؛ بحد أقصى commission_max_amount إن وُجد.

const transactionsQuery = async (filters: {
  ids?: number[]; fromDate?: string | null; toDate?: string | null; currencyId?: number; cardTypeIds?: number[]; branchIds: number[]; lock?: boolean
}) => {
  const ids = filters.ids ?? []
  const cardTypeIds = filters.cardTypeIds ?? []
  const rows = await sql`
    SELECT vcd.id, vh.id AS vch_id, vh.vch_code, vh.vch_date::date::text AS vch_date, vh.branch_id,
      vcd.amount, vcd.card_no, vcd.currency_id, cur.currency_code,
      COALESCE(NULLIF(card_line.rate, 0), NULLIF(vh.rate, 0), 1) AS rate,
      COALESCE(customer.name, vh.customer_name, '') AS customer_name,
      ct.id AS card_type_id, ct.name AS card_type_name, ct.commission_type_id, ct.commission_value, ct.commission_max_amount,
      ct.financial_account_id, financial.code AS financial_account_code, financial.name AS financial_account_name,
      ct.commission_account_id, commission.code AS commission_account_code, commission.name AS commission_account_name,
      card_line.account_id AS card_account_id, card_account.code AS card_account_code, card_account.name AS card_account_name
    FROM voucher_header_tbl vh
    JOIN voucher_cards_detail_tbl vcd ON vcd.voucher_id = vh.id
    JOIN credit_cards_types_tbl ct ON ct.id = vcd.card_type_id
    JOIN LATERAL (
      SELECT account_id, rate FROM voucher_journal_detail_tbl
      WHERE voucher_id = vh.id AND journal_type_id = ${JOURNAL_TYPE_CARD}
      ORDER BY order_no, id LIMIT 1
    ) card_line ON true
    LEFT JOIN account_tbl customer ON customer.id = vh.account_id
    LEFT JOIN account_tbl card_account ON card_account.id = card_line.account_id
    LEFT JOIN account_tbl financial ON financial.id = ct.financial_account_id
    LEFT JOIN account_tbl commission ON commission.id = ct.commission_account_id
    LEFT JOIN currency cur ON cur.id = vcd.currency_id
    WHERE vh.vch_type = ${RECEIPT_VCH_TYPE} AND vh.status <> 3 AND vh.vch_status = 2
      AND COALESCE(ct.main_type, 1) = 1
      AND COALESCE(vcd.fees_voucher_id, 0) = 0
      AND COALESCE(vcd.amount, 0) > 0
      AND vh.branch_id = ANY(${filters.branchIds}::int[])
      AND (${ids.length === 0} OR vcd.id = ANY(${ids}::int[]))
      AND (${!filters.fromDate} OR vh.vch_date::date >= ${filters.fromDate || "1900-01-01"}::date)
      AND (${!filters.toDate} OR vh.vch_date::date <= ${filters.toDate || "2999-12-31"}::date)
      AND (${!filters.currencyId} OR vcd.currency_id = ${filters.currencyId || 0})
      AND (${cardTypeIds.length === 0} OR vcd.card_type_id = ANY(${cardTypeIds}::int[]))
    ORDER BY vh.vch_date, vh.id, vcd.order_no
  `
  return rows.map((row: any) => {
    const amount = Number(row.amount || 0)
    const value = Number(row.commission_value || 0)
    const max = Number(row.commission_max_amount || 0)
    let commission = Number(row.commission_type_id) === 2 ? value : (amount * value) / 100
    if (max > 0 && commission > max) commission = max
    commission = round2(commission)
    return {
      ...row,
      amount,
      rate: Number(row.rate),
      commission,
      commission_percent: amount > 0 ? round2((commission * 100) / amount) : 0,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const authorization = await authorizeTransaction(request, "journal", "view")
    if (!authorization.ok) return authorization.response
    const params = new URL(request.url).searchParams
    const rows = await transactionsQuery({
      fromDate: params.get("from_date"),
      toDate: params.get("to_date"),
      currencyId: Number(params.get("currency_id") || 0) || undefined,
      cardTypeIds: positiveIds(params.get("card_type_ids")),
      branchIds: authorization.branchIds,
    })
    return NextResponse.json({ rows })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر تحميل حركات البطاقات")
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAutoJournalSchema()
    const body = await request.json()
    const ids = positiveIds(body.ids)
    if (!ids.length) return NextResponse.json({ error: "اختر حركة بطاقة واحدة على الأقل" }, { status: 400 })
    if (ids.length > 500) return NextResponse.json({ error: "الحد الأقصى للعملية الواحدة 500 حركة" }, { status: 400 })
    const date = dateOnly(body.vch_date)
    const note = String(body.note || "").trim()

    const view = await authorizeTransaction(request, "journal", "view")
    if (!view.ok) return view.response

    return await withTenantTransaction(async () => {
      // قفل الحركات المختارة حتى لا يُنشئ مستخدمان قيد العمولة لنفس الحركة بنفس اللحظة.
      await sql`SELECT id FROM voucher_cards_detail_tbl WHERE id = ANY(${ids}::int[]) FOR UPDATE`
      const rows = await transactionsQuery({ ids, branchIds: view.branchIds })
      if (rows.length !== ids.length) {
        return NextResponse.json({ error: "بعض الحركات المختارة لم تعد متاحة (أُنشئ لها قيد عمولة أو أُلغي سندها). حدّث القائمة." }, { status: 409 })
      }

      // كل التحقق (الصلاحيات لكل فرع + الحسابات) قبل إنشاء أي قيد: إرجاع خطأ من داخل المعاملة بعد
      // إنشاء بعض القيود كان سيُثبِّتها جزئياً.
      const contexts = new Map<number, Awaited<ReturnType<typeof resolveJournalContext>>>()
      for (const row of rows) {
        const branchId = Number(row.branch_id)
        if (!contexts.has(branchId)) {
          const authorization = await authorizeAutoJournal(request, branchId)
          if (!authorization.ok) return authorization.response
          contexts.set(branchId, await resolveJournalContext(authorization.userId))
        }
        if (!row.financial_account_id) return NextResponse.json({ error: `لم يُعرَّف حساب البنك لنوع البطاقة ${row.card_type_name}` }, { status: 400 })
        if (!row.card_account_id) return NextResponse.json({ error: `تعذر تحديد حساب البطاقات في السند ${row.vch_code}` }, { status: 400 })
        if (row.commission > 0 && !row.commission_account_id) return NextResponse.json({ error: `لم يُعرَّف حساب العمولة لنوع البطاقة ${row.card_type_name}` }, { status: 400 })
      }

      const journals: { id: number; code: string; card_id: number }[] = []
      for (const row of rows) {
        const branchId = Number(row.branch_id)
        const currencyId = Number(row.currency_id)
        const rate = Number(row.rate) || 1
        const journal = await createAutoJournal({
          userId: view.userId,
          branchId,
          date,
          currencyId,
          rate,
          internalVoucherId: INTERNAL_VOUCHER.CARD_COMMISSION,
          note: `${note || "قيد عمولة فيزا"} - ${row.card_type_name} ${row.commission_percent}% - ${row.customer_name} (${row.vch_code})`,
          lines: [
            { accountId: Number(row.financial_account_id), creditDebit: 1, amount: row.amount, currencyId, rate },
            { accountId: Number(row.card_account_id), creditDebit: 2, amount: row.amount, currencyId, rate },
            { accountId: Number(row.commission_account_id), creditDebit: 1, amount: row.commission, currencyId, rate },
            { accountId: Number(row.financial_account_id), creditDebit: 2, amount: row.commission, currencyId, rate },
          ],
        }, contexts.get(branchId))
        await sql`UPDATE voucher_cards_detail_tbl SET fees_voucher_id = ${journal.id} WHERE id = ${Number(row.id)}`
        await sql`INSERT INTO voucher_related_vch_tbl (type, voucher_id, related_vch_id) VALUES (1, ${journal.id}, ${Number(row.vch_id)})`
        journals.push({ ...journal, card_id: Number(row.id) })
      }

      return NextResponse.json({
        message: `تم إنشاء ${journals.length} قيد عمولة: ${journals.map((journal) => journal.code).join(", ")}`,
        journal_vouchers: journals,
      })
    })
  } catch (error) {
    return autoJournalErrorResponse(error, "تعذر إنشاء قيود عمولة الفيزا")
  }
}
