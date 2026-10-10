"use client"

import { Fragment, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { useInventoryFilters } from "./inventory-filters"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarClock, Download, FileBarChart, Loader2, Printer, Search } from "lucide-react"

// تقرير أرصدة الأصناف حسب تاريخ الصلاحية — صف لكل (صنف، مستودع، صلاحية، رقم تشغيلي) برصيده حتى التاريخ،
// مع الأيام المتبقية وحالة الصلاحية. الحساب في app/api/reports/expiry-balances/route.ts.

type Row = {
  product_id: number
  product_code: string
  product_name: string
  main_unit: string
  category: string
  warehouse_id: number
  warehouse_name: string
  expiry_date: string | null
  batch_no: string
  quantity: number
  days_left: number | null
  status: "expired" | "near" | "valid" | "none"
}

const today = () => new Date().toISOString().slice(0, 10)
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const STATUS: Record<Row["status"], { label: string; tone: string; row: string }> = {
  expired: { label: "منتهي", tone: "bg-rose-100 text-rose-700 ring-rose-200", row: "bg-rose-50/60" },
  near: { label: "قريب الانتهاء", tone: "bg-amber-100 text-amber-800 ring-amber-200", row: "bg-amber-50/50" },
  valid: { label: "ساري", tone: "bg-emerald-100 text-emerald-700 ring-emerald-200", row: "" },
  none: { label: "بلا صلاحية", tone: "bg-slate-100 text-slate-600 ring-slate-200", row: "" },
}

