"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Clock3, LayoutGrid, MapPin, PackageSearch, Printer, ReceiptText, Search, UserRound, type LucideIcon } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// تقارير المطاعم (app/api/reports/restaurant): مكوّن واحد بعدة أنواع — كل نوع شاشة وصلاحية مستقلة.
type View = "tables" | "orders" | "items" | "waiters" | "locations" | "hours"
type Align = "start" | "end" | "center"
type Column = { key: string; label: string; align?: Align; format?: "money" | "qty" | "int" | "datetime" | "status" | "type" | "minutes" | "hour"; sum?: boolean }

const STATUS_OPTIONS = [{ id: "paid", name: "مدفوع" }, { id: "open", name: "مفتوح" }, { id: "cancelled", name: "ملغى" }] as unknown as ReportOption[]
const TYPE_OPTIONS = [{ id: "dine_in", name: "صالة" }, { id: "takeaway", name: "سفري" }] as unknown as ReportOption[]
const STATUS_LABEL: Record<string, string> = { paid: "مدفوع", open: "مفتوح", cancelled: "ملغى" }
const STATUS_TONE: Record<string, string> = { paid: "bg-emerald-100 text-emerald-700", open: "bg-amber-100 text-amber-700", cancelled: "bg-rose-100 text-rose-700" }

