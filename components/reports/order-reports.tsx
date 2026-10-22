"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, DollarSign, Printer, Search, Timer, Users } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ملخص الطلبيات (app/api/reports/orders?view=summary): مؤشرات الطلبيات الفعلية من جدول orders — كانت الشاشة تقرأ
// جدولاً غير موجود (sales_orders) وتعرض قيماً ثابتة/عشوائية.
type Summary = {
  kpis: { orders?: number; total_value?: number; avg_value?: number; open_orders?: number; late_orders?: number; completed_orders?: number; cancelled_orders?: number; parties?: number }
  monthly: { month: string; orders: number; value: number }[]
  byStatus: { order_status: number; orders: number; value: number }[]
  topParties: { party_name: string; orders: number; value: number }[]
  topItems: { product_name: string; product_code: string; quantity: number; value: number }[]
  late: { id: number; order_number: string; order_date: string; delivery_date: string; party_name: string; order_status: number; value: number; days_late: number }[]
}

export const ORDER_TYPE_OPTIONS = [{ id: 1, name: "طلبيات المبيعات" }, { id: 2, name: "طلبيات المشتريات" }] as ReportOption[]
const STATUS_LABEL: Record<number, string> = { 1: "غير جاهزة", 2: "جاهزة", 3: "مرسلة جزئياً", 4: "مرسلة كلياً", 5: "ملغاة", 6: "مغلقة" }
const STATUS_TONE: Record<number, string> = { 1: "bg-amber-500", 2: "bg-emerald-500", 3: "bg-sky-500", 4: "bg-indigo-500", 5: "bg-rose-500", 6: "bg-slate-500" }
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const day = (value: unknown) => (value ? new Date(String(value)).toLocaleDateString("en-GB") : "—")
const yearStart = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)

function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: typeof BarChart3; tone: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold text-slate-900" dir="ltr">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><span className="h-4 w-1 rounded-full bg-emerald-500" />{title}</h3>
      {children}
    </section>
  )
}

