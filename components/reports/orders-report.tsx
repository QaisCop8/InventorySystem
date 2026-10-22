"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ClipboardList, Layers, PackageSearch, Printer, Search, Timer, UserRound, Users, type LucideIcon } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ORDER_TYPE_OPTIONS } from "@/components/reports/order-reports"

// تقارير الطلبيات (app/api/reports/orders): مكوّن واحد بعدة أنواع (view) — كل نوع شاشة مستقلة في القائمة وصلاحية مستقلة.
type View = "detailed" | "total" | "by-item" | "by-party" | "backlog" | "by-salesman"
type Align = "start" | "end" | "center"
type Column = { key: string; label: string; align?: Align; format?: "money" | "qty" | "date" | "status" | "type" | "int" | "late"; sum?: boolean }

const STATUS_OPTIONS: ReportOption[] = [
  { id: 1, name: "غير جاهزة" }, { id: 2, name: "جاهزة" }, { id: 3, name: "مرسلة جزئياً" },
  { id: 4, name: "مرسلة كلياً" }, { id: 5, name: "ملغاة" }, { id: 6, name: "مغلقة" },
] as ReportOption[]
const STATUS_LABEL: Record<number, string> = { 1: "غير جاهزة", 2: "جاهزة", 3: "مرسلة جزئياً", 4: "مرسلة كلياً", 5: "ملغاة", 6: "مغلقة" }
const STATUS_TONE: Record<number, string> = { 1: "bg-amber-100 text-amber-700", 2: "bg-emerald-100 text-emerald-700", 3: "bg-sky-100 text-sky-700", 4: "bg-indigo-100 text-indigo-700", 5: "bg-rose-100 text-rose-700", 6: "bg-slate-200 text-slate-700" }

