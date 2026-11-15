import { NextResponse, type NextRequest } from "next/server"
import { reportAccessDenied } from "@/lib/report-permissions"
import sql from "@/lib/database"
import { deniedAccountIds, filterAccessibleAccounts } from "@/lib/account-access"
import { getSessionUser } from "@/lib/tenant-auth"
import { ensureAccountsTable } from "@/app/api/accounts/_lib"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { reportAmountSql } from "@/lib/report-currency"
import { ensureVoucherIndexes } from "@/lib/voucher-indexes"
import { runSchemaOnce } from "@/lib/schema-once"

// أعمدة ربط فاتورة نقطة البيع بسند القبض/الصرف (قواعد قديمة قد لا تحويها)
const ensurePosLinkColumns = () => runSchemaOnce("app/api/reports/receipts-expenses#posLinks", async () => {
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_invoice_voucher_id INTEGER`
  await sql`ALTER TABLE voucher_header_tbl ADD COLUMN IF NOT EXISTS pos_receipt_voucher_id INTEGER`
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// كشف المقبوضات / كشف المصروفات — منقول من ShamelAPI (ReceivablesReportM):
//   المقبوضات: سندات القبض + فواتير المبيعات النقدية + مرتجعات المشتريات النقدية
//   المصروفات: سندات الصرف + سندات صرف الشيكات + فواتير المشتريات النقدية + مرتجعات المبيعات النقدية
// الفاتورة "النقدية" = بلا حساب زبون/مورد (account_id فارغ) ⇐ مبلغها سطر الصندوق (journal_type 5).
// السندات: نقدي = journal_type 2، شيكات = 3، بطاقات = 4. التحويل لعملة التقرير لكل سطر قبل الجمع.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const RECEIPT = 4, PAYMENT = 5, SALES = 12, SALES_RETURN = 16, PURCHASE = 17, PURCHASE_RETURN = 19, CHEQUE_PAYMENT = 21
const KINDS = {
  receipts: { section: "receipts-report", vouchers: [RECEIPT], cashInvoices: [SALES, PURCHASE_RETURN] },
  expenses: { section: "expenses-report", vouchers: [PAYMENT, CHEQUE_PAYMENT], cashInvoices: [PURCHASE, SALES_RETURN] },
} as const

const parseIds = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const validDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const round = (value: number) => Math.round((Number(value) || 0) * 1000) / 1000

export async function GET(request: NextRequest) {
  void ensureVoucherIndexes().catch(() => undefined)
  try {
    const params = request.nextUrl.searchParams
    const kind = params.get("kind") === "expenses" ? "expenses" : "receipts"
    const config = KINDS[kind]
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const reportDenied = await reportAccessDenied(request, [config.section])
    if (reportDenied) return reportDenied
    await ensureAccountsTable()
    await ensureVoucherTables()
    await ensurePosLinkColumns()

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permittedBranchIds = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const branchIds = parseIds(params.get("branch_ids"))
    const effectiveBranchIds = branchIds.length ? branchIds.filter((id) => permittedBranchIds.length === 0 || permittedBranchIds.includes(id)) : permittedBranchIds
    if (branchIds.length && !effectiveBranchIds.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const wantsMeta = params.get("meta") === "1"
    const [currencies, accounts, branches, salesmen] = await Promise.all([
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
      wantsMeta ? sql`SELECT a.id, a.code, a.name FROM account_tbl a WHERE COALESCE(a.status, 1) <> 3
                      AND NOT EXISTS (SELECT 1 FROM account_tbl c WHERE c.father_id = a.id AND COALESCE(c.status, 1) <> 3) ORDER BY a.code` : [],
      wantsMeta ? (effectiveBranchIds.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND id = ANY(${effectiveBranchIds}::int[]) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE NOT COALESCE((to_jsonb(branches)->>'is_bank_branch')::boolean, false) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`) : [],
      wantsMeta ? sql`SELECT id, name FROM salesmen WHERE COALESCE(is_active, true) ORDER BY name`.catch(() => []) : [],
    ])
    if (wantsMeta) return NextResponse.json({ meta: { currencies, accounts: await filterAccessibleAccounts(request, accounts as any[]), branches, salesmen } })

    const year = new Date().getFullYear()
    const fromDate = validDate(params.get("from_date"), `${year}-01-01`)
    const toDate = validDate(params.get("to_date"), new Date().toISOString().slice(0, 10))
    const accountIds = parseIds(params.get("account_ids"))
    const salesmanIds = parseIds(params.get("salesman_ids"))
    const showOther = params.get("show_other_currencies") !== "0"
    const withCheques = params.get("cheque_details") === "1"
    const fromValue = Number(params.get("from_value") || 0) || 0
    const toValue = Number(params.get("to_value") || 0) || 0
    const selectedCurrency = Number(params.get("report_currency_id") || currencies[0]?.id || 0)
    const baseCurrency = Number(currencies[0]?.id || selectedCurrency)
    const targetCurrency = (currencies as any[]).find((currency) => Number(currency.id) === selectedCurrency)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })
    const amountSql = reportAmountSql(selectedCurrency, baseCurrency)
    const denied = [...(await deniedAccountIds(request))]

    // سطر واحد لكل سند: المبالغ مجمّعة حسب طريقة الدفع
    const rows = (await sql`
      WITH v AS (
        SELECT vh.id, vh.vch_code, vh.vch_date, vh.vch_type, vh.account_id, vh.customer_name, vh.note, vh.currency_id, vh.branch_id, vh.salesman_id
        FROM voucher_header_tbl vh
        WHERE COALESCE(vh.status, 1) <> 3
          AND vh.vch_date >= ${fromDate}::date AND vh.vch_date < (${toDate}::date + 1)
          AND (vh.vch_type = ANY(${config.vouchers as unknown as number[]}::int[])
               OR (vh.vch_type = ANY(${config.cashInvoices as unknown as number[]}::int[]) AND vh.account_id IS NULL
                   -- فاتورة نقطة بيع لها سند قبض/صرف مرتبط (الدفع المختلط/المردود) ⇐ السند يمثّلها (فيه التوزيع نقدي/بطاقات) فلا تُعدّ مرتين
                   AND NOT EXISTS (SELECT 1 FROM voucher_header_tbl r WHERE r.vch_type IN (${RECEIPT}, ${PAYMENT}) AND COALESCE(r.status, 1) <> 3
                     AND (r.pos_invoice_voucher_id = vh.id OR r.id = vh.pos_receipt_voucher_id
                          OR r.note IN ('قبض فاتورة نقطة البيع ' || vh.vch_code, 'صرف مردود نقدي لفاتورة نقطة البيع ' || vh.vch_code)))))
          AND (${effectiveBranchIds.length === 0} OR vh.branch_id = ANY(${effectiveBranchIds}::int[]))
          AND (${accountIds.length === 0} OR vh.account_id = ANY(${accountIds}::int[]))
          AND (${denied.length === 0} OR vh.account_id IS NULL OR NOT (vh.account_id = ANY(${denied}::int[])))
          AND (${salesmanIds.length === 0} OR vh.salesman_id = ANY(${salesmanIds}::int[]))
          AND (${showOther} OR vh.currency_id = ${selectedCurrency})
      ), sums AS (
        SELECT vjd.voucher_id,
          SUM(CASE WHEN (v.vch_type IN (${RECEIPT}, ${PAYMENT}) AND vjd.journal_type_id = 2)
                     OR (v.vch_type NOT IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT}) AND vjd.journal_type_id = 5)
                   THEN (${sql.unsafe(amountSql)}) ELSE 0 END)::float AS cash_amount,
          SUM(CASE WHEN v.vch_type IN (${RECEIPT}, ${PAYMENT}, ${CHEQUE_PAYMENT}) AND vjd.journal_type_id = 3 THEN (${sql.unsafe(amountSql)}) ELSE 0 END)::float AS cheques_amount,
          SUM(CASE WHEN v.vch_type IN (${RECEIPT}, ${PAYMENT}) AND vjd.journal_type_id = 4 THEN (${sql.unsafe(amountSql)}) ELSE 0 END)::float AS cards_amount
        FROM v
        JOIN voucher_journal_detail_tbl vjd ON vjd.voucher_id = v.id AND vjd.journal_type_id IN (2, 3, 4, 5)
        JOIN voucher_header_tbl vh ON vh.id = v.id
        GROUP BY vjd.voucher_id
      )
      SELECT v.id, v.vch_code, v.vch_date::date::text AS vch_date, v.vch_type, vt.name AS vch_type_name,
        a.code AS customer_code, COALESCE(NULLIF(BTRIM(a.name), ''), NULLIF(BTRIM(v.customer_name), ''), '') AS customer_name,
        COALESCE(v.note, '') AS notes, b.branch_name, s.name AS salesman_name,
        COALESCE(sums.cash_amount, 0) AS cash_amount, COALESCE(sums.cheques_amount, 0) AS cheques_amount, COALESCE(sums.cards_amount, 0) AS cards_amount
      FROM v
      LEFT JOIN sums ON sums.voucher_id = v.id
      LEFT JOIN voucher_types_tbl vt ON vt.id = v.vch_type
      LEFT JOIN account_tbl a ON a.id = v.account_id
      LEFT JOIN branches b ON b.id = v.branch_id
      LEFT JOIN salesmen s ON s.id = v.salesman_id
      ORDER BY v.vch_date, v.vch_code
    `) as any[]

    let result = rows.map((row) => {
      const cash = round(row.cash_amount), cheques = round(row.cheques_amount), cards = round(row.cards_amount)
      return { ...row, id: Number(row.id), vch_type: Number(row.vch_type), cash_amount: cash, cheques_amount: cheques, cards_amount: cards, total: round(cash + cheques + cards) }
    }).filter((row) => Math.abs(row.total) >= 0.0005)
    if (fromValue > 0) result = result.filter((row) => row.total >= fromValue)
    if (toValue > 0) result = result.filter((row) => row.total <= toValue)

    // تفاصيل الشيكات (كالشامل: "إظهار تفاصيل الشيكات") — تُعرض أسفل سندها
    let cheques: Record<number, any[]> = {}
    const chequeVoucherIds = result.filter((row) => row.cheques_amount).map((row) => row.id)
    if (withCheques && chequeVoucherIds.length) {
      const list = (await sql`
        SELECT c.voucher_id, c.cheq_num, c.bank_account, c.due_date::date::text AS due_date, c.amount::float AS amount,
          bk.bank_name, br.branch_name, cur.currency_code
        FROM cheques_tbl c
        LEFT JOIN banks bk ON bk.id = c.bank_id
        LEFT JOIN branches br ON br.id = c.branch_id
        LEFT JOIN currency cur ON cur.id = c.currency_id
        WHERE c.voucher_id = ANY(${chequeVoucherIds}::int[])
        ORDER BY c.voucher_id, c.due_date, c.id
      `.catch(() => [])) as any[]
      cheques = list.reduce((map, row) => { (map[Number(row.voucher_id)] ||= []).push(row); return map }, {} as Record<number, any[]>)
    }

    const summary = {
      count: result.length,
      cash: round(result.reduce((sum, row) => sum + row.cash_amount, 0)),
      cheques: round(result.reduce((sum, row) => sum + row.cheques_amount, 0)),
      cards: round(result.reduce((sum, row) => sum + row.cards_amount, 0)),
      total: round(result.reduce((sum, row) => sum + row.total, 0)),
    }
    return NextResponse.json({ rows: result, cheques, summary, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ إحدى الحركات. يرجى تعريف سعر الصرف وإعادة عرض التقرير." }, { status: 400 })
    }
    console.error("Receipts/expenses report error:", error)
    return NextResponse.json({ error: "تعذر تحميل التقرير" }, { status: 500 })
  }
}
