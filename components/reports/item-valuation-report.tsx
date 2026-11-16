"use client"
import { tr } from "@/lib/i18n"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { useInventoryFilters } from "./inventory-filters"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { useState } from "react"
import { Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { ValuationMethod, valuationMethods } from "./valuation-method"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

const numberFormat = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })

export function ItemValuationReport() {
  const { controls, filterQuery, loadingFilters, filterError } = useInventoryFilters("/api/reports/item-valuation")
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState("")
  // افتراضياً «آخر سعر شراء» مثل تقييم البضاعة بالشامل (2026-11-16)
  const [priceWay, setPriceWay] = useState("last")
  const [withZeros, setWithZeros] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [loadedWay, setLoadedWay] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const loadReport = async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch(`/api/reports/item-valuation?to_date=${toDate}&${filterQuery}&price_way=${priceWay}&with_zeros=${withZeros ? 1 : 0}&search=${encodeURIComponent(search.trim())}`)
      const data = await response.json().catch(() => ({ error: tr("تعذر قراءة استجابة الخادم ({0})", response.status) }))
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل تقييم البضاعة"))
      setRows(data.rows || []); setLoadedWay(priceWay)
    } catch (cause) {
      setRows([]); setError(cause instanceof Error ? cause.message : tr("تعذر تحميل تقييم البضاعة"))
    } finally { setLoading(false) }
  }

  const exportCsv = () => {
    const columns = ["product_code", "product_name", "main_unit", "category", "balance", "valuation_price", "valuation_amount"]
    const csv = [columns.join(","), ...rows.map(row => columns.map(column => JSON.stringify(row[column] ?? "")).join(","))].join("\n")
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); link.download = `تقييم-البضاعة-${toDate}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.valuation_amount || 0), 0)

  return <ReportPage loading={loading || loadingFilters}>

      <ReportHeader icon={FileBarChart} category={tr("تقارير الأصناف")} title={<>{tr("تقييم المخزون بتاريخ معين")}</>} description={<>{tr("تقييم كمية المخزون وقيمته حسب تاريخ القطع")}</>} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="me-2 h-4 w-4" />{tr("تصدير")}</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={event => void printReportFrom(event.currentTarget)} disabled={!rows.length}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button></>} />
      <ReportFilters><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{controls}<div><Label>{tr("إلى تاريخ")}</Label><Input type="date" lang="en" dir="ltr" value={toDate} onChange={event => setToDate(event.target.value)} className="rounded-xl" /></div><div><Label>{tr("رقم/اسم الصنف")}</Label><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("بحث في الأصناف")} className="rounded-xl" /></div><div><Label>{tr("طريقة التقييم")}</Label><ValuationMethod value={priceWay} onChange={setPriceWay} /></div><label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={withZeros} onCheckedChange={value => setWithZeros(value === true)} />{tr("إظهار الأرصدة الصفرية")}</label></div><div className="mt-4 flex justify-end border-t pt-4"><Button data-report-apply onClick={loadReport} disabled={loading || loadingFilters || !!filterError} className="min-w-36 rounded-xl bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg">{loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض التقرير")}</Button></div></ReportFilters>
      {(error || filterError) && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error || filterError}</p>}
      <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4"><ReportSummaryCard label={tr("عدد الأصناف")}>{rows.length.toLocaleString("en-US")}</ReportSummaryCard><ReportSummaryCard label={tr("إجمالي الرصيد")}>{numberFormat(totalQuantity)}</ReportSummaryCard><ReportSummaryCard label={tr("قيمة المخزون")} highlight>{numberFormat(totalValue)}</ReportSummaryCard><ReportSummaryCard label={tr("متوسط قيمة الصنف")}>{numberFormat(rows.length ? totalValue / rows.length : 0)}</ReportSummaryCard></section>
      <section className="report-results"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">{tr("نتائج تقييم البضاعة")}</h2><p className="text-xs text-muted-foreground">{rows.length.toLocaleString("en-US")}{tr(" سجل")}{tr(" — طريقة التقييم: ")}{valuationMethods.find((method) => method.value === priceWay)?.label}</p></div><div className="relative w-full sm:w-80"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder={tr("ابحث داخل النتائج...")} className="rounded-xl bg-muted/40 ps-9" /></div></div><ReportGrid rows={rows} exportFileName={tr("تقييم البضاعة")} emptyText={loading ? undefined : tr("لا توجد نتائج لعرضها")}
            columns={[
              { key: "product_code", label: tr("رقم الصنف"), width: 140 },
              { key: "product_name", label: tr("الصنف"), width: "*", minWidth: 220 },
              { key: "balance", label: tr("الكمية"), type: "number", width: 130, total: true },
              { key: "main_unit", label: tr("الوحدة"), width: 100 },
              { key: "category", label: tr("المجموعة"), width: 150 },
              { key: "valuation_price", label: tr("سعر التقييم"), type: "number", width: 140 },
              { key: "valuation_amount", label: tr("قيمة المخزون"), type: "number", width: 160, total: true },
              // مصدر آخر سعر (رقم سند الشراء وتاريخه) — يظهر مع طريقة «آخر سعر شراء» فقط
              ...(loadedWay === "last" ? [{ key: "last_price_source", label: tr("مصدر آخر سعر"), width: 220, render: (row: any) => row.last_price_source === "سعر أول المدة" ? tr("سعر أول المدة") : row.last_price_source }] : []),
            ]}/></section>

  </ReportPage>
}