const CONFIG: Record<View, { title: string; description: string; icon: LucideIcon; columns: Column[] }> = {
  detailed: {
    title: "تقرير الطلبيات تفصيلي", icon: ClipboardList,
    description: "أسطر الطلبيات صنفاً صنفاً: الكمية والمسلَّم والمتبقي والسعر والقيمة",
    columns: [
      { key: "order_number", label: "رقم الطلبية" }, { key: "order_date", label: "التاريخ", format: "date" }, { key: "order_type", label: "النوع", format: "type" },
      { key: "party_name", label: "العميل/المورد" }, { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" }, { key: "unit_name", label: "الوحدة" },
      { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true }, { key: "bonus", label: "البونص", align: "end", format: "qty", sum: true },
      { key: "delivered_quantity", label: "المسلَّم", align: "end", format: "qty", sum: true }, { key: "remaining_quantity", label: "المتبقي", align: "end", format: "qty", sum: true },
      { key: "price", label: "السعر", align: "end", format: "money" }, { key: "discount", label: "الخصم %", align: "end", format: "qty" },
      { key: "line_value", label: "القيمة", align: "end", format: "money", sum: true }, { key: "order_status", label: "الحالة", align: "center", format: "status" },
    ],
  },
  total: {
    title: "تقرير الطلبيات إجمالي", icon: Layers,
    description: "طلبية في كل سطر: عدد الأصناف والكميات والمسلَّم والمتبقي والخصم والضريبة والإجمالي",
    columns: [
      { key: "order_number", label: "رقم الطلبية" }, { key: "order_date", label: "التاريخ", format: "date" }, { key: "delivery_date", label: "تاريخ التسليم", format: "date" },
      { key: "order_type", label: "النوع", format: "type" }, { key: "party_name", label: "العميل/المورد" }, { key: "salesman_name", label: "المندوب" }, { key: "branch_name", label: "الفرع" },
      { key: "lines", label: "الأصناف", align: "center", format: "int", sum: true }, { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true },
      { key: "remaining_quantity", label: "المتبقي", align: "end", format: "qty", sum: true }, { key: "discount_amount", label: "الخصم", align: "end", format: "money", sum: true },
      { key: "vat_amount", label: "الضريبة", align: "end", format: "money", sum: true }, { key: "total_amount", label: "الإجمالي", align: "end", format: "money", sum: true },
      { key: "currency_code", label: "العملة", align: "center" }, { key: "order_status", label: "الحالة", align: "center", format: "status" },
    ],
  },
  "by-item": {
    title: "الطلبيات حسب الصنف", icon: PackageSearch,
    description: "إجمالي الكميات المطلوبة لكل صنف مع المسلَّم والمتبقي ومتوسط السعر",
    columns: [
      { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" }, { key: "unit_name", label: "الوحدة" },
      { key: "orders", label: "عدد الطلبيات", align: "center", format: "int", sum: true }, { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true },
      { key: "bonus", label: "البونص", align: "end", format: "qty", sum: true }, { key: "delivered_quantity", label: "المسلَّم", align: "end", format: "qty", sum: true },
      { key: "remaining_quantity", label: "المتبقي", align: "end", format: "qty", sum: true }, { key: "avg_price", label: "متوسط السعر", align: "end", format: "money" },
      { key: "line_value", label: "القيمة", align: "end", format: "money", sum: true },
    ],
  },
  "by-party": {
    title: "الطلبيات حسب العميل/المورد", icon: Users,
    description: "عدد الطلبيات والمفتوح منها والكميات والقيمة لكل عميل أو مورد",
    columns: [
      { key: "party_code", label: "الرمز" }, { key: "party_name", label: "العميل/المورد" },
      { key: "orders", label: "عدد الطلبيات", align: "center", format: "int", sum: true }, { key: "open_orders", label: "مفتوحة", align: "center", format: "int", sum: true },
      { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true }, { key: "delivered_quantity", label: "المسلَّم", align: "end", format: "qty", sum: true },
      { key: "remaining_quantity", label: "المتبقي", align: "end", format: "qty", sum: true }, { key: "line_value", label: "القيمة", align: "end", format: "money", sum: true },
      { key: "last_order_date", label: "آخر طلبية", format: "date" },
    ],
  },
  backlog: {
    title: "الطلبيات غير المسلّمة", icon: Timer,
    description: "الكميات المتبقية في الطلبيات المفتوحة (غير الملغاة أو المغلقة) مع أيام التأخير عن تاريخ التسليم",
    columns: [
      { key: "order_number", label: "رقم الطلبية" }, { key: "order_date", label: "التاريخ", format: "date" }, { key: "delivery_date", label: "تاريخ التسليم", format: "date" },
      { key: "party_name", label: "العميل/المورد" }, { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" },
      { key: "quantity", label: "المطلوب", align: "end", format: "qty", sum: true }, { key: "delivered_quantity", label: "المسلَّم", align: "end", format: "qty", sum: true },
      { key: "remaining_quantity", label: "المتبقي", align: "end", format: "qty", sum: true }, { key: "line_value", label: "القيمة", align: "end", format: "money", sum: true },
      { key: "days_late", label: "أيام التأخير", align: "center", format: "late" }, { key: "order_status", label: "الحالة", align: "center", format: "status" },
    ],
  },
  "by-salesman": {
    title: "الطلبيات حسب المندوب", icon: UserRound,
    description: "أداء المندوبين: عدد الطلبيات والعملاء والمنجز والملغى والقيمة",
    columns: [
      { key: "salesman_code", label: "الرمز" }, { key: "salesman_name", label: "المندوب" },
      { key: "orders", label: "الطلبيات", align: "center", format: "int", sum: true }, { key: "parties", label: "العملاء", align: "center", format: "int" },
      { key: "completed_orders", label: "مرسلة/مغلقة", align: "center", format: "int", sum: true }, { key: "cancelled_orders", label: "ملغاة", align: "center", format: "int", sum: true },
      { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true }, { key: "line_value", label: "القيمة", align: "end", format: "money", sum: true },
    ],
  },
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const day = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString("en-GB") : "—")
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`
const today = () => new Date().toISOString().slice(0, 10)
const alignClass = (align?: Align) => (align === "end" ? "text-left" : align === "center" ? "text-center" : "text-right")

function cell(column: Column, row: Record<string, any>) {
  const value = row[column.key]
  switch (column.format) {
    case "money": return <span dir="ltr" className="font-mono">{money(value)}</span>
    case "qty": return <span dir="ltr" className="font-mono">{qty(value)}</span>
    case "int": return <span className="font-mono">{Number(value || 0)}</span>
    case "date": return <span dir="ltr" className="font-mono text-xs">{day(value)}</span>
    case "type": return Number(value) === 2 ? "مشتريات" : "مبيعات"
    case "status": return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[Number(value)] || "bg-slate-100"}`}>{STATUS_LABEL[Number(value)] || value}</span>
    case "late": return value ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{value} يوم</span> : "—"
    default: return value === null || value === undefined || value === "" ? "—" : String(value)
  }
}

