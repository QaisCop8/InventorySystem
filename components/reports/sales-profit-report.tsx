"use client"

import { tr } from "@/lib/i18n"
import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, Printer, Search, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import Dropdown from "@/components/common/FocusDropdown"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { ReportMultiChoice, type ReportOption } from "./account-statement-report"
import { ValuationMethod, valuationMethods } from "./valuation-method"
import { VoucherLink } from "./voucher-link"
import { InvoicePickerDialog } from "./invoice-picker-dialog"

type Mode = "items" | "period" | "itemCost" | "invoice" | "pricing"
type GroupBy = "item" | "line" | "invoice" | "customer" | "salesman" | "group" | "branch" | "warehouse" | "day" | "month"

const MODES: Record<Mode, { title: string; description: string; groupBy: GroupBy }> = {
  items: { title: tr("تقرير نسبة أرباح المخزون"), description: tr("ربحية كل صنف خلال فترة مع تسعير الإخراجات تلقائياً حسب طريقة التسعير"), groupBy: "item" },
  period: { title: tr("تقرير أرباح فترة معينة"), description: tr("أرباح المبيعات والمرتجعات خلال فترة بتفصيل أو تجميع حسب الحاجة"), groupBy: "line" },
  itemCost: { title: tr("تكلفة مبيعات صنف"), description: tr("كلفة وربح كل حركة بيع أو مرتجع لصنف واحد خلال فترة"), groupBy: "line" },
  invoice: { title: tr("أرباح فاتورة معينة"), description: tr("تكلفة وربح كل صنف في فاتورة مبيعات أو مرتجع محدد"), groupBy: "line" },
  pricing: { title: tr("تسعير الإخراجات"), description: tr("احتساب كلفة كل سطر مبيعات ومرتجع حسب طريقة التسعير وحفظها على السندات"), groupBy: "item" },
}
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "item", label: tr("الصنف") }, { value: "line", label: tr("تفصيل الأسطر") }, { value: "invoice", label: tr("الفاتورة") },
  { value: "customer", label: tr("العميل") }, { value: "salesman", label: tr("المندوب") }, { value: "group", label: tr("مجموعة الصنف") },
  { value: "branch", label: tr("الفرع") }, { value: "warehouse", label: tr("المستودع") }, { value: "day", label: tr("اليوم") }, { value: "month", label: tr("الشهر") },
]
const SALES_INVOICE = 12, SALES_RETURN = 16
const fmt = (value: unknown, digits = 2) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })
const pct = (value: unknown) => `${fmt(value, 1)}%`
const today = () => new Date().toISOString().slice(0, 10)

type Meta = Record<"products" | "groups" | "warehouses" | "branches" | "customers" | "salesmen", ReportOption[]>
type Column = { key: string; label: string; render: (row: any) => React.ReactNode; numeric?: boolean; total?: (totals: any) => React.ReactNode }