const CONFIG: Record<View, { title: string; description: string; icon: LucideIcon; countLabel: string; columns: Column[] }> = {
  tables: {
    title: "تقرير الطاولات", icon: LayoutGrid, countLabel: "عدد الطاولات",
    description: "لكل طاولة: عدد مرات الاستخدام، الأشخاص، الإيراد، متوسط الطلب ومتوسط مدة الجلوس وآخر استخدام",
    columns: [
      { key: "id", label: "رقم الطاولة", align: "center" }, { key: "table_name", label: "الطاولة" }, { key: "location_name", label: "الموقع" }, { key: "branch_name", label: "الفرع" },
      { key: "seats", label: "المقاعد", align: "center", format: "int" },
      { key: "times_used", label: "مرات الاستخدام", align: "center", format: "int", sum: true },
      { key: "guests", label: "الأشخاص", align: "center", format: "int", sum: true },
      { key: "cancelled", label: "ملغاة", align: "center", format: "int", sum: true },
      { key: "revenue", label: "الإيراد", align: "end", format: "money", sum: true },
      { key: "avg_revenue", label: "متوسط الطلب", align: "end", format: "money" },
      { key: "avg_minutes", label: "متوسط المدة", align: "center", format: "minutes" },
      { key: "last_used", label: "آخر استخدام", format: "datetime" },
    ],
  },
  orders: {
    title: "طلبات المطعم تفصيلي", icon: ReceiptText, countLabel: "عدد الطلبات",
    description: "كل طلب: النوع والموقع والطاولات والأشخاص والنادل والوقت والمدة والحالة والمبلغ المدفوع والفواتير",
    columns: [
      { key: "order_no", label: "رقم الطلب" }, { key: "opened_at", label: "الفتح", format: "datetime" }, { key: "order_type", label: "النوع", format: "type" },
      { key: "location_name", label: "الموقع" }, { key: "tables", label: "الطاولات/الزبون" }, { key: "guests", label: "الأشخاص", align: "center", format: "int", sum: true },
      { key: "opened_by_name", label: "النادل" }, { key: "items", label: "الأصناف", align: "center", format: "int", sum: true },
      { key: "minutes", label: "المدة", align: "center", format: "minutes" }, { key: "status", label: "الحالة", align: "center", format: "status" },
      { key: "paid_amount", label: "المدفوع", align: "end", format: "money", sum: true }, { key: "invoices", label: "الفواتير" },
    ],
  },
  items: {
    title: "الأصناف المباعة في المطعم", icon: PackageSearch, countLabel: "عدد الأصناف",
    description: "الكميات المدفوعة وقيمتها لكل صنف مع عدد الطلبات ومتوسط السعر",
    columns: [
      { key: "product_code", label: "رمز الصنف" }, { key: "product_name", label: "الصنف" }, { key: "unit_name", label: "الوحدة" },
      { key: "orders", label: "عدد الطلبات", align: "center", format: "int", sum: true }, { key: "quantity", label: "الكمية", align: "end", format: "qty", sum: true },
      { key: "avg_price", label: "متوسط السعر", align: "end", format: "money" }, { key: "value", label: "القيمة", align: "end", format: "money", sum: true },
    ],
  },
  waiters: {
    title: "المطعم حسب النادل", icon: UserRound, countLabel: "عدد المستخدمين",
    description: "أداء كل مستخدم فتح طلبات: الطلبات والسفري والملغى والأشخاص والإيراد ومتوسط الطلب",
    columns: [
      { key: "user_name", label: "النادل/المستخدم" }, { key: "orders", label: "الطلبات", align: "center", format: "int", sum: true },
      { key: "takeaway_orders", label: "منها سفري", align: "center", format: "int", sum: true }, { key: "cancelled", label: "ملغاة", align: "center", format: "int", sum: true },
      { key: "guests", label: "الأشخاص", align: "center", format: "int", sum: true }, { key: "revenue", label: "الإيراد", align: "end", format: "money", sum: true },
      { key: "avg_revenue", label: "متوسط الطلب", align: "end", format: "money" },
    ],
  },
  locations: {
    title: "المطعم حسب الموقع", icon: MapPin, countLabel: "عدد المواقع",
    description: "لكل صالة/موقع: طلبات الصالة والسفري والملغى والأشخاص والإيراد ومتوسط الطلب والمدة",
    columns: [
      { key: "location_name", label: "الموقع" }, { key: "branch_name", label: "الفرع" }, { key: "orders", label: "الطلبات", align: "center", format: "int", sum: true },
      { key: "dine_in_orders", label: "صالة", align: "center", format: "int", sum: true }, { key: "takeaway_orders", label: "سفري", align: "center", format: "int", sum: true },
      { key: "cancelled", label: "ملغاة", align: "center", format: "int", sum: true }, { key: "guests", label: "الأشخاص", align: "center", format: "int", sum: true },
      { key: "revenue", label: "الإيراد", align: "end", format: "money", sum: true }, { key: "avg_revenue", label: "متوسط الطلب", align: "end", format: "money" },
      { key: "avg_minutes", label: "متوسط المدة", align: "center", format: "minutes" },
    ],
  },
  hours: {
    title: "أوقات الذروة في المطعم", icon: Clock3, countLabel: "ساعات العمل",
    description: "الطلبات والأشخاص والإيراد حسب ساعة فتح الطلب — لمعرفة أوقات الضغط",
    columns: [
      { key: "hour", label: "الساعة", format: "hour" }, { key: "orders", label: "الطلبات", align: "center", format: "int", sum: true },
      { key: "guests", label: "الأشخاص", align: "center", format: "int", sum: true }, { key: "revenue", label: "الإيراد", align: "end", format: "money", sum: true },
      { key: "avg_revenue", label: "متوسط الطلب", align: "end", format: "money" },
    ],
  },
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const dateTime = (value: unknown) => (value ? new Date(String(value)).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—")
const minutes = (value: unknown) => {
  if (value === null || value === undefined) return "—"
  const total = Number(value)
  return total >= 60 ? `${Math.floor(total / 60)}س ${total % 60}د` : `${total}د`
}
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`
const today = () => new Date().toISOString().slice(0, 10)
const alignClass = (align?: Align) => (align === "end" ? "text-left" : align === "center" ? "text-center" : "text-right")

function cell(column: Column, row: Record<string, any>, maxRevenue: number) {
  const value = row[column.key]
  switch (column.format) {
    case "money": {
      // شريط بصري للإيراد مقارنة بأعلى قيمة في التقرير
      const share = column.key === "revenue" && maxRevenue > 0 ? Math.round((Number(value || 0) / maxRevenue) * 100) : null
      return (
        <span className="inline-flex flex-col items-end gap-1">
          <span dir="ltr" className="font-mono">{money(value)}</span>
          {share !== null && <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-l from-emerald-500 to-cyan-500" style={{ width: `${share}%` }} /></span>}
        </span>
      )
    }
    case "qty": return <span dir="ltr" className="font-mono">{qty(value)}</span>
    case "int": return <span className="font-mono">{Number(value || 0)}</span>
    case "datetime": return <span dir="ltr" className="font-mono text-xs">{dateTime(value)}</span>
    case "minutes": return <span className="font-mono text-xs">{minutes(value)}</span>
    case "hour": return <span dir="ltr" className="font-mono">{String(value).padStart(2, "0")}:00 – {String((Number(value) + 1) % 24).padStart(2, "0")}:00</span>
    case "type": return value === "takeaway" ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">سفري</span> : "صالة"
    case "status": return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[String(value)] || "bg-slate-100"}`}>{STATUS_LABEL[String(value)] || value}</span>
    default: return value === null || value === undefined || value === "" ? "—" : String(value)
  }
}

