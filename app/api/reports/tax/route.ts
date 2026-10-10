import { NextResponse, type NextRequest } from "next/server"
import sql from "@/lib/database"
import { getSessionUser } from "@/lib/tenant-auth"
import { reportAccessDenied } from "@/lib/report-permissions"
import { reportAmountSql } from "@/lib/report-currency"
import { getSystemSettings } from "@/lib/system-settings"
import { ensureTables as ensureVoucherTables } from "@/app/api/receipts/_lib"
import { INVOICE_TYPES, MAQASA_CODES, TAX_REPORTS, VAT_CLASSIFICATIONS, type TaxReportKind } from "@/lib/tax-reports"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// التقارير الضريبية (ضريبة القيمة المضافة) — منقولة من ShamelAPI: TaxSalesStatement، CalclationTaxReport،
// SalesAndPurchasesTaxReport، MaqasaTaxReport (نماذج ض.ق.م 878/879).
// أنواع السندات بهذا النظام: 12 فاتورة مبيعات، 16 مرتجع مبيعات (سالب)، 17 فاتورة مشتريات، 19 مرتجع
// مشتريات (سالب)، 6 إشعار دائن، 7 إشعار مدين.
// مبلغ السند (amount) شامل الضريبة = الصافي × (1 + النسبة)؛ فالصافي = المبلغ ÷ (1 + النسبة) والضريبة =
// المبلغ − الصافي (الإشعارات تحمل عمود vat صريحاً فيُعتمد). التصنيف الضريبي: 1 ضريبية، 2 معفاه، 3 صفرية
// (المعفاه/الصفرية أو النسبة 0 ⇐ صفقات معفاه). نوع الفاتورة 3 (أصول) ⇐ ضريبة مدخلات أجهزة وأثاث وأموال
// غير منقولة، وغيره ⇐ مشتريات أخرى. المبالغ بعملة التقرير.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SALES = 12, SALES_RETURN = 16, PURCHASE = 17, PURCHASE_RETURN = 19, CREDIT_NOTE = 6, DEBIT_NOTE = 7
const ids = (value: string | null) => String(value || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
const isoDate = (value: string | null, fallback: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback)
const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100

type Voucher = {
  id: number; vch_type: number; vch_code: string; vch_date: string; manual_voucher: string; manual_date: string | null; note: string
  customer_name: string; vat_reg: string; vat_percent: number; classification: number; invoice_type: number; is_maqasa: boolean; maqasa_type: number | null
  sign: number; total: number; net: number; vat: number; exempt: number
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 })
    const p = request.nextUrl.searchParams
    const kind = (p.get("kind") && p.get("kind")! in TAX_REPORTS ? p.get("kind") : "calculation") as TaxReportKind
    const denied = await reportAccessDenied(request, [TAX_REPORTS[kind].section])
    if (denied) return denied
    await ensureVoucherTables()

    const memberships = await sql`SELECT branch_id FROM user_branches WHERE user_id = ${user.user_id}`
    const permitted = memberships.map((row: any) => Number(row.branch_id)).filter(Number.isFinite)
    const branchIds = ids(p.get("branch_ids"))
    const effectiveBranches = branchIds.length ? branchIds.filter((id) => !permitted.length || permitted.includes(id)) : permitted
    if (branchIds.length && !effectiveBranches.length) return NextResponse.json({ error: "لا تملك صلاحية على الفروع المحددة" }, { status: 403 })

    const [currencies, branches] = await Promise.all([
      sql`SELECT id, currency_code, currency_name FROM currency WHERE COALESCE(is_active, true) ORDER BY id`,
      effectiveBranches.length
        ? sql`SELECT id, branch_code, branch_name FROM branches WHERE id = ANY(${effectiveBranches}::int[]) AND COALESCE(status, 1) <> 3 ORDER BY branch_name`
        : sql`SELECT id, branch_code, branch_name FROM branches WHERE COALESCE(status, 1) <> 3 ORDER BY branch_name`,
    ])
    const meta = { currencies, branches }
    if (p.get("meta") === "1") return NextResponse.json({ meta })

    const today = new Date().toISOString().slice(0, 10)
    const fromDate = isoDate(p.get("from_date"), `${today.slice(0, 7)}-01`)
    const toDate = isoDate(p.get("to_date"), today)
    const status = p.get("status") === "all" ? "all" : "posted"
    const showNotes = p.get("show_notes") === "1"
    const classifications = ids(p.get("classifications"))
    const baseId = Number(currencies[0]?.id)
    const targetId = Number(p.get("report_currency_id") || baseId)
    const targetCurrency = currencies.find((currency: any) => Number(currency.id) === targetId)
    if (!targetCurrency) return NextResponse.json({ error: "العملة المحددة غير موجودة" }, { status: 400 })

    const types = kind === "calculation" ? [SALES, SALES_RETURN, PURCHASE, PURCHASE_RETURN, CREDIT_NOTE, DEBIT_NOTE]
      : kind === "sales" ? [SALES, SALES_RETURN, ...(showNotes ? [CREDIT_NOTE, DEBIT_NOTE] : [])]
      : kind === "purchases" ? [PURCHASE, PURCHASE_RETURN]
      : kind === "sales-purchases" ? [SALES, SALES_RETURN, PURCHASE, PURCHASE_RETURN]
      : kind === "maqasa-sales" ? [SALES, SALES_RETURN]
      : [PURCHASE, PURCHASE_RETURN]
    const maqasaOnly = kind === "maqasa-sales" || kind === "maqasa-purchases"

    const amountSql = reportAmountSql(targetId, baseId, "vh")
    const raw = (await sql`
      SELECT vh.id, vh.vch_type, vh.vch_code, vh.vch_date::date::text AS vch_date, COALESCE(vh.manual_voucher, '') AS manual_voucher,
        CASE WHEN vh.manual_date IS NULL OR vh.manual_date::date < '2000-01-01' THEN NULL ELSE vh.manual_date::date::text END AS manual_date,
        COALESCE(vh.note, '') AS note,
        COALESCE(NULLIF(a.name, ''), NULLIF(vh.customer_name, ''), '') AS customer_name,
        COALESCE(vh.vat_reg, '') AS vat_reg, COALESCE(vh.vat_percent, 0)::float AS vat_percent,
        COALESCE(vh.vat_classification_id, 1) AS classification, COALESCE(vh.invoice_type, 1) AS invoice_type,
        COALESCE(vh.is_maqasa, false) AS is_maqasa, vh.maqasa_type,
        COALESCE(vh.amount, 0)::float AS source_amount, COALESCE(vh.vat, 0)::float AS source_vat,
        (${sql.unsafe(amountSql)})::float AS amount
      FROM voucher_header_tbl vh
      LEFT JOIN account_tbl a ON a.id = vh.account_id
      WHERE vh.vch_type = ANY(${types}::int[])
        AND ${sql.unsafe(status === "posted" ? "vh.status = 2" : "vh.status <> 3")}
        AND ${sql.unsafe(effectiveBranches.length ? `vh.branch_id = ANY(ARRAY[${effectiveBranches.join(",")}]::int[])` : "TRUE")}
        AND ${sql.unsafe(maqasaOnly ? "COALESCE(vh.is_maqasa, false) = true" : "TRUE")}
        AND vh.vch_date::date BETWEEN ${fromDate}::date AND ${toDate}::date
      ORDER BY vh.vch_date, vh.id
    `) as any[]

    const vouchers: Voucher[] = raw.map((row) => {
      const vchType = Number(row.vch_type)
      const sign = vchType === SALES_RETURN || vchType === PURCHASE_RETURN ? -1 : 1
      const total = Number(row.amount) || 0
      const percent = Number(row.vat_percent) || 0
      const classification = Number(row.classification) || 1
      // الإشعارات: عمود vat صريح (محوَّل بنفس نسبة تحويل المبلغ)؛ بقية السندات: من النسبة
      const ratio = Number(row.source_amount) ? total / Number(row.source_amount) : 1
      const explicitVat = (vchType === CREDIT_NOTE || vchType === DEBIT_NOTE) && Number(row.source_vat) > 0 ? Number(row.source_vat) * ratio : null
      const taxable = classification === 1 && (percent > 0 || (explicitVat ?? 0) > 0)
      const vat = !taxable ? 0 : explicitVat ?? total - total / (1 + percent / 100)
      const net = total - vat
      return {
        id: Number(row.id), vch_type: vchType, vch_code: row.vch_code, vch_date: row.vch_date, manual_voucher: row.manual_voucher, manual_date: row.manual_date,
        note: row.note, customer_name: row.customer_name, vat_reg: row.vat_reg, vat_percent: percent, classification, invoice_type: Number(row.invoice_type) || 1,
        is_maqasa: Boolean(row.is_maqasa), maqasa_type: row.maqasa_type == null ? null : Number(row.maqasa_type),
        sign, total: round(sign * total), net: round(sign * (taxable ? net : 0)), vat: round(sign * vat), exempt: round(sign * (taxable ? 0 : total)),
      }
    }).filter((row) => !classifications.length || classifications.includes(row.classification))

    const voucherTypeName: Record<number, string> = { [SALES]: "فاتورة مبيعات", [SALES_RETURN]: "مرتجع مبيعات", [PURCHASE]: "فاتورة مشتريات", [PURCHASE_RETURN]: "مرتجع مشتريات", [CREDIT_NOTE]: "إشعار دائن", [DEBIT_NOTE]: "إشعار مدين" }
    const sum = (list: Voucher[], key: "total" | "net" | "vat" | "exempt") => round(list.reduce((s, row) => s + row[key], 0))
    const base = { kind, currency: targetCurrency, filters: { from_date: fromDate, to_date: toDate } }

    if (kind === "calculation") {
      const sales = vouchers.filter((row) => row.vch_type === SALES || row.vch_type === SALES_RETURN)
      const purchases = vouchers.filter((row) => row.vch_type === PURCHASE || row.vch_type === PURCHASE_RETURN)
      const outputVat = sum(sales, "vat")
      const taxableSales = sum(sales, "net")
      const exemptSales = sum(sales, "exempt")
      const inputAssets = sum(purchases.filter((row) => row.invoice_type === 3), "vat")
      const inputOther = sum(purchases.filter((row) => row.invoice_type !== 3), "vat")
      const creditNotes = sum(vouchers.filter((row) => row.vch_type === CREDIT_NOTE), "vat")
      const debitNotes = sum(vouchers.filter((row) => row.vch_type === DEBIT_NOTE), "vat")
      const net = round(outputVat - inputAssets - inputOther)
      return NextResponse.json({
        ...base,
        shape: "calculation",
        lines: [
          { key: "output", label: "الضريبة على الصفقات", value: outputVat },
          { key: "taxable", label: "صفقات ملزمة لا تشمل ض.ق.م", value: taxableSales },
          { key: "exempt", label: "صفقات معفاه", value: exemptSales },
          { key: "input-assets", label: "ضريبة مدخلات - مشتريات - اجهزة واثاث واموال غير منقولة", value: inputAssets },
          { key: "input-other", label: "ضريبة مدخلات - مشتريات أخرى", value: inputOther },
          { key: "credit-notes", label: "ضريبة إشعارات دائنة", value: creditNotes },
          { key: "debit-notes", label: "ضريبة إشعارات مدينة", value: debitNotes },
        ],
        net,
        net_label: net >= 0 ? "المبلغ للدفع" : "الصافي للإعادة",
        counts: { sales: sales.length, purchases: purchases.length },
      })
    }

    if (maqasaOnly) {
      // نموذج المقاصة: ض.ق.م بالفاتورة مقرّبة لأقرب عدد صحيح (كما في شامل)، مع تفاصيل المشتغل من الإعدادات
      const settings = await getSystemSettings()
      const company = {
        name: String(settings.company_name || ""),
        tax_number: String(settings.tax_number || settings.vat_number || settings.company_tax_number || ""),
        address: String(settings.company_address || settings.address || ""),
        business: String(settings.business_nature || settings.company_activity || ""),
      }
      const rows = vouchers.map((row) => ({
        id: row.id, vch_type: row.vch_type, code: MAQASA_CODES[Number(row.maqasa_type) || 1] ? Number(row.maqasa_type) || 1 : 1,
        code_name: MAQASA_CODES[Number(row.maqasa_type) || 1] || "", party_name: row.customer_name, file_number: row.vat_reg,
        voucher_number: row.manual_voucher || row.vch_code, vch_code: row.vch_code, date: row.manual_date || row.vch_date, note: row.note,
        vat: Math.round(row.vat), net: row.net, total: row.total,
      }))
      return NextResponse.json({ ...base, shape: "maqasa", rows, company, totals: { vat: rows.reduce((s, r) => s + r.vat, 0), net: round(rows.reduce((s, r) => s + r.net, 0)), total: round(rows.reduce((s, r) => s + r.total, 0)) } })
    }

    const rows = vouchers.map((row) => {
      const isPurchase = row.vch_type === PURCHASE || row.vch_type === PURCHASE_RETURN
      return {
        ...row,
        voucher_type_name: voucherTypeName[row.vch_type] || "",
        classification_name: VAT_CLASSIFICATIONS[row.classification] || "",
        invoice_type_name: INVOICE_TYPES[row.invoice_type] || "",
        direction: isPurchase ? "purchase" : "sales",
        // كشف المشتريات: توزيع الصافي والضريبة حسب نوع الفاتورة (تجارية/خدمات/أصول)
        trade_net: isPurchase && row.invoice_type === 1 ? row.net : 0, trade_vat: isPurchase && row.invoice_type === 1 ? row.vat : 0,
        services_net: isPurchase && row.invoice_type === 2 ? row.net : 0, services_vat: isPurchase && row.invoice_type === 2 ? row.vat : 0,
        assets_net: isPurchase && row.invoice_type === 3 ? row.net : 0, assets_vat: isPurchase && row.invoice_type === 3 ? row.vat : 0,
      }
    })
    const salesRows = rows.filter((row) => row.direction === "sales")
    const purchaseRows = rows.filter((row) => row.direction === "purchase")
    const outputVat = round(salesRows.filter((r) => r.vch_type === SALES || r.vch_type === SALES_RETURN).reduce((s, r) => s + r.vat, 0))
    const inputVat = round(purchaseRows.reduce((s, r) => s + r.vat, 0))
    return NextResponse.json({
      ...base,
      shape: "statement",
      rows,
      totals: {
        total: sum(rows as any, "total"), net: sum(rows as any, "net"), vat: sum(rows as any, "vat"), exempt: sum(rows as any, "exempt"),
        sales_net: round(salesRows.reduce((s, r) => s + r.net, 0)), sales_vat: outputVat,
        purchases_net: round(purchaseRows.reduce((s, r) => s + r.net, 0)), purchases_vat: inputVat,
        balance: round(outputVat - inputVat),
      },
    })
  } catch (error) {
    if ((error as { code?: string })?.code === "22012") {
      return NextResponse.json({ error: "لا يوجد سعر صرف صالح لعملة التقرير بتاريخ أحد السندات. يرجى تعريف سعر الصرف وإعادة عرض التقرير." }, { status: 400 })
    }
    console.error("Tax report error:", error)
    return NextResponse.json({ error: "تعذر تحميل التقرير الضريبي" }, { status: 500 })
  }
}