export function SalesProfitReport({ mode = "items" }: { mode?: Mode }) {
  const config = MODES[mode]
  const [meta, setMeta] = useState<Meta>({ products: [], groups: [], warehouses: [], branches: [], customers: [], salesmen: [] })
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [fromDate, setFromDate] = useState(`${today().slice(0, 7)}-01`)
  const [toDate, setToDate] = useState(today())
  const [pricingWay, setPricingWay] = useState("average")
  const [groupBy, setGroupBy] = useState<GroupBy>(config.groupBy)
  const [includeSales, setIncludeSales] = useState(true)
  const [includeReturns, setIncludeReturns] = useState(true)
  const [voucherCode, setVoucherCode] = useState("")
  const [selected, setSelected] = useState<Record<keyof Meta, number[]>>({ products: [], groups: [], warehouses: [], branches: [], customers: [], salesmen: [] })
  const [data, setData] = useState<{ rows: any[]; totals: any; group_by: GroupBy } | null>(null)
  const [loading, setLoading] = useState(false)
  const [pricing, setPricing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [search, setSearch] = useState("")
  const [soldItems, setSoldItems] = useState<ReportOption[]>([])
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false)
  const loadAfterPickRef = useRef(false)
  const singleItem = mode === "itemCost"

  // تكلفة مبيعات صنف: قائمة الأصناف التي تحركت مبيعاتها خلال الفترة (للاختيار والتنقل بين الأصناف).
  useEffect(() => {
    if (!singleItem || fromDate > toDate) return
    const controller = new AbortController()
    fetch(`/api/reports/sales-profit?sold_items=1&from_date=${fromDate}&to_date=${toDate}`, { signal: controller.signal })
      .then((response) => response.json()).then((body) => { if (Array.isArray(body)) setSoldItems(body) }).catch(() => undefined)
    return () => controller.abort()
  }, [singleItem, fromDate, toDate])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/reports/sales-profit?meta=1", { signal: controller.signal }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل الفلاتر"))
      setMeta(body)
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message) }).finally(() => { if (!controller.signal.aborted) setLoadingMeta(false) })
    return () => controller.abort()
  }, [])

  const query = () => {
    const types = [includeSales && SALES_INVOICE, includeReturns && SALES_RETURN].filter(Boolean).join(",")
    return new URLSearchParams({
      from_date: mode === "invoice" ? "1900-01-01" : fromDate, to_date: mode === "invoice" ? today() : toDate,
      pricing_way: pricingWay, group_by: groupBy, types: mode === "invoice" ? "12,16" : types,
      product_ids: selected.products.join(","), group_ids: selected.groups.join(","), warehouse_ids: selected.warehouses.join(","),
      branch_ids: selected.branches.join(","), customer_ids: selected.customers.join(","), salesman_ids: selected.salesmen.join(","),
      vch_code: mode === "invoice" ? voucherCode.trim() : "",
    }).toString()
  }

  const validate = () => {
    if (mode === "invoice" && !voucherCode.trim()) return tr("يجب إدخال رقم الفاتورة لجلب التقرير")
    if (singleItem && selected.products.length !== 1) return tr("يجب اختيار صنف لجلب التقرير")
    if (mode !== "invoice" && fromDate > toDate) return tr("تاريخ البداية بعد تاريخ النهاية")
    if (mode !== "invoice" && !includeSales && !includeReturns) return tr("اختر المبيعات أو المرتجعات على الأقل")
    return ""
  }

  const loadReport = async (keepNotice = false) => {
    const invalid = validate()
    if (invalid) { setError(invalid); return }
    setLoading(true); setError(""); if (!keepNotice) setNotice("")
    try {
      const response = await fetch(`/api/reports/sales-profit?${query()}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل تقرير الأرباح"))
      setData(body)
    } catch (cause) {
      setData(null); setError(cause instanceof Error ? cause.message : tr("تعذر تحميل تقرير الأرباح"))
    } finally { setLoading(false) }
  }

  // تسعير الإخراجات من داخل التقرير: يحفظ الكلفة المحسوبة على أسطر السندات ثم يعيد عرض التقرير.
  const savePricing = async () => {
    const invalid = validate()
    if (invalid) { setError(invalid); return }
    setPricing(true); setError(""); setNotice("")
    try {
      const response = await fetch(`/api/reports/sales-profit?${query()}`, { method: "POST" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تنفيذ تسعير الإخراجات"))
      const message = tr("تم تسعير {0} سطر بطريقة \"{1}\"{2}", fmt(body.updated, 0), valuationMethods.find((method) => method.value === pricingWay)?.label, body.unpriced ? ` — ${fmt(body.unpriced, 0)} سطر بلا كلفة معروفة` : "")
      await loadReport(true)
      setNotice(message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تنفيذ تسعير الإخراجات"))
    } finally { setPricing(false) }
  }

  const activeGroup = data?.group_by || groupBy
  const columns = useMemo<Column[]>(() => {
    const voucher = (row: any) => row.voucher_id ? <VoucherLink id={Number(row.voucher_id)} type={Number(row.vch_type)} code={row.vch_code || row.label} /> : row.vch_code || row.label
    const typeBadge = (row: any) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${Number(row.vch_type) === SALES_RETURN ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{Number(row.vch_type) === SALES_RETURN ? tr("مرتجع") : tr("مبيعات")}</span>
    const leading: Column[] = activeGroup === "item"
      ? [{ key: "code", label: tr("رقم الصنف"), render: (row) => <span className="font-mono font-bold text-teal-700">{row.code}</span> }, { key: "label", label: tr("الصنف"), render: (row) => <span className="font-semibold">{row.label}</span> }, { key: "group_name", label: tr("المجموعة"), render: (row) => row.group_name }]
      : activeGroup === "line"
        ? [{ key: "vch_code", label: tr("رقم السند"), render: voucher }, { key: "vch_date", label: tr("التاريخ"), render: (row) => row.vch_date }, { key: "type", label: tr("الحركة"), render: typeBadge }, { key: "label", label: tr("الصنف"), render: (row) => <span className="font-semibold">{row.label}</span> }, { key: "unit", label: tr("الوحدة"), render: (row) => row.unit_name || "-" }, { key: "customer", label: tr("العميل"), render: (row) => row.customer_name }]
        : activeGroup === "invoice"
          ? [{ key: "vch_code", label: tr("رقم السند"), render: voucher }, { key: "vch_date", label: tr("التاريخ"), render: (row) => row.vch_date }, { key: "type", label: tr("الحركة"), render: typeBadge }, { key: "customer", label: tr("العميل"), render: (row) => row.customer_name }, { key: "salesman", label: tr("المندوب"), render: (row) => row.salesman_name }]
          : [{ key: "label", label: GROUP_OPTIONS.find((option) => option.value === activeGroup)?.label || tr("البند"), render: (row) => <span className="font-semibold">{row.label}</span> }]
    const quantities: Column[] = activeGroup === "item" || activeGroup === "line"
      ? [{ key: "quantity", label: tr("الكمية"), numeric: true, render: (row) => fmt(row.quantity, 3) }, { key: "bonus", label: tr("البونص"), numeric: true, render: (row) => fmt(row.bonus, 3) }]
      : [{ key: "lines", label: tr("عدد الأسطر"), numeric: true, render: (row) => fmt(row.lines, 0) }]
    const rates: Column[] = activeGroup === "item" || activeGroup === "line"
      ? [{ key: "sale_rate", label: tr("معدل البيع"), numeric: true, render: (row) => fmt(row.sale_rate) }, { key: "cost_rate", label: tr("معدل التكلفة"), numeric: true, render: (row) => row.unpriced_lines ? <span className="text-amber-700" title={tr("لا توجد كلفة معروفة لهذا الصنف")}>{fmt(row.cost_rate)} ⚠</span> : fmt(row.cost_rate) }]
      : []
    return [
      ...leading, ...quantities, ...rates,
      { key: "sale_total", label: tr("صافي المبيعات"), numeric: true, render: (row) => fmt(row.sale_total), total: (totals) => fmt(totals.sale_total) },
      { key: "cost_total", label: tr("التكلفة"), numeric: true, render: (row) => fmt(row.cost_total), total: (totals) => fmt(totals.cost_total) },
      { key: "bonus_cost", label: tr("تكلفة البونص"), numeric: true, render: (row) => fmt(row.bonus_cost), total: (totals) => fmt(totals.bonus_cost) },
      { key: "profit", label: tr("الربح"), numeric: true, render: (row) => <span className={`font-black ${row.profit < 0 ? "text-rose-600" : "text-teal-700"}`}>{fmt(row.profit)}</span>, total: (totals) => fmt(totals.profit) },
      { key: "profit_margin", label: tr("هامش الربح %"), numeric: true, render: (row) => pct(row.profit_margin), total: (totals) => pct(totals.profit_margin) },
      { key: "markup", label: tr("نسبة الربح على التكلفة %"), numeric: true, render: (row) => pct(row.markup) },
      ...(activeGroup === "line" ? [] : [{ key: "sale_share", label: tr("نسبة البيع %"), numeric: true, render: (row: any) => pct(row.sale_share) }, { key: "profit_share", label: tr("نسبة الربح %"), numeric: true, render: (row: any) => pct(row.profit_share) }]),
    ]
  }, [activeGroup])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.rows || []).filter((row) => !term || [row.label, row.code, row.vch_code, row.customer_name].some((value) => String(value || "").toLowerCase().includes(term)))
  }, [data, search])
  const totals = data?.totals

  const exportCsv = () => {
    const csv = [columns.map((column) => column.label).join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column.key] ?? (column.key === "label" ? row.label : "") ?? "")).join(","))].join("\n")
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })); link.download = `${config.title}-${toDate}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  // اختيار فاتورة من نافذة البحث يعرض أرباحها مباشرة (بعد تحديث رقم السند في الحالة).
  useEffect(() => { if (loadAfterPickRef.current) { loadAfterPickRef.current = false; void loadReport() } }, [voucherCode])
  const choose = (key: keyof Meta) => (ids: number[]) => setSelected((current) => ({ ...current, [key]: ids }))
  // تكلفة مبيعات صنف: صنف واحد فقط، مع التنقل للصنف السابق/التالي من أصناف الفترة.
  const itemOptions = soldItems.length ? soldItems : meta.products
  const currentItemIndex = itemOptions.findIndex((option) => Number(option.id) === selected.products[0])
  const chooseItem = (ids: number[]) => setSelected((current) => ({ ...current, products: ids.slice(-1) }))
  const stepItem = (offset: number) => { const next = itemOptions[currentItemIndex + offset]; if (next) chooseItem([Number(next.id)]) }
  useEffect(() => { if (singleItem && selected.products.length === 1 && data) void loadReport() }, [selected.products])
  const showDetails = groupBy === "line"

  return <ReportPage loading={loading || loadingMeta}>
    <ReportHeader icon={mode === "pricing" ? Calculator : TrendingUp} category={tr("تقارير ارباح الاصناف")} title={config.title} description={config.description}
      actions={<>
        {mode !== "pricing" && <Button variant="secondary" onClick={() => void savePricing()} disabled={pricing || loading} title={tr("حفظ الكلفة المحسوبة على أسطر السندات (تستخدمها عمولات المندوبين)")}>{pricing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Calculator className="me-2 h-4 w-4" />}{tr("تنفيذ تسعير الإخراجات")}</Button>}
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="me-2 h-4 w-4" />{tr("تصدير")}</Button>
        <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!rows.length}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>
      </>} />
    <ReportFilters>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mode === "invoice"
          ? <div className="sm:col-span-2"><Label>{tr("رقم الفاتورة / المرتجع")}</Label><div className="flex gap-2"><Input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} onKeyDown={(event) => { if (event.key === "F10" || (event.key === "Enter" && !voucherCode.trim())) { event.preventDefault(); setInvoicePickerOpen(true) } else if (event.key === "Enter") void loadReport() }} placeholder={tr("رقم السند — Enter أو F10 للبحث")} className="rounded-xl" dir="ltr" /><Button type="button" variant="outline" className="shrink-0 rounded-xl" onClick={() => setInvoicePickerOpen(true)} title={tr("بحث الفواتير (F10)")}><Search className="me-1 h-4 w-4" />{tr("بحث")}</Button></div></div>
          : <>
            <div><Label>{tr("من تاريخ")}</Label><Input type="date" lang="en" dir="ltr" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-xl" /></div>
            <div><Label>{tr("إلى تاريخ")}</Label><Input type="date" lang="en" dir="ltr" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl" /></div>
          </>}
        <div><Label>{tr("طريقة تسعير الإخراجات")}</Label><ValuationMethod value={pricingWay} onChange={setPricingWay} /></div>
        {mode === "pricing"
          ? <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={showDetails} onCheckedChange={(value) => setGroupBy(value === true ? "line" : "item")} />{tr("إظهار تفاصيل التكاليف")}</label>
          : !singleItem && <div><Label>{tr("تجميع حسب")}</Label><Dropdown value={groupBy} options={GROUP_OPTIONS} optionLabel="label" optionValue="value" onChange={(event: any) => setGroupBy(event.value)} className="w-full rounded-xl" aria-label={tr("تجميع حسب")} /></div>}
        {singleItem && <div className="sm:col-span-2"><ReportMultiChoice label={soldItems.length ? tr("الصنف (الأصناف المباعة خلال الفترة)") : tr("الصنف")} options={itemOptions} selected={selected.products} onChange={chooseItem} placeholder={tr("اختر الصنف")} /></div>}
        {mode !== "invoice" && <>
          {!singleItem && <ReportMultiChoice label={tr("الصنف")} options={meta.products} selected={selected.products} onChange={choose("products")} placeholder={tr("جميع الأصناف")} />}
          {!singleItem && <ReportMultiChoice label={tr("مجموعة الصنف")} options={meta.groups} selected={selected.groups} onChange={choose("groups")} placeholder={tr("جميع المجموعات")} />}
          {mode !== "pricing" && <><ReportMultiChoice label={tr("العميل")} options={meta.customers} selected={selected.customers} onChange={choose("customers")} placeholder={tr("جميع العملاء")} />
          <ReportMultiChoice label={tr("المندوب")} options={meta.salesmen} selected={selected.salesmen} onChange={choose("salesmen")} placeholder={tr("جميع المندوبين")} /></>}
          <ReportMultiChoice label={tr("المستودع")} options={meta.warehouses} selected={selected.warehouses} onChange={choose("warehouses")} placeholder={tr("جميع المستودعات")} />
          <ReportMultiChoice label={tr("الفرع")} options={meta.branches} selected={selected.branches} onChange={choose("branches")} placeholder={tr("جميع الفروع")} />
          <div className="flex items-end gap-5 pb-2 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={includeSales} onCheckedChange={(value) => setIncludeSales(value === true)} />{tr("فواتير المبيعات")}</label>
            <label className="flex items-center gap-2"><Checkbox checked={includeReturns} onCheckedChange={(value) => setIncludeReturns(value === true)} />{tr("مرتجعات المبيعات")}</label>
          </div>
        </>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">{mode === "pricing" ? tr("تُحسب كلفة كل سطر لحظة خروج البضاعة حسب حركة المخزون، وتُحفظ على أسطر السندات ضمن الفلاتر المختارة.") : tr("يتم تسعير الإخراجات تلقائياً عند عرض التقرير (حسب حركة المخزون حتى تاريخ النهاية) — لا حاجة لتنفيذ آلية التسعير مسبقاً.")}</p>
        <div className="flex gap-2">
          {mode === "pricing" && <Button variant="outline" onClick={() => void loadReport()} disabled={loading || pricing || loadingMeta} className="rounded-xl"><Search className="me-2 h-4 w-4" />{tr("معاينة بدون حفظ")}</Button>}
          {mode === "pricing"
            ? <Button data-report-apply onClick={() => void savePricing()} disabled={loading || pricing || loadingMeta} className="min-w-44 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg">{pricing ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Calculator className="me-2 h-4 w-4" />}{tr("تنفيذ تسعير الإخراجات")}</Button>
            : <Button data-report-apply onClick={() => void loadReport()} disabled={loading || loadingMeta} className="min-w-36 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg">{loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض التقرير")}</Button>}
        </div>
      </div>
    </ReportFilters>
    {singleItem && currentItemIndex >= 0 && <div className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-2 text-sm print:hidden dark:bg-slate-950">
      <Button variant="outline" size="sm" onClick={() => stepItem(-1)} disabled={currentItemIndex <= 0 || loading}><ChevronRight className="me-1 h-4 w-4" />{tr("الصنف السابق")}</Button>
      <span className="font-semibold"><span className="font-mono text-teal-700">{itemOptions[currentItemIndex]?.code}</span> — {itemOptions[currentItemIndex]?.name} <span className="text-xs text-muted-foreground">({currentItemIndex + 1}{tr(" من ")}{itemOptions.length})</span></span>
      <Button variant="outline" size="sm" onClick={() => stepItem(1)} disabled={currentItemIndex >= itemOptions.length - 1 || loading}>{tr("الصنف التالي")}<ChevronLeft className="ms-1 h-4 w-4" /></Button>
    </div>}
    {mode === "invoice" && <InvoicePickerDialog open={invoicePickerOpen} onOpenChange={setInvoicePickerOpen} initialSearch={voucherCode} onSelect={(row) => { loadAfterPickRef.current = true; setVoucherCode(row.vch_code) }} />}
    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    {notice && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
    {totals?.unpriced_lines > 0 && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 print:hidden"><AlertTriangle className="h-4 w-4 shrink-0" />{fmt(totals.unpriced_lines, 0)}{tr(" من ")}{fmt(totals.lines, 0)}{tr(" سطر لا توجد لأصنافها كلفة معروفة (لا مشتريات ولا سعر أول المدة) — احتُسبت تكلفتها صفراً.")}</p>}
    <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
      <ReportSummaryCard label={tr("صافي المبيعات")}>{fmt(totals?.sale_total)}</ReportSummaryCard>
      <ReportSummaryCard label={tr("التكلفة (مع البونص)")}>{fmt((totals?.cost_total || 0) + (totals?.bonus_cost || 0))}</ReportSummaryCard>
      <ReportSummaryCard label={tr("صافي الربح")} highlight>{fmt(totals?.profit)}</ReportSummaryCard>
      <ReportSummaryCard label={tr("هامش الربح")}>{pct(totals?.profit_margin)}</ReportSummaryCard>
    </section>
    <section className="report-results">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h2 className="font-bold">{tr("نتائج ")}{config.title}</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("en-US")}{tr(" سجل — طريقة التسعير: ")}{valuationMethods.find((method) => method.value === pricingWay)?.label}</p></div>
        <div className="relative w-full sm:w-80"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("ابحث داخل النتائج...")} className="rounded-xl bg-muted/40 ps-9" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-gradient-to-l from-indigo-700 via-blue-700 to-violet-700 text-white"><tr><th className="px-3 py-3 text-start text-xs font-semibold">#</th>{columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3 text-start text-xs font-semibold">{column.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => <tr key={row.key} className={`border-b hover:bg-indigo-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-3 py-2.5 text-muted-foreground">{index + 1}</td>{columns.map((column) => <td key={column.key} className="whitespace-nowrap px-3 py-2.5" dir={column.numeric ? "ltr" : undefined}>{column.render(row)}</td>)}</tr>)}
            {!loading && !rows.length && <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center"><TrendingUp className="mx-auto mb-3 h-11 w-11 text-slate-300" /><p className="font-semibold">{tr("لا توجد نتائج لعرضها")}</p><p className="mt-1 text-xs text-muted-foreground">{mode === "invoice" ? tr("أدخل رقم الفاتورة ثم اضغط عرض التقرير") : tr("اختر الفلاتر ثم اضغط عرض التقرير")}</p></td></tr>}
          </tbody>
          {rows.length > 0 && totals && <tfoot className="sticky bottom-0 border-t-2 bg-slate-100 font-bold dark:bg-slate-900"><tr><td className="px-3 py-3" />{columns.map((column, index) => <td key={column.key} className="whitespace-nowrap px-3 py-3" dir={column.numeric ? "ltr" : undefined}>{column.total ? column.total(totals) : index === 0 ? tr("الإجمالي") : ""}</td>)}</tr></tfoot>}
        </table>
      </div>
    </section>
  </ReportPage>
}

export const ItemsProfitReport = () => <SalesProfitReport mode="items" />
export const PeriodProfitReport = () => <SalesProfitReport mode="period" />
export const InvoiceProfitReport = () => <SalesProfitReport mode="invoice" />
export const ItemSalesCostReport = () => <SalesProfitReport mode="itemCost" />
export const PricingInventoryPage = () => <SalesProfitReport mode="pricing" />