export function OrdersReport({ view }: { view: View }) {
  const config = CONFIG[view]
  const [meta, setMeta] = useState<{ parties: ReportOption[]; salesmen: ReportOption[]; branches: ReportOption[] }>({ parties: [], salesmen: [], branches: [] })
  const [filters, setFilters] = useState({
    from: view === "backlog" ? `${new Date().getFullYear()}-01-01` : monthStart(), to: today(), orderTypes: [1] as number[], search: "",
    statuses: [] as number[], partyIds: [] as number[], salesmanIds: [] as number[], branchIds: [] as number[],
  })
  const [rows, setRows] = useState<Record<string, any>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/reports/orders?view=${view}&meta=1`, { cache: "no-store" }).then((response) => response.json())
      .then((data) => setMeta({ parties: data.parties || [], salesmen: data.salesmen || [], branches: data.branches || [] })).catch(() => undefined)
  }, [view])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({
        view, from_date: filters.from, to_date: filters.to, order_types: filters.orderTypes.join(","), search: filters.search,
        statuses: filters.statuses.join(","), party_ids: filters.partyIds.join(","), salesman_ids: filters.salesmanIds.join(","), branch_ids: filters.branchIds.join(","),
      })
      const response = await fetch(`/api/reports/orders?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally { setLoading(false) }
  }, [filters, view])

  const totals = useMemo(() => {
    const result: Record<string, number> = {}
    for (const column of config.columns) if (column.sum) result[column.key] = (rows || []).reduce((sum, row) => sum + Number(row[column.key] || 0), 0)
    return result
  }, [rows, config])

  const orderCount = useMemo(() => new Set((rows || []).map((row) => row.order_id ?? row.party_id ?? row.product_id ?? row.salesman_id)).size, [rows])
  const valueKey = view === "total" ? "total_amount" : "line_value"
  const partyLabel = view === "backlog" || (filters.orderTypes.length === 1 && filters.orderTypes[0] === 1) ? "العملاء" : filters.orderTypes.length === 1 && filters.orderTypes[0] === 2 ? "الموردون" : "العملاء/الموردون"
  const Icon = config.icon
  const hasData = Boolean(rows?.length)

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Icon}
        category="تقارير الطلبيات"
        title={config.title}
        description={config.description}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="ml-2 h-4 w-4" />طباعة</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          {/* الطلبيات غير المسلّمة: طلبيات المبيعات فقط */}
          {view !== "backlog" && <ReportMultiChoice label="نوع الطلبيات" options={ORDER_TYPE_OPTIONS} selected={filters.orderTypes} onChange={(orderTypes) => setFilters({ ...filters, orderTypes, partyIds: [] })} placeholder="الكل" />}
          <div className="space-y-2"><Label>بحث</Label><Input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void run() }} placeholder={view === "by-item" || view === "detailed" || view === "backlog" ? "رمز أو اسم الصنف أو الباركود" : view === "by-salesman" ? "اسم المندوب" : "رقم الطلبية أو الاسم"} className="rounded-xl" /></div>
          <ReportMultiChoice label={partyLabel} options={meta.parties} selected={filters.partyIds} onChange={(partyIds) => setFilters({ ...filters, partyIds })} placeholder="الكل" />
          <ReportMultiChoice label="المندوب" options={meta.salesmen} selected={filters.salesmanIds} onChange={(salesmanIds) => setFilters({ ...filters, salesmanIds })} placeholder="كل المندوبين" />
          <ReportMultiChoice label="الفرع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder="كل الفروع" />
          {view !== "backlog" && <ReportMultiChoice label="حالة الطلبية" options={STATUS_OPTIONS} selected={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} placeholder="كل الحالات" />}
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="ml-2 h-4 w-4" />عرض النتائج</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportSummaryCard label={view === "by-item" ? "عدد الأصناف" : view === "by-party" ? "عدد العملاء/الموردين" : view === "by-salesman" ? "عدد المندوبين" : "عدد الطلبيات"}>{String(orderCount)}</ReportSummaryCard>
            {"quantity" in totals && <ReportSummaryCard label="إجمالي الكمية">{qty(totals.quantity)}</ReportSummaryCard>}
            {"remaining_quantity" in totals && <ReportSummaryCard label="الكمية المتبقية">{qty(totals.remaining_quantity)}</ReportSummaryCard>}
            {valueKey in totals && <ReportSummaryCard label="إجمالي القيمة">{money(totals[valueKey])}</ReportSummaryCard>}
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>{config.columns.map((column) => <th key={column.key} className={`whitespace-nowrap p-2 ${alignClass(column.align)}`}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={config.columns.length} className="p-8 text-center text-muted-foreground">لا توجد بيانات للفترة والفلاتر المحددة</td></tr>
                  : rows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-emerald-50/40">
                      {config.columns.map((column) => <td key={column.key} className={`p-2 ${alignClass(column.align)}`}>{cell(column, row)}</td>)}
                    </tr>
                  ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 bg-slate-50 font-bold">
                  <tr>
                    {config.columns.map((column, index) => (
                      <td key={column.key} className={`p-2 ${alignClass(column.align)}`}>
                        {index === 0 ? "الإجمالي" : column.sum ? (column.format === "money" ? <span dir="ltr" className="font-mono">{money(totals[column.key])}</span> : column.format === "int" ? totals[column.key] : <span dir="ltr" className="font-mono">{qty(totals[column.key])}</span>) : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </ReportPage>
  )
}

export const OrdersDetailedReport = () => <OrdersReport view="detailed" />
export const OrdersTotalReport = () => <OrdersReport view="total" />
export const OrdersByItemReport = () => <OrdersReport view="by-item" />
export const OrdersByPartyReport = () => <OrdersReport view="by-party" />
export const OrdersBacklogReport = () => <OrdersReport view="backlog" />
export const OrdersBySalesmanReport = () => <OrdersReport view="by-salesman" />