export function OrderReports() {
  const [meta, setMeta] = useState<{ salesmen: ReportOption[]; branches: ReportOption[] }>({ salesmen: [], branches: [] })
  const [filters, setFilters] = useState({ from: yearStart(), to: today(), orderTypes: [1] as number[], salesmanIds: [] as number[], branchIds: [] as number[] })
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/reports/orders?view=summary&meta=1", { cache: "no-store" }).then((response) => response.json())
      .then((result) => setMeta({ salesmen: result.salesmen || [], branches: result.branches || [] })).catch(() => undefined)
  }, [])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ view: "summary", from_date: filters.from, to_date: filters.to, order_types: filters.orderTypes.join(","), salesman_ids: filters.salesmanIds.join(","), branch_ids: filters.branchIds.join(",") })
      const response = await fetch(`/api/reports/orders?${query}`, { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "فشل في تحميل بيانات التقارير")
      setData(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "فشل في تحميل بيانات التقارير")
    } finally { setLoading(false) }
  }, [filters])

  // تحميل أولي بالفلاتر الافتراضية
  useEffect(() => { void run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = data?.kpis || {}
  const totalStatus = (data?.byStatus || []).reduce((sum, row) => sum + Number(row.orders || 0), 0)

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={BarChart3}
        category="تقارير الطلبيات"
        title="ملخص الطلبيات"
        description="مؤشرات الطلبيات في الفترة: العدد والقيمة والمفتوح والمتأخر، الحركة الشهرية، أعلى العملاء والأصناف"
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!data}><Printer className="ml-2 h-4 w-4" />طباعة</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label="نوع الطلبيات" options={ORDER_TYPE_OPTIONS} selected={filters.orderTypes} onChange={(orderTypes) => setFilters({ ...filters, orderTypes })} placeholder="الكل" />
          <ReportMultiChoice label="المندوب" options={meta.salesmen} selected={filters.salesmanIds} onChange={(salesmanIds) => setFilters({ ...filters, salesmanIds })} placeholder="كل المندوبين" />
          <ReportMultiChoice label="الفرع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder="كل الفروع" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="ml-2 h-4 w-4" />عرض النتائج</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="عدد الطلبيات" value={String(kpis.orders || 0)} hint={`${kpis.parties || 0} عميل/مورد`} icon={ClipboardList} tone="bg-sky-100 text-sky-700" />
            <Kpi label="القيمة الإجمالية" value={money(kpis.total_value)} hint={`متوسط الطلبية ${money(kpis.avg_value)}`} icon={DollarSign} tone="bg-emerald-100 text-emerald-700" />
            <Kpi label="طلبيات مفتوحة" value={String(kpis.open_orders || 0)} hint={`مرسلة/مغلقة ${kpis.completed_orders || 0} · ملغاة ${kpis.cancelled_orders || 0}`} icon={CheckCircle2} tone="bg-indigo-100 text-indigo-700" />
            <Kpi label="طلبيات متأخرة" value={String(kpis.late_orders || 0)} hint="مفتوحة وتجاوزت تاريخ التسليم" icon={AlertTriangle} tone="bg-rose-100 text-rose-700" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Panel title="الطلبيات شهرياً">
              {data.monthly.length ? (
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.monthly.map((row) => ({ ...row, value: Number(row.value) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip formatter={(value: any) => [money(value), "القيمة"]} />
                      <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-10 text-center text-sm text-muted-foreground">لا توجد طلبيات في الفترة</p>}
            </Panel>
            <Panel title="حسب الحالة">
              <div className="space-y-3">
                {data.byStatus.length ? data.byStatus.map((row) => (
                  <div key={row.order_status}>
                    <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{STATUS_LABEL[row.order_status] || row.order_status}</span><span className="text-slate-500">{row.orders} · <span dir="ltr">{money(row.value)}</span></span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${STATUS_TONE[row.order_status] || "bg-slate-400"}`} style={{ width: `${totalStatus ? (row.orders / totalStatus) * 100 : 0}%` }} /></div>
                  </div>
                )) : <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="أعلى العملاء/الموردين قيمةً">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="p-1.5 text-right">الاسم</th><th className="p-1.5 text-center">الطلبيات</th><th className="p-1.5 text-left">القيمة</th></tr></thead>
                <tbody>{data.topParties.map((row, index) => <tr key={index} className="border-t"><td className="p-1.5"><Users className="ml-1 inline h-3.5 w-3.5 text-slate-400" />{row.party_name || "—"}</td><td className="p-1.5 text-center">{row.orders}</td><td className="p-1.5 text-left font-mono" dir="ltr">{money(row.value)}</td></tr>)}</tbody>
              </table>
            </Panel>
            <Panel title="أكثر الأصناف طلباً">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="p-1.5 text-right">الصنف</th><th className="p-1.5 text-left">الكمية</th><th className="p-1.5 text-left">القيمة</th></tr></thead>
                <tbody>{data.topItems.map((row, index) => <tr key={index} className="border-t"><td className="p-1.5">{row.product_name}<small className="mr-1 font-mono text-slate-400">{row.product_code}</small></td><td className="p-1.5 text-left font-mono" dir="ltr">{qty(row.quantity)}</td><td className="p-1.5 text-left font-mono" dir="ltr">{money(row.value)}</td></tr>)}</tbody>
              </table>
            </Panel>
          </div>

          <Panel title="الطلبيات المتأخرة (أقدم 20)">
            {data.late.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="p-1.5 text-right">رقم الطلبية</th><th className="p-1.5 text-right">العميل/المورد</th><th className="p-1.5 text-right">التاريخ</th><th className="p-1.5 text-right">تاريخ التسليم</th><th className="p-1.5 text-center">الحالة</th><th className="p-1.5 text-left">القيمة</th><th className="p-1.5 text-center">التأخير</th></tr></thead>
                  <tbody>{data.late.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-1.5 font-mono">{row.order_number}</td><td className="p-1.5">{row.party_name || "—"}</td>
                      <td className="p-1.5 font-mono text-xs" dir="ltr">{day(row.order_date)}</td><td className="p-1.5 font-mono text-xs" dir="ltr">{day(row.delivery_date)}</td>
                      <td className="p-1.5 text-center text-xs">{STATUS_LABEL[row.order_status] || row.order_status}</td>
                      <td className="p-1.5 text-left font-mono" dir="ltr">{money(row.value)}</td>
                      <td className="p-1.5 text-center"><span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700"><Timer className="h-3 w-3" />{row.days_late} يوم</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="py-6 text-center text-sm text-emerald-700">لا توجد طلبيات متأخرة 👍</p>}
          </Panel>
        </>
      )}
    </ReportPage>
  )
}