export function ExpiryBalancesReport() {
  const { controls, filterQuery, loadingFilters, filterError } = useInventoryFilters("/api/reports/expiry-balances")
  const [toDate, setToDate] = useState(today())
  const [status, setStatus] = useState("all")
  const [nearDays, setNearDays] = useState("30")
  const [fromExpiry, setFromExpiry] = useState("")
  const [toExpiry, setToExpiry] = useState("")
  const [includeNoExpiry, setIncludeNoExpiry] = useState(false)
  const [groupByProduct, setGroupByProduct] = useState(false)
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [hasRun, setHasRun] = useState(false)

  const loadReport = async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams(filterQuery)
      params.set("to_date", toDate)
      params.set("status", status)
      params.set("near_days", String(Math.max(1, Number(nearDays) || 30)))
      if (fromExpiry) params.set("from_expiry", fromExpiry)
      if (toExpiry) params.set("to_expiry", toExpiry)
      if (includeNoExpiry) params.set("include_no_expiry", "1")
      const response = await fetch(`/api/reports/expiry-balances?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || [])
      setHasRun(true)
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : "تعذر تحميل التقرير")
    } finally {
      setLoading(false)
    }
  }

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? rows.filter((row) => `${row.product_code} ${row.product_name} ${row.batch_no} ${row.warehouse_name}`.toLowerCase().includes(term)) : rows
  }, [rows, search])

  // تجميع حسب الصنف: عنوان لكل صنف بإجمالي رصيده وأقرب صلاحية
  const groups = useMemo(() => {
    const map = new Map<number, { product: Row; rows: Row[]; total: number }>()
    for (const row of visibleRows) {
      const group = map.get(row.product_id) || { product: row, rows: [], total: 0 }
      group.rows.push(row)
      group.total += row.quantity
      map.set(row.product_id, group)
    }
    return [...map.values()]
  }, [visibleRows])

  const sumBy = (key: Row["status"]) => visibleRows.filter((row) => row.status === key).reduce((sum, row) => sum + row.quantity, 0)
  const countBy = (key: Row["status"]) => visibleRows.filter((row) => row.status === key).length

  const exportCsv = () => {
    const header = ["رقم الصنف", "اسم الصنف", "الوحدة", "المستودع", "تاريخ الصلاحية", "الرقم التشغيلي", "الرصيد", "الأيام المتبقية", "الحالة"]
    const body = visibleRows.map((row) => [row.product_code, row.product_name, row.main_unit, row.warehouse_name, row.expiry_date || "", row.batch_no, row.quantity, row.days_left ?? "", STATUS[row.status].label])
    const csv = [header, ...body].map((values) => values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    link.download = `أرصدة-حسب-الصلاحية-${toDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const daysText = (row: Row) => {
    if (row.days_left == null) return "—"
    if (row.days_left < 0) return `منتهي منذ ${Math.abs(row.days_left)} يوم`
    if (row.days_left === 0) return "ينتهي اليوم"
    return `${row.days_left} يوم`
  }

  const renderRow = (row: Row, index: number, nested = false) => (
    <tr key={`${row.product_id}-${row.warehouse_id}-${row.expiry_date}-${row.batch_no}-${index}`} className={`border-b hover:bg-teal-50/60 ${STATUS[row.status].row}`}>
      {!nested && <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.product_code}</td>}
      {!nested && <td className="px-3 py-2.5 font-semibold">{row.product_name}</td>}
      {nested && <td className="px-3 py-2.5" colSpan={2} />}
      <td className="px-3 py-2.5">{row.warehouse_name}</td>
      <td className="px-3 py-2.5 font-mono font-bold" dir="ltr">{row.expiry_date || "—"}</td>
      <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.batch_no || "—"}</td>
      <td className="px-3 py-2.5 font-black tabular-nums" dir="ltr">{qty(row.quantity)} <span className="text-xs font-normal text-slate-500">{row.main_unit}</span></td>
      <td className="px-3 py-2.5 text-xs font-semibold">{daysText(row)}</td>
      <td className="px-3 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${STATUS[row.status].tone}`}>{STATUS[row.status].label}</span></td>
    </tr>
  )

  return (
    <ReportPage loading={loading || loadingFilters}>
      <ReportHeader
        icon={CalendarClock}
        category="تقارير الأصناف"
        title={<>أرصدة الأصناف حسب تاريخ الصلاحية</>}
        description={<>رصيد كل صنف موزّعاً على تواريخ الصلاحية والأرقام التشغيلية في كل مستودع، مع الأيام المتبقية</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!visibleRows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {controls}
          <div className="space-y-2"><Label>الرصيد حتى تاريخ</Label><Input type="date" lang="en" dir="ltr" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2">
            <Label>حالة الصلاحية</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="expired">منتهي</SelectItem>
                <SelectItem value="near">قريب الانتهاء</SelectItem>
                <SelectItem value="valid">ساري</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>قريب الانتهاء خلال (يوم)</Label><Input type="number" min={1} dir="ltr" value={nearDays} onChange={(event) => setNearDays(event.target.value)} className="rounded-xl text-right" /></div>
          <div className="space-y-2"><Label>الصلاحية من</Label><Input type="date" lang="en" dir="ltr" value={fromExpiry} onChange={(event) => setFromExpiry(event.target.value)} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>الصلاحية إلى</Label><Input type="date" lang="en" dir="ltr" value={toExpiry} onChange={(event) => setToExpiry(event.target.value)} className="rounded-xl" /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2"><Checkbox checked={groupByProduct} onCheckedChange={(value) => setGroupByProduct(value === true)} />تجميع حسب الصنف</label>
            <label className="flex cursor-pointer items-center gap-2" title="إظهار أرصدة بلا تاريخ صلاحية للأصناف المختارة"><Checkbox checked={includeNoExpiry} onCheckedChange={(value) => setIncludeNoExpiry(value === true)} />إظهار الأرصدة بلا صلاحية</label>
          </div>
          <Button data-report-apply onClick={() => void loadReport()} disabled={loading || loadingFilters} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
            {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض النتائج
          </Button>
        </div>
      </ReportFilters>

      {(error || filterError) && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error || filterError}</p>}

      <section className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
        <ReportSummaryCard label="عدد الدفعات">{visibleRows.length.toLocaleString("en-US")}</ReportSummaryCard>
        <ReportSummaryCard label={`منتهي (${countBy("expired")} دفعة)`}>{qty(sumBy("expired"))}</ReportSummaryCard>
        <ReportSummaryCard label={`قريب الانتهاء (${countBy("near")} دفعة)`}>{qty(sumBy("near"))}</ReportSummaryCard>
        <ReportSummaryCard label={`ساري (${countBy("valid")} دفعة)`}>{qty(sumBy("valid"))}</ReportSummaryCard>
      </section>

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">الأرصدة حسب الصلاحية حتى {toDate}</h2>
            <p className="text-xs text-muted-foreground">{groups.length.toLocaleString("en-US")} صنف · {visibleRows.length.toLocaleString("en-US")} دفعة</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالصنف أو الرقم التشغيلي أو المستودع..." className="w-full rounded-xl sm:w-80" />
        </div>
        <div className="report-table-scroll">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
              <tr>{["رقم الصنف", "اسم الصنف", "المستودع", "تاريخ الصلاحية", "الرقم التشغيلي", "الرصيد", "المتبقي", "الحالة"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs">{label}</th>)}</tr>
            </thead>
            <tbody>
              {groupByProduct
                ? groups.map((group) => (
                    <Fragment key={`group-${group.product.product_id}`}>
                      <tr className="border-b bg-slate-100/80">
                        <td className="px-3 py-2 font-mono font-bold text-teal-800">{group.product.product_code}</td>
                        <td className="px-3 py-2 font-black" colSpan={4}>{group.product.product_name}</td>
                        <td className="px-3 py-2 font-black tabular-nums" dir="ltr">{qty(group.total)} <span className="text-xs font-normal text-slate-500">{group.product.main_unit}</span></td>
                        <td className="px-3 py-2 text-xs text-slate-500" colSpan={2}>{group.rows.length} دفعة</td>
                      </tr>
                      {group.rows.map((row, index) => renderRow(row, index, true))}
                    </Fragment>
                  ))
                : visibleRows.map((row, index) => renderRow(row, index))}
              {!loading && !visibleRows.length && (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{hasRun ? "لا توجد أرصدة مطابقة" : "اختر الفلاتر ثم اضغط عرض النتائج"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ReportPage>
  )
}