export function RestaurantReport({ view }: { view: View }) {
  const config = CONFIG[view]
  const [meta, setMeta] = useState<{ locations: ReportOption[]; branches: ReportOption[]; users: ReportOption[] }>({ locations: [], branches: [], users: [] })
  const [filters, setFilters] = useState({
    from: monthStart(), to: today(), locationIds: [] as number[], branchIds: [] as number[],
    statuses: [] as string[], orderTypes: [] as string[], userIds: [] as string[],
  })
  const [rows, setRows] = useState<Record<string, any>[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/reports/restaurant?view=${view}&meta=1`, { cache: "no-store" }).then((response) => response.json())
      .then((data) => setMeta({ locations: data.locations || [], branches: data.branches || [], users: data.users || [] })).catch(() => undefined)
  }, [view])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({
        view, from_date: filters.from, to_date: filters.to, location_ids: filters.locationIds.join(","), branch_ids: filters.branchIds.join(","),
        statuses: filters.statuses.join(","), order_types: filters.orderTypes.join(","), user_ids: filters.userIds.join(","),
      })
      const response = await fetch(`/api/reports/restaurant?${query}`, { cache: "no-store" })
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
  const maxRevenue = useMemo(() => Math.max(0, ...(rows || []).map((row) => Number(row.revenue || 0))), [rows])
  const valueKey = view === "items" ? "value" : view === "orders" ? "paid_amount" : "revenue"
  const countKey = view === "tables" ? "times_used" : view === "items" ? "quantity" : "orders"
  const Icon = config.icon
  const hasData = Boolean(rows?.length)
  const average = countKey in totals && totals[countKey] > 0 && view !== "items" ? totals[valueKey] / totals[countKey] : null

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Icon}
        category="تقارير المطاعم"
        title={config.title}
        description={config.description}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="ml-2 h-4 w-4" />طباعة</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label="الموقع" options={meta.locations} selected={filters.locationIds} onChange={(locationIds) => setFilters({ ...filters, locationIds })} placeholder="كل المواقع" />
          <ReportMultiChoice label="الفرع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder="كل الفروع" />
          {view !== "tables" && <ReportMultiChoice label="نوع الطلب" options={TYPE_OPTIONS} selected={filters.orderTypes as any} onChange={(orderTypes: any) => setFilters({ ...filters, orderTypes })} placeholder="صالة وسفري" />}
          <ReportMultiChoice label="حالة الطلب" options={STATUS_OPTIONS} selected={filters.statuses as any} onChange={(statuses: any) => setFilters({ ...filters, statuses })} placeholder="كل الحالات" />
          <ReportMultiChoice label="النادل/المستخدم" options={meta.users} selected={filters.userIds as any} onChange={(userIds: any) => setFilters({ ...filters, userIds })} placeholder="الكل" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="ml-2 h-4 w-4" />عرض النتائج</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportSummaryCard label={config.countLabel}>{String(rows.length)}</ReportSummaryCard>
            {countKey in totals && <ReportSummaryCard label={view === "tables" ? "إجمالي مرات الاستخدام" : view === "items" ? "إجمالي الكمية" : "إجمالي الطلبات"}>{view === "items" ? qty(totals[countKey]) : String(totals[countKey])}</ReportSummaryCard>}
            {valueKey in totals && <ReportSummaryCard label="إجمالي الإيراد">{money(totals[valueKey])}</ReportSummaryCard>}
            {average !== null && <ReportSummaryCard label="متوسط الطلب">{money(average)}</ReportSummaryCard>}
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>{config.columns.map((column) => <th key={column.key} className={`whitespace-nowrap p-2 ${alignClass(column.align)}`}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={config.columns.length} className="p-8 text-center text-muted-foreground">لا توجد بيانات للفترة والفلاتر المحددة</td></tr>
                  : rows.map((row, index) => (
                    <tr key={index} className="border-t hover:bg-emerald-50/40">
                      {config.columns.map((column) => <td key={column.key} className={`p-2 ${alignClass(column.align)}`}>{cell(column, row, maxRevenue)}</td>)}
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

export const RestaurantTablesReport = () => <RestaurantReport view="tables" />
export const RestaurantOrdersReport = () => <RestaurantReport view="orders" />
export const RestaurantItemsReport = () => <RestaurantReport view="items" />
export const RestaurantWaitersReport = () => <RestaurantReport view="waiters" />
export const RestaurantLocationsReport = () => <RestaurantReport view="locations" />
export const RestaurantHoursReport = () => <RestaurantReport view="hours" />
