"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { voucherHref } from "@/lib/voucher-links"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, FileBarChart, Loader2, Printer, RefreshCcw, Search, Truck } from "lucide-react"

// تقارير الإرساليات الثلاثة — الحساب في app/api/reports/deliveries/route.ts.

type Kind = "deliveries" | "internal" | "consignment-invoices"
const TITLES: Record<Kind, string> = {
  deliveries: "تقرير الارساليات",
  internal: "تقرير الارساليات الداخلية",
  "consignment-invoices": "الفواتير الصادرة من إرسالية برسم البيع",
}
type Meta = { currencies: ReportOption[]; branches: ReportOption[]; warehouses: ReportOption[]; products: ReportOption[]; accounts: ReportOption[]; voucher_types: ReportOption[]; consignments: { id: number; vch_code: string; vch_date: string; customer_name: string; salesman_name: string | null }[] }
const emptyMeta: Meta = { currencies: [], branches: [], warehouses: [], products: [], accounts: [], voucher_types: [], consignments: [] }

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 7)}-01`
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (value: number) => money.format(Number(value || 0))
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const th = "whitespace-nowrap px-3 py-3 text-right text-xs"
const num = "px-3 py-2.5 tabular-nums"
const INVOICE_STATES: Record<string, { label: string; tone: string }> = {
  full: { label: "مفوترة", tone: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  partial: { label: "مفوترة جزئياً", tone: "bg-amber-100 text-amber-800 ring-amber-200" },
  none: { label: "غير مفوترة", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
}

export function DeliveriesReport({ kind }: { kind: Kind }) {
  const title = TITLES[kind]
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<any>(null)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({
    fromDate: monthStart(), toDate: today(), currencyId: 0, branchIds: [] as number[], status: "all",
    voucherTypes: [] as number[], accountIds: [] as number[], itemIds: [] as number[], invoiceStatus: "all",
    fromStoreIds: [] as number[], toStoreIds: [] as number[], consignmentId: "", includeDetails: false,
  })
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    setLoading(true)
    fetch(`/api/reports/deliveries?kind=${kind}&meta=1`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
        const next: Meta = { ...emptyMeta, ...(data.meta || {}) }
        setMeta(next)
        setFilters((current) => ({ ...current, currencyId: Number(next.currencies[0]?.id || 0) }))
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير"))
      .finally(() => setLoading(false))
  }, [kind])

  const run = async () => {
    if (kind === "consignment-invoices" && !filters.consignmentId) { setError("الرجاء اختيار رقم الارسالية"); return }
    setRunning(true)
    setError("")
    try {
      const params = new URLSearchParams({ kind, from_date: filters.fromDate, to_date: filters.toDate, report_currency_id: String(filters.currencyId), status: filters.status })
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.itemIds.length) params.set("item_ids", filters.itemIds.join(","))
      if (kind === "deliveries") {
        if (filters.voucherTypes.length) params.set("voucher_types", filters.voucherTypes.join(","))
        if (filters.accountIds.length) params.set("account_ids", filters.accountIds.join(","))
        params.set("invoice_status", filters.invoiceStatus)
      }
      if (kind === "internal") {
        if (filters.fromStoreIds.length) params.set("from_store_ids", filters.fromStoreIds.join(","))
        if (filters.toStoreIds.length) params.set("to_store_ids", filters.toStoreIds.join(","))
      }
      if (kind === "consignment-invoices") {
        params.set("consignment_id", filters.consignmentId)
        if (filters.includeDetails) params.set("include_details", "1")
      }
      const response = await fetch(`/api/reports/deliveries?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setResult(data)
    } catch (reason) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    set({ fromDate: monthStart(), toDate: today(), branchIds: [], status: "all", voucherTypes: [], accountIds: [], itemIds: [], invoiceStatus: "all", fromStoreIds: [], toStoreIds: [], consignmentId: "", includeDetails: false })
    setResult(null)
    setSearch("")
    setError("")
  }

  const term = search.trim().toLowerCase()
  const rows: any[] = useMemo(() => {
    const list = Array.isArray(result?.rows) ? result.rows : []
    return list.filter((row: any) => !term || [row.vch_code, row.customer_name, row.account_name, row.salesman_name, row.driver_name, row.car_name, row.from_store, row.to_store, row.manual_voucher, row.note, row.invoices].some((value) => String(value ?? "").toLowerCase().includes(term)))
  }, [result, term])
  const sum = (key: string) => rows.reduce((s, row) => s + Number(row[key] || 0), 0)
  const openVoucher = (row: any) => { if (row.id) window.open(voucherHref(Number(row.id), Number(row.vch_type), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer") }

  const exportCsv = () => {
    let table: unknown[][] = []
    if (kind === "deliveries") table = [["التاريخ", "النوع", "رقم السند", "العميل", "المستودع", "المندوب", "السيارة", "السائق", "السند اليدوي", "الكمية", "المفوتر", "المتبقي", "المبلغ", "حالة الفوترة", "الفواتير", "ملاحظات"], ...rows.map((r) => [r.vch_date, r.type_name, r.vch_code, r.customer_name, r.warehouses, r.salesman_name, r.car_label, r.driver_name, r.manual_voucher, r.quantity, r.invoiced_quantity, r.remaining_quantity, r.amount, Number(r.vch_type) === 15 ? "" : INVOICE_STATES[r.invoice_state]?.label, r.invoices, r.note])]
    else if (kind === "internal") table = [["التاريخ", "رقم السند", "من مستودع", "الى مستودع", "عدد الأسطر", "الكمية", "المبلغ", "السيارة", "السائق", "السند اليدوي", "ملاحظة"], ...rows.map((r) => [r.vch_date, r.vch_code, r.from_store, r.to_store, r.lines, r.quantity, r.amount, r.car_name, r.driver_name, r.manual_voucher, r.note])]
    else {
      table = [["التاريخ", "النوع", "رقم السند", "رقم الحساب", "البيان", "حالة الفاتورة", "المبلغ", "رصيد الزبون", "ملاحظات"]]
      for (const r of rows) {
        table.push([r.vch_date, r.type_name, r.vch_code, r.account_code, r.account_name, r.status_name, r.amount, r.account_balance, r.note])
        for (const d of r.details || []) table.push(["", "", "", d.product_code, d.item_name, d.unit_name, d.line_amount, `${d.quantity} × ${d.price}`, `خصم ${d.discount}%`])
      }
    }
    const csv = table.map((values) => values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    link.download = `${title}-${filters.toDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const summary = (() => {
    if (!result) return null
    if (kind === "deliveries") return [["عدد الإرساليات", rows.length.toLocaleString("en-US")], ["إجمالي المبالغ", fmt(sum("amount"))], ["غير مفوترة / جزئياً", `${rows.filter((r) => r.invoice_state === "none" && Number(r.vch_type) !== 15).length} / ${rows.filter((r) => r.invoice_state === "partial").length}`]]
    if (kind === "internal") return [["عدد الإرساليات", rows.length.toLocaleString("en-US")], ["إجمالي الكميات", qty(sum("quantity"))], ["إجمالي المبالغ", fmt(sum("amount"))]]
    const invoicesTotal = rows.filter((r) => Number(r.vch_type) === 12).reduce((s, r) => s + r.amount, 0)
    const returnsTotal = rows.filter((r) => Number(r.vch_type) === 15).reduce((s, r) => s + r.amount, 0)
    return [["قيمة الإرسالية", fmt(result.consignment?.amount)], ["الفواتير", fmt(invoicesTotal)], ["المرتجعات", fmt(Math.abs(returnsTotal))]]
  })()

  const empty = <div className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{result ? "لا توجد سندات مطابقة" : kind === "consignment-invoices" ? "اختر الإرسالية ثم اضغط عرض النتائج" : "اختر الفلاتر ثم اضغط عرض النتائج"}</div>
  const head = (labels: string[]) => <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white"><tr>{labels.map((label, i) => <th key={`${label}-${i}`} className={th}>{label}</th>)}</tr></thead>

  const renderDeliveries = () => (
    <table className="w-full min-w-[1300px] text-sm">
      {head(["التاريخ", "النوع", "رقم السند", "العميل", "المستودع", "المندوب", "السيارة", "السائق", "الكمية", "المفوتر", "المتبقي", "المبلغ", "حالة الفوترة", "الفواتير / المرتجعات", "ملاحظات"])}
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="cursor-pointer border-b hover:bg-teal-50/60" onDoubleClick={() => openVoucher(row)} title="انقر نقراً مزدوجاً لفتح السند">
            <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.vch_date}</td>
            <td className="px-3 py-2.5 text-xs">{row.type_name}</td>
            <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.vch_code}</td>
            <td className="px-3 py-2.5 font-semibold">{row.customer_name || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.warehouses || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.salesman_name || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.car_label || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.driver_name || "—"}</td>
            <td className={num} dir="ltr">{qty(row.quantity)}</td>
            <td className={num} dir="ltr">{Number(row.vch_type) === 15 ? "—" : qty(row.invoiced_quantity)}</td>
            <td className={`${num} font-bold`} dir="ltr">{Number(row.vch_type) === 15 ? "—" : qty(row.remaining_quantity)}</td>
            <td className={`${num} font-bold`} dir="ltr">{fmt(row.amount)}</td>
            <td className="px-3 py-2.5">{Number(row.vch_type) === 15 ? "—" : <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${INVOICE_STATES[row.invoice_state]?.tone}`}>{INVOICE_STATES[row.invoice_state]?.label}</span>}</td>
            <td className="max-w-[240px] px-3 py-2.5 text-xs text-slate-600">{row.invoices || "—"}</td>
            <td className="max-w-[200px] truncate px-3 py-2.5 text-xs text-slate-500">{row.note}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && <tfoot className="sticky bottom-0 bg-slate-100 font-black"><tr><td className="px-3 py-3" colSpan={8}>الإجمالي</td><td className={num} dir="ltr">{qty(sum("quantity"))}</td><td className={num} dir="ltr">{qty(sum("invoiced_quantity"))}</td><td className={num} dir="ltr">{qty(sum("remaining_quantity"))}</td><td className={num} dir="ltr">{fmt(sum("amount"))}</td><td colSpan={3} /></tr></tfoot>}
    </table>
  )

  const renderInternal = () => (
    <table className="w-full min-w-[1100px] text-sm">
      {head(["التاريخ", "رقم السند", "من مستودع", "الى مستودع", "عدد الأسطر", "الكمية", "المبلغ", "السيارة", "السائق", "السند اليدوي", "ملاحظة السند"])}
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="cursor-pointer border-b hover:bg-teal-50/60" onDoubleClick={() => openVoucher(row)} title="انقر نقراً مزدوجاً لفتح السند">
            <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.vch_date}</td>
            <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.vch_code}</td>
            <td className="px-3 py-2.5 font-semibold">{row.from_store || "—"}</td>
            <td className="px-3 py-2.5 font-semibold">{row.to_store || "—"}</td>
            <td className={num} dir="ltr">{row.lines}</td>
            <td className={num} dir="ltr">{qty(row.quantity)}</td>
            <td className={`${num} font-bold`} dir="ltr">{fmt(row.amount)}</td>
            <td className="px-3 py-2.5 text-xs">{row.car_name || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.driver_name || "—"}</td>
            <td className="px-3 py-2.5 text-xs">{row.manual_voucher || "—"}</td>
            <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-slate-500">{row.note}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && <tfoot className="sticky bottom-0 bg-slate-100 font-black"><tr><td className="px-3 py-3" colSpan={4}>الإجمالي</td><td className={num} dir="ltr">{sum("lines")}</td><td className={num} dir="ltr">{qty(sum("quantity"))}</td><td className={num} dir="ltr">{fmt(sum("amount"))}</td><td colSpan={4} /></tr></tfoot>}
    </table>
  )

  const renderConsignment = () => (
    <div className="space-y-4">
      {result?.consignment && (
        <div className="grid gap-2 border-b bg-slate-50/70 p-4 text-sm sm:grid-cols-4">
          <p><span className="text-slate-500">الإرسالية:</span> <b className="font-mono text-teal-700">{result.consignment.vch_code}</b></p>
          <p><span className="text-slate-500">التاريخ:</span> <b dir="ltr">{result.consignment.vch_date}</b></p>
          <p><span className="text-slate-500">العميل:</span> <b>{result.consignment.customer_name || "—"}</b></p>
          <p><span className="text-slate-500">المندوب:</span> <b>{result.consignment.salesman_name || "—"}</b></p>
        </div>
      )}
      <table className="w-full min-w-[1000px] text-sm">
        {head(["التاريخ", "النوع", "رقم السند", "رقم الحساب", "البيان", "حالة الفاتورة", "المبلغ", "رصيد الزبون", "ملاحظات"])}
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className={`cursor-pointer border-b hover:bg-teal-50/60 ${Number(row.vch_type) === 15 ? "text-rose-700" : ""} ${row.details?.length ? "bg-slate-50 font-semibold" : ""}`} onDoubleClick={() => openVoucher(row)} title="انقر نقراً مزدوجاً لفتح السند">
                <td className="px-3 py-2.5 font-mono text-xs" dir="ltr">{row.vch_date}</td>
                <td className="px-3 py-2.5 text-xs">{row.type_name}</td>
                <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.vch_code}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{row.account_code || "—"}</td>
                <td className="px-3 py-2.5">{row.account_name || "—"}</td>
                <td className="px-3 py-2.5 text-xs">{row.status_name}</td>
                <td className={`${num} font-bold`} dir="ltr">{fmt(row.amount)}</td>
                <td className={num} dir="ltr">{row.account_balance == null ? "—" : fmt(row.account_balance)}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-slate-500">{row.note}</td>
              </tr>
              {(row.details || []).map((line: any, index: number) => (
                <tr key={`${row.id}-${index}`} className="border-b text-xs text-slate-600">
                  <td colSpan={3} />
                  <td className="px-3 py-2 font-mono">{line.product_code}</td>
                  <td className="px-3 py-2">{line.item_name} <span className="text-slate-400">({line.unit_name || "وحدة"})</span></td>
                  <td className="px-3 py-2" dir="ltr">{qty(line.quantity)}{line.bonus ? ` + ${qty(line.bonus)}` : ""} × {fmt(line.price)}</td>
                  <td className={num} dir="ltr">{fmt(line.line_amount)}</td>
                  <td className="px-3 py-2">{line.discount ? `خصم ${line.discount}%` : ""}</td>
                  <td />
                </tr>
              ))}
            </Fragment>
          ))}
          {!rows.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">لا يوجد فواتير لهذه الارسالية</td></tr>}
        </tbody>
      </table>
      {Array.isArray(result?.items) && result.items.length > 0 && (
        <div className="p-4">
          <h3 className="mb-2 text-sm font-black text-teal-800">أصناف الإرسالية والمتبقي منها</h3>
          <table className="w-full min-w-[700px] text-sm">
            {head(["رقم الصنف", "اسم الصنف", "الوحدة", "الكمية", "المفوتر", "المرتجع", "المتبقي"])}
            <tbody>
              {result.items.map((item: any) => (
                <tr key={item.id} className="border-b">
                  <td className="px-3 py-2.5 font-mono text-xs">{item.product_code}</td>
                  <td className="px-3 py-2.5 font-semibold">{item.item_name}</td>
                  <td className="px-3 py-2.5 text-xs">{item.unit_name || "—"}</td>
                  <td className={num} dir="ltr">{qty(item.quantity)}</td>
                  <td className={num} dir="ltr">{qty(item.invoiced)}</td>
                  <td className={num} dir="ltr">{qty(item.returned)}</td>
                  <td className={`${num} font-black ${item.remaining > 0 ? "text-amber-700" : "text-emerald-700"}`} dir="ltr">{qty(item.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const hasData = Boolean(result) && (kind === "consignment-invoices" ? Boolean(result?.consignment) : rows.length > 0)

  return (
    <ReportPage loading={loading || running}>
      <ReportHeader
        icon={Truck}
        category="تقارير الارساليات"
        title={<>{title}</>}
        description={<>{kind === "deliveries" ? "إرساليات المبيعات والمشتريات وبرسم البيع وحالة فوترتها" : kind === "internal" ? "الإرساليات الداخلية بين المستودعات" : "الفواتير والمرتجعات الصادرة من إرسالية برسم البيع والمتبقي منها"}</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!hasData}><Download className="ml-2 h-4 w-4" />تصدير</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {kind === "consignment-invoices" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>رقم الارسالية *</Label>
              <Select value={filters.consignmentId} onValueChange={(consignmentId) => set({ consignmentId })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={meta.consignments.length ? "اختر الإرسالية" : "لا توجد إرساليات برسم البيع"} /></SelectTrigger>
                <SelectContent>
                  {meta.consignments.map((row) => <SelectItem key={row.id} value={String(row.id)}>{row.vch_code} · {row.vch_date} · {row.customer_name || row.salesman_name || ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} className="rounded-xl" /></div>
              <div className="space-y-2"><Label>الى تاريخ</Label><Input type="date" dir="ltr" value={filters.toDate} onChange={(event) => set({ toDate: event.target.value })} className="rounded-xl" /></div>
            </>
          )}
          {kind === "deliveries" && <ReportMultiChoice label="نوع الارسالية" options={meta.voucher_types} selected={filters.voucherTypes} onChange={(voucherTypes) => set({ voucherTypes })} placeholder="جميع الأنواع" />}
          {kind === "deliveries" && <ReportMultiChoice label="العملاء" options={meta.accounts} selected={filters.accountIds} onChange={(accountIds) => set({ accountIds })} placeholder="جميع العملاء" />}
          {kind === "internal" && <ReportMultiChoice label="من مستودع" options={meta.warehouses} selected={filters.fromStoreIds} onChange={(fromStoreIds) => set({ fromStoreIds })} placeholder="جميع المستودعات" />}
          {kind === "internal" && <ReportMultiChoice label="الى مستودع" options={meta.warehouses} selected={filters.toStoreIds} onChange={(toStoreIds) => set({ toStoreIds })} placeholder="جميع المستودعات" />}
          {kind !== "consignment-invoices" && <ReportMultiChoice label="الصنف" options={meta.products} selected={filters.itemIds} onChange={(itemIds) => set({ itemIds })} placeholder="جميع الأصناف" />}
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => set({ currencyId })} />
          {kind !== "consignment-invoices" && <ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => set({ branchIds })} placeholder="جميع الفروع المتاحة" />}
          {kind !== "consignment-invoices" && (
            <div className="space-y-2">
              <Label>حالة السندات</Label>
              <Select value={filters.status} onValueChange={(status) => set({ status })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">المحفوظ والمرحل</SelectItem><SelectItem value="posted">المرحل فقط</SelectItem></SelectContent>
              </Select>
            </div>
          )}
          {kind === "deliveries" && (
            <div className="space-y-2">
              <Label>حالة الارسالية</Label>
              <Select value={filters.invoiceStatus} onValueChange={(invoiceStatus) => set({ invoiceStatus })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="none">غير مفوترة</SelectItem><SelectItem value="partial">مفوترة جزئياً</SelectItem><SelectItem value="invoiced">مفوترة بالكامل</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {kind === "consignment-invoices" && <label className="flex cursor-pointer items-center gap-2" title="تفعيله يعمل على عرض تفاصيل كل فاتورة اسفلها"><Checkbox checked={filters.includeDetails} onCheckedChange={(value) => set({ includeDetails: value === true })} />إظهار تفاصيل الفاتورة</label>}
            {kind !== "consignment-invoices" && filters.itemIds.length > 1 && <p className="text-xs text-slate-500">عند تحديد أكثر من صنف تُعرض الإرساليات التي تحتوي جميع الأصناف المحددة</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4" />مسح الفلاتر</Button>
            <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
              {running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض النتائج
            </Button>
          </div>
        </div>
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {summary && <section className="grid gap-3 sm:grid-cols-3">{summary.map(([label, value]) => <ReportSummaryCard key={label} label={label}>{value}</ReportSummaryCard>)}</section>}

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground">{kind === "consignment-invoices" ? `${rows.length} فاتورة/مرتجع` : `من ${filters.fromDate} إلى ${filters.toDate} · ${rows.length.toLocaleString("en-US")} سند`}</p>
          </div>
          {result && <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث في النتائج..." className="w-full rounded-xl sm:w-80" />}
        </div>
        <div className="report-table-scroll">
          {!result ? empty
            : kind === "consignment-invoices" ? renderConsignment()
            : !rows.length ? empty
            : kind === "deliveries" ? renderDeliveries() : renderInternal()}
        </div>
      </section>
    </ReportPage>
  )
}

export const DeliveriesListReport = () => <DeliveriesReport kind="deliveries" />
export const InternalDeliveriesReport = () => <DeliveriesReport kind="internal" />
export const ConsignmentInvoicesReport = () => <DeliveriesReport kind="consignment-invoices" />
