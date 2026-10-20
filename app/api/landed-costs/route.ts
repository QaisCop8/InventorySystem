import { NextRequest, NextResponse } from "next/server"
import sql, { withTenantTransaction } from "@/lib/database"
import { authorizeTransaction } from "@/lib/transaction-permissions"
import { AutoJournalError, INTERNAL_VOUCHER, createAutoJournal, getBaseCurrencyId, round2 } from "@/lib/auto-journals"
import {
  LANDED_COST_CHARGE_TYPES, LANDED_COST_METHODS, LANDED_COST_METHOD_LABELS, LANDED_COST_PURCHASE_TYPES,
  ensureLandedCostSchema, nextLandedCostCode, purchaseLinesForLandedCost, type LandedCostMethod,
} from "@/lib/landed-costs"
import { workingPeriodErrorMessage } from "@/lib/working-period"

// تحميل تكاليف الشحن والجمارك — GET: القائمة (+ meta=1 العملات والفروع، purchase_search بحث فواتير المشتريات،
// purchase_id أسطر فاتورة مع أسس التوزيع). POST: حفظ مستند + قيده الآلي في معاملة واحدة.
const isDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "landed_cost", "view")
    if (!authorization.ok) return authorization.response
    await ensureLandedCostSchema()
    const params = request.nextUrl.searchParams

    if (params.get("meta") === "1") {
      const [currencies, branches, lastDebit] = await Promise.all([
        sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
        sql`SELECT id, branch_name AS name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
        sql`SELECT debit_account_id FROM landed_costs_tbl WHERE debit_account_id IS NOT NULL ORDER BY id DESC LIMIT 1`,
      ])
      return NextResponse.json({
        currencies, branches, base_currency_id: await getBaseCurrencyId(),
        default_debit_account_id: lastDebit[0]?.debit_account_id ?? null,
        methods: LANDED_COST_METHODS.map((value) => ({ value, label: LANDED_COST_METHOD_LABELS[value] })),
        charge_types: Object.entries(LANDED_COST_CHARGE_TYPES).map(([value, label]) => ({ value, label })),
      })
    }

    if (params.has("purchase_search")) {
      const search = String(params.get("purchase_search") || "").trim()
      const rows = await sql`
        SELECT vh.id, vh.vch_code, vh.vch_date::date::text AS vch_date, acc.name AS supplier_name, c.currency_code, COALESCE(vh.amount, 0) AS amount,
          (SELECT COUNT(*)::int FROM landed_costs_tbl lc WHERE lc.purchase_voucher_id = vh.id AND lc.status <> 3) AS landed_count
        FROM voucher_header_tbl vh
        LEFT JOIN account_tbl acc ON acc.id = vh.account_id
        LEFT JOIN currency c ON c.id = vh.currency_id
        WHERE vh.vch_type = ANY(${LANDED_COST_PURCHASE_TYPES}::int[]) AND COALESCE(vh.status, 1) <> 3
          AND (${search} = '' OR vh.vch_code ILIKE ${`%${search}%`} OR acc.name ILIKE ${`%${search}%`} OR COALESCE(vh.manual_voucher, '') ILIKE ${`%${search}%`})
        ORDER BY vh.vch_date DESC, vh.id DESC
        LIMIT 100
      `
      return NextResponse.json({ rows })
    }

    const purchaseId = Number(params.get("purchase_id"))
    if (purchaseId > 0) {
      const data = await purchaseLinesForLandedCost(purchaseId)
      if (!data) return NextResponse.json({ error: "فاتورة المشتريات غير موجودة أو ملغاة" }, { status: 404 })
      return NextResponse.json(data)
    }

    const rows = await sql`
      SELECT lc.id, lc.code, lc.doc_date::text AS doc_date, lc.method, lc.total_amount, lc.rate, lc.status, lc.note,
        lc.purchase_voucher_id, vh.vch_code AS purchase_code, acc.name AS supplier_name, c.currency_code,
        lc.journal_voucher_id, jv.vch_code AS journal_code, b.branch_name,
        (SELECT string_agg(DISTINCT ch.charge_type, ',') FROM landed_cost_charges_tbl ch WHERE ch.landed_cost_id = lc.id) AS charge_types
      FROM landed_costs_tbl lc
      LEFT JOIN voucher_header_tbl vh ON vh.id = lc.purchase_voucher_id
      LEFT JOIN account_tbl acc ON acc.id = vh.account_id
      LEFT JOIN currency c ON c.id = lc.currency_id
      LEFT JOIN voucher_header_tbl jv ON jv.id = lc.journal_voucher_id
      LEFT JOIN branches b ON b.id = lc.branch_id
      ORDER BY lc.doc_date DESC, lc.id DESC
      LIMIT 500
    `
    return NextResponse.json({ rows })
  } catch (error) {
    console.error("[landed-costs] GET failed", error)
    return NextResponse.json({ error: "تعذر تحميل تكاليف الشحن والجمارك" }, { status: 500 })
  }
}

class InputError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeTransaction(request, "landed_cost", "create")
    if (!authorization.ok) return authorization.response
    await ensureLandedCostSchema()
    const data = await request.json().catch(() => ({}))
    const userId = String(authorization.userId)

    const purchaseId = Number(data.purchase_voucher_id)
    const method = (LANDED_COST_METHODS as readonly string[]).includes(data.method) ? (data.method as LandedCostMethod) : "value"
    const debitAccountId = Number(data.debit_account_id)
    const currencyId = Number(data.currency_id)
    const rate = Number(data.rate) > 0 ? Number(data.rate) : 0
    if (!isDate(data.doc_date)) return NextResponse.json({ error: "حدّد تاريخ المستند" }, { status: 400 })
    if (!(purchaseId > 0)) return NextResponse.json({ error: "اختر فاتورة المشتريات" }, { status: 400 })
    if (!(debitAccountId > 0)) return NextResponse.json({ error: "اختر حساب المخزون/المشتريات (الطرف المدين)" }, { status: 400 })
    if (!(currencyId > 0) || !rate) return NextResponse.json({ error: "حدّد العملة وسعر الصرف" }, { status: 400 })

    const charges = (Array.isArray(data.charges) ? data.charges : [])
      .map((charge: any) => ({
        charge_type: Object.prototype.hasOwnProperty.call(LANDED_COST_CHARGE_TYPES, charge?.charge_type) ? String(charge.charge_type) : "other",
        account_id: Number(charge?.account_id) || 0,
        amount: round2(Number(charge?.amount) || 0),
        reference: String(charge?.reference || "").slice(0, 100),
        note: String(charge?.note || "").slice(0, 300),
      }))
      .filter((charge: any) => charge.amount !== 0 || charge.account_id)
    if (!charges.length) return NextResponse.json({ error: "أضف بند تكلفة واحداً على الأقل" }, { status: 400 })
    if (charges.some((charge: any) => !charge.account_id)) return NextResponse.json({ error: "حدّد الحساب الدائن لكل بند" }, { status: 400 })
    if (charges.some((charge: any) => !(charge.amount > 0))) return NextResponse.json({ error: "مبلغ كل بند يجب أن يكون أكبر من صفر" }, { status: 400 })
    const total = round2(charges.reduce((sum: number, charge: any) => sum + charge.amount, 0))

    const purchase = await purchaseLinesForLandedCost(purchaseId)
    if (!purchase) return NextResponse.json({ error: "فاتورة المشتريات غير موجودة أو ملغاة" }, { status: 404 })
    const basisKey = `basis_${method}` as const
    const basisTotal = purchase.lines.reduce((sum: number, line: any) => sum + Math.max(0, Number(line[basisKey]) || 0), 0)
    if (!purchase.lines.length) return NextResponse.json({ error: "لا توجد أصناف مخزنية في الفاتورة لتحميل التكاليف عليها" }, { status: 400 })
    if (!(basisTotal > 0)) {
      return NextResponse.json({ error: method === "weight" ? "أصناف الفاتورة بلا وزن معرّف — عرّف وزن الأصناف أو وزّع حسب القيمة/الكمية" : "أساس التوزيع صفر لكل الأصناف" }, { status: 400 })
    }
    const branchId = Number(data.branch_id) || Number(purchase.header.branch_id) || authorization.branchId

    const result = await withTenantTransaction(async () => {
      const code = await nextLandedCostCode()
      const header = (await sql`
        INSERT INTO landed_costs_tbl (code, doc_date, branch_id, purchase_voucher_id, method, currency_id, rate, debit_account_id, total_amount, note, status, created_by, updated_by)
        VALUES (${code}, ${data.doc_date}, ${branchId}, ${purchaseId}, ${method}, ${currencyId}, ${rate}, ${debitAccountId}, ${total},
          ${String(data.note || "").slice(0, 1000) || null}, 1, ${userId}, ${userId})
        RETURNING id
      `)[0] as any
      const landedCostId = Number(header.id)
      for (const charge of charges) {
        await sql`
          INSERT INTO landed_cost_charges_tbl (landed_cost_id, charge_type, account_id, amount, reference, note)
          VALUES (${landedCostId}, ${charge.charge_type}, ${charge.account_id}, ${charge.amount}, ${charge.reference || null}, ${charge.note || null})
        `
      }
      const label = `تحميل تكاليف على فاتورة مشتريات ${purchase.header.vch_code}`
      const journal = await createAutoJournal({
        userId, branchId, date: data.doc_date, currencyId, rate,
        note: `${label} (${code})${data.note ? ` — ${String(data.note).slice(0, 200)}` : ""}`,
        internalVoucherId: INTERNAL_VOUCHER.LANDED_COST,
        manualVoucher: code,
        lines: [
          { accountId: debitAccountId, creditDebit: 1, amount: total, currencyId, rate, note: label },
          ...charges.map((charge: any) => ({
            accountId: charge.account_id, creditDebit: 2 as const, amount: charge.amount, currencyId, rate,
            note: [LANDED_COST_CHARGE_TYPES[charge.charge_type], charge.reference].filter(Boolean).join(" - "),
          })),
        ],
      })
      await sql`UPDATE landed_costs_tbl SET journal_voucher_id = ${journal.id} WHERE id = ${landedCostId}`
      return { id: landedCostId, code, journal }
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof InputError || error instanceof AutoJournalError) return NextResponse.json({ error: error.message }, { status: 400 })
    const periodError = workingPeriodErrorMessage(error)
    if (periodError) return NextResponse.json({ error: periodError }, { status: 400 })
    console.error("[landed-costs] POST failed", error)
    return NextResponse.json({ error: "تعذر حفظ مستند التكاليف" }, { status: 500 })
  }
}
