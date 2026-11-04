"use client"
import { tr } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"

import { useEffect, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { voucherHref } from "@/lib/voucher-links"
import { TAX_REPORTS, VAT_CLASSIFICATIONS, type TaxReportKind } from "@/lib/tax-reports"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Download, FileBarChart, Loader2, Printer, Receipt, RefreshCcw, Search } from "lucide-react"

// حالات السندات في فلتر "حالة السندات" (الملغاة مستثناة دائماً)
const VOUCHER_STATUS_OPTIONS: ReportOption[] = [{ id: 2, name: "معتمد" }, { id: 1, name: "غير معتمد" }]

// التقارير الضريبية الستة بواجهة واحدة — الحساب في app/api/reports/tax/route.ts.

type Meta = { currencies: ReportOption[]; branches: ReportOption[] }
type CalcLine = { key: string; label: string; value: number }
type Result =
  | { shape: "calculation"; lines: CalcLine[]; net: number; net_label: string; counts: { sales: number; purchases: number } }
  | { shape: "statement"; rows: any[]; totals: Record<string, number> }
  | { shape: "maqasa"; rows: any[]; totals: { vat: number; net: number; total: number }; company: { name: string; tax_number: string; address: string; business: string } }

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 7)}-01`
const money = amountNumberFormat("en-US")
const fmt = (value: number) => money.format(Number(value || 0))
const th = "whitespace-nowrap px-3 py-3 text-right text-xs"
const num = "px-3 py-2.5 tabular-nums"
const classificationOptions: ReportOption[] = Object.entries(VAT_CLASSIFICATIONS).map(([id, name]) => ({ id: Number(id), name }))

export function TaxReport({ kind }: { kind: TaxReportKind }) {
  const definition = TAX_REPORTS[kind]
  const isMaqasa = kind === "maqasa-sales" || kind === "maqasa-purchases"
  const isPurchaseSide = kind === "purchases" || kind === "maqasa-purchases"
  const [meta, setMeta] = useState<Meta>({ currencies: [], branches: [] })
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ fromDate: monthStart(), toDate: today(), currencyId: 0, branchIds: [] as number[], statuses: [] as number[], classifications: [] as number[], showNotes: false })
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/tax?kind=${kind}&meta=1`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || tr("تعذر تحميل خيارات التقرير"))
        setMeta(data.meta || { currencies: [], branches: [] })
        setFilters((current) => ({ ...current, currencyId: Number(data.meta?.currencies?.[0]?.id || 0) }))
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : tr("تعذر تحميل خيارات التقرير")))
      .finally(() => setLoading(false))
  }, [kind])

  const run = async () => {
    setRunning(true)
    setError("")
    try {
      const params = new URLSearchParams({ kind, from_date: filters.fromDate, to_date: filters.toDate, report_currency_id: String(filters.currencyId), statuses: filters.statuses.join(",") })
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.classifications.length) params.set("classifications", filters.classifications.join(","))
      if (filters.showNotes) params.set("show_notes", "1")
      const response = await fetch(`/api/reports/tax?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setResult(data)
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
    } finally {
      setRunning(false)
    }
  }

  const reset = () => { set({ fromDate: monthStart(), toDate: today(), branchIds: [], statuses: [], classifications: [], showNotes: false }); setResult(null); setSearch(""); setError("") }
  const term = search.trim().toLowerCase()
  const visibleRows = useMemo(() => {
    if (!result || result.shape === "calculation") return []
    return result.rows.filter((row: any) => !term || [row.vch_code, row.customer_name, row.party_name, row.vat_reg, row.file_number, row.manual_voucher, row.note].some((value) => String(value ?? "").toLowerCase().includes(term)))
  }, [result, term])
  const openVoucher = (row: any) => { if (row.id) window.open(voucherHref(Number(row.id), Number(row.vch_type), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer") }
  const total = (key: string) => visibleRows.reduce((s: number, row: any) => s + Number(row[key] || 0), 0)

  // ── أعمدة كل تقرير ──
  type Column = { key: string; label: string; money?: boolean; render?: (row: any) => React.ReactNode }
  const columns: Column[] = kind === "sales"
    ? [
        { key: "vch_date", label: tr("تاريخ السند") }, { key: "vch_code", label: tr("رقم السند") }, { key: "voucher_type_name", label: tr("النوع") },
        { key: "customer_name", label: tr("اسم العميل") }, { key: "vat_reg", label: tr("رقم مشتغل مرخص") }, { key: "manual_voucher", label: tr("السند اليدوي") },
        { key: "classification_name", label: tr("التصنيف") }, { key: "vat_percent", label: tr("النسبة"), render: (row) => `${row.vat_percent || 0}%` },
        { key: "net", label: tr("مبيعات"), money: true }, { key: "vat", label: tr("ض.ق.م"), money: true }, { key: "exempt", label: tr("معفاة"), money: true }, { key: "total", label: tr("قيمة الفاتورة"), money: true },
        { key: "note", label: tr("ملاحظات") },
      ]
    : kind === "purchases"
      ? [
          { key: "vch_date", label: tr("تاريخ السند") }, { key: "vch_code", label: tr("رقم السند") }, { key: "voucher_type_name", label: tr("النوع") },
          { key: "customer_name", label: tr("اسم المورد") }, { key: "vat_reg", label: tr("رقم مشتغل مرخص") }, { key: "manual_voucher", label: tr("السند اليدوي") },
          { key: "trade_net", label: tr("مشتريات"), money: true }, { key: "trade_vat", label: tr("ض.ق.م"), money: true },
          { key: "services_net", label: tr("م.خدمات"), money: true }, { key: "services_vat", label: tr("ض.ق.م"), money: true },
          { key: "assets_net", label: tr("م.موجودات"), money: true }, { key: "assets_vat", label: tr("ض.ق.م"), money: true },
          { key: "exempt", label: tr("معفاة"), money: true }, { key: "total", label: tr("قيمة الفاتورة"), money: true },
        ]
      : kind === "sales-purchases"
        ? [
            { key: "vch_date", label: tr("تاريخ السند") }, { key: "vch_code", label: tr("رقم السند") }, { key: "voucher_type_name", label: tr("النوع") },
            { key: "customer_name", label: tr("اسم العميل / المورد") }, { key: "vat_percent", label: tr("النسبة"), render: (row) => `${row.vat_percent || 0}%` },
            { key: "sales_net", label: tr("مبيعات"), money: true, render: (row) => (row.direction === "sales" ? fmt(row.net) : "") },
            { key: "sales_vat", label: tr("ض.ق.م"), money: true, render: (row) => (row.direction === "sales" ? fmt(row.vat) : "") },
            { key: "purchases_net", label: tr("مشتريات"), money: true, render: (row) => (row.direction === "purchase" ? fmt(row.net) : "") },
            { key: "purchases_vat", label: tr("ض.ق.م"), money: true, render: (row) => (row.direction === "purchase" ? fmt(row.vat) : "") },
            { key: "note", label: tr("ملاحظة السند") },
          ]
        : [
            { key: "code", label: tr("كود"), render: (row) => `${row.code} - ${row.code_name}` },
            { key: "party_name", label: isPurchaseSide ? tr("اسم المورد / معطي الخدمة") : tr("المشتري / متلقي الخدمة") },
            { key: "file_number", label: isPurchaseSide ? tr("رقم ملف المورد") : tr("رقم ملف المشتري") },
            { key: "voucher_number", label: tr("رقم السند") }, { key: "date", label: tr("التاريخ") }, { key: "note", label: tr("تفاصيل الفاتورة") },
            { key: "vat", label: tr("مبلغ ض.ق.م بالفاتورة"), render: (row) => Number(row.vat || 0).toLocaleString("en-US") },
          ]

  const footerValue = (column: Column) => {
    if (kind === "sales-purchases") {
      if (column.key === "sales_net") return fmt(visibleRows.filter((r: any) => r.direction === "sales").reduce((s: number, r: any) => s + r.net, 0))
      if (column.key === "sales_vat") return fmt(visibleRows.filter((r: any) => r.direction === "sales").reduce((s: number, r: any) => s + r.vat, 0))
      if (column.key === "purchases_net") return fmt(visibleRows.filter((r: any) => r.direction === "purchase").reduce((s: number, r: any) => s + r.net, 0))
      if (column.key === "purchases_vat") return fmt(visibleRows.filter((r: any) => r.direction === "purchase").reduce((s: number, r: any) => s + r.vat, 0))
      return ""
    }
    if (isMaqasa && column.key === "vat") return total("vat").toLocaleString("en-US")
    return column.money ? fmt(total(column.key)) : ""
  }

  const exportCsv = () => {
    if (!result) return
    const table: unknown[][] = result.shape === "calculation"
      ? [["البيان", "القيمة"], ...result.lines.map((line) => [line.label, line.value]), [result.net_label, Math.abs(result.net)]]
      : [columns.map((column) => column.label), ...visibleRows.map((row: any) => columns.map((column) => {
          const value = column.render ? column.render(row) : row[column.key]
          return typeof value === "string" || typeof value === "number" ? value : row[column.key]
        }))]
    const csv = table.map((values) => values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    link.download = `${definition.title}-${filters.fromDate}-${filters.toDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const hasData = result ? (result.shape === "calculation" ? true : visibleRows.length > 0) : false

  const renderCalculation = (data: Extract<Result, { shape: "calculation" }>) => (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white"><tr><th className={th}>#</th><th className={th}>{tr("البيان")}</th><th className={th}>{tr("القيمة")}</th></tr></thead>
          <tbody>
            {data.lines.map((line, index) => (
              <tr key={line.key} className={`border-b ${index % 2 ? "bg-slate-50/60" : ""}`}>
                <td className="px-3 py-3 text-xs text-slate-400">{index + 1}</td>
                <td className="px-3 py-3 font-semibold">{line.label}</td>
                <td className={`${num} font-black`} dir="ltr">{fmt(line.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`flex items-center justify-between rounded-2xl px-5 py-4 ${data.net >= 0 ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"}`}>
        <div>
          <p className="text-lg font-black">{data.net_label}</p>
          <p className="text-xs opacity-80">{tr("الضريبة على الصفقات − ضريبة المدخلات (أجهزة وأثاث + مشتريات أخرى)")}</p>
        </div>
        <p className="text-2xl font-black tabular-nums" dir="ltr">{fmt(Math.abs(data.net))}</p>
      </div>
      <p className="text-center text-xs text-slate-500">{data.counts.sales}{tr(" سند مبيعات · ")}{data.counts.purchases}{tr(" سند مشتريات · من ")}{filters.fromDate}{tr(" إلى ")}{filters.toDate}</p>
    </div>
  )

  const renderTable = () => (
    <>
      {isMaqasa && result?.shape === "maqasa" && (
        <div className="grid gap-3 border-b bg-slate-50/70 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-black text-teal-800">{isPurchaseSide ? tr("مشتريات مقاصة · نموذج ض.ق.م رقم 878") : tr("مبيعات مقاصة · نموذج ض.ق.م رقم 879")}</p>
            <p className="mt-1 text-xs text-slate-500">{tr("فترة الكشف: ")}{filters.fromDate} — {filters.toDate}</p>
          </div>
          <div className="text-xs leading-6">
            <p className="font-bold">{isPurchaseSide ? tr("أ. تفاصيل المشتغل (المشتري)") : tr("أ. تفاصيل المشتغل (البائع)")}</p>
            <p>{tr("الإسم: ")}{result.company.name || "—"}{tr(" · مشتغل مرخص رقم: ")}{result.company.tax_number || "—"}</p>
            {result.company.address && <p>{tr("العنوان: ")}{result.company.address}</p>}
          </div>
        </div>
      )}
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
          <tr>{columns.map((column, index) => <th key={`${column.key}-${index}`} className={th}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {visibleRows.map((row: any) => (
            <tr key={`${row.id}-${row.vch_type}`} className={`cursor-pointer border-b hover:bg-teal-50/60 ${Number(row.total) < 0 || Number(row.vat) < 0 ? "text-rose-700" : ""}`} onDoubleClick={() => openVoucher(row)} title={tr("انقر نقراً مزدوجاً لفتح السند")}>
              {columns.map((column, index) => {
                const value = column.render ? column.render(row) : column.money ? fmt(row[column.key]) : row[column.key]
                const isMoney = column.money || column.key === "vat"
                return <td key={`${column.key}-${index}`} className={isMoney ? num : `px-3 py-2.5 ${column.key === "note" ? "max-w-[220px] truncate text-xs text-slate-500" : ""} ${column.key === "vch_code" || column.key === "voucher_number" ? "font-mono font-bold text-teal-700" : ""}`} dir={isMoney ? "ltr" : undefined}>{value === "" || value == null ? "—" : value}</td>
              })}
            </tr>
          ))}
        </tbody>
        {visibleRows.length > 0 && (
          <tfoot className="sticky bottom-0 bg-slate-100 font-black">
            <tr>{columns.map((column, index) => <td key={`${column.key}-${index}`} className={num} dir="ltr">{index === 0 ? tr("الإجمالي") : footerValue(column)}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </>
  )

  const summary = (() => {
    if (!result || result.shape === "calculation") return null
    if (result.shape === "maqasa") return [["عدد الفواتير", visibleRows.length.toLocaleString("en-US")], ["الصافي", fmt(total("net"))], ["إجمالي ض.ق.م", total("vat").toLocaleString("en-US")]]
    if (kind === "sales-purchases") {
      const salesVat = visibleRows.filter((r: any) => r.direction === "sales").reduce((s: number, r: any) => s + r.vat, 0)
      const purchasesVat = visibleRows.filter((r: any) => r.direction === "purchase").reduce((s: number, r: any) => s + r.vat, 0)
      const balance = salesVat - purchasesVat
      return [["ضريبة المبيعات", fmt(salesVat)], ["ضريبة المشتريات", fmt(purchasesVat)], [balance >= 0 ? "الصافي للدفع" : "الصافي للإعادة", fmt(Math.abs(balance))]]
    }
    return [["عدد السندات", visibleRows.length.toLocaleString("en-US")], [isPurchaseSide ? "صافي المشتريات" : "صافي المبيعات", fmt(total("net"))], ["إجمالي ض.ق.م", fmt(total("vat"))]]
  })()

  return (
    <ReportPage loading={loading || running}>
      <ReportHeader
        icon={Receipt}
        category={tr("تقارير ضريبية")}
        title={<>{definition.title}</>}
        description={<>{tr("ضريبة القيمة المضافة على المبيعات والمشتريات للفترة المحددة")}</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!hasData}><Download className="me-2 h-4 w-4" />{tr("تصدير")}</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={filters.toDate} onChange={(event) => set({ toDate: event.target.value })} className="rounded-xl" /></div>
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => set({ currencyId })} />
          <ReportMultiChoice label={tr("الفروع")} options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => set({ branchIds })} placeholder={tr("جميع الفروع المتاحة")} />
          {/* بلا اختيار = كل السندات (المعتمدة وغير المعتمدة) */}
          <ReportMultiChoice label={tr("حالة السندات")} options={VOUCHER_STATUS_OPTIONS} selected={filters.statuses} onChange={(statuses) => set({ statuses })} placeholder={tr("جميع السندات")} />
          {(kind === "sales" || kind === "purchases" || kind === "sales-purchases") && (
            <ReportMultiChoice label={tr("التصنيف الضريبي")} options={classificationOptions} selected={filters.classifications} onChange={(classifications) => set({ classifications })} placeholder={tr("جميع التصنيفات")} />
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {kind === "sales" && <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={filters.showNotes} onCheckedChange={(value) => set({ showNotes: value === true })} />{tr("إظهار الإشعارات (الدائنة والمدينة)")}</label>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}><RefreshCcw className="me-2 h-4 w-4" />{tr("مسح الفلاتر")}</Button>
            <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
              {running ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض النتائج")}
            </Button>
          </div>
        </div>
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {summary && <section className="grid gap-3 sm:grid-cols-3">{summary.map(([label, value]) => <ReportSummaryCard key={label} label={label}>{value}</ReportSummaryCard>)}</section>}

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">{definition.title}</h2>
            <p className="text-xs text-muted-foreground">{tr("من ")}{filters.fromDate}{tr(" إلى ")}{filters.toDate}{result && result.shape !== "calculation" ? tr(" · {0} سند", visibleRows.length.toLocaleString("en-US")) : ""}</p>
          </div>
          {result && result.shape !== "calculation" && <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("بحث بالرقم أو الاسم أو رقم المشتغل...")} className="w-full rounded-xl sm:w-80" />}
        </div>
        <div className="report-table-scroll">
          {!result ? (
            <div className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{tr("اختر الفترة ثم اضغط عرض النتائج")}</div>
          ) : result.shape === "calculation" ? renderCalculation(result)
            : !visibleRows.length ? <div className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{tr("لا توجد سندات مطابقة")}</div>
            : renderTable()}
        </div>
      </section>
    </ReportPage>
  )
}

export const TaxCalculationReport = () => <TaxReport kind="calculation" />
export const TaxSalesStatementReport = () => <TaxReport kind="sales" />
export const TaxPurchasesStatementReport = () => <TaxReport kind="purchases" />
export const TaxSalesPurchasesReport = () => <TaxReport kind="sales-purchases" />
export const TaxMaqasaSalesReport = () => <TaxReport kind="maqasa-sales" />
export const TaxMaqasaPurchasesReport = () => <TaxReport kind="maqasa-purchases" />
