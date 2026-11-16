"use client"
import { tr, appDir } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { listYearStart, listToday } from "@/components/common/voucher-list-table"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Gauge, Loader2, PieChart as PieIcon, Printer, RefreshCw, TrendingUp, Users2 } from "lucide-react"

// لوحات «تقارير احصائية»: رسوم بيانية (recharts) لا جداول — البيانات من app/api/reports/dashboards/route.ts.
// الألوان أدوار (CSS vars بـ .viz-root في globals.css) بفاتح/داكن؛ الفئات بترتيب ثابت: 1 أزرق، 2 برتقالي، 3 أخضر مائي.

type Kind = "cash" | "sales" | "receivables"
const money = amountNumberFormat("en-US")
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const pct = (value: number | null | undefined) => (value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`)
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const monthLabel = (month: string) => `${tr(MONTHS[Number(month.slice(5, 7)) - 1] || month)} ${month.slice(2, 4)}`
const S1 = "var(--viz-series-1)", S2 = "var(--viz-series-2)", S3 = "var(--viz-series-3)"
const AXIS = { stroke: "var(--viz-axis)", fontSize: 11, tickLine: false } as const

// ── قطع مشتركة ──
function Card({ title, subtitle, children, className = "", legend }: { title: string; subtitle?: string; children: ReactNode; className?: string; legend?: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <section className={`viz-card flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100">{tr(title)}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{tr(subtitle)}</p>}
        </div>
        {legend && (
          <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.dashed ? "transparent" : item.color, border: item.dashed ? `2px dashed ${item.color}` : undefined }} />
                {tr(item.label)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

function Kpi({ label, value, hint, tone, icon: Icon }: { label: string; value: string; hint?: ReactNode; tone?: "good" | "bad" | "warn"; icon?: any }) {
  const toneClass = tone === "good" ? "text-emerald-700 dark:text-emerald-400" : tone === "bad" ? "text-rose-700 dark:text-rose-400" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
  return (
    <div className="report-summary-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-2">
        <p className="report-summary-label text-xs font-semibold text-slate-500 dark:text-slate-400">{tr(label)}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
      </div>
      <p className="report-summary-value mt-1 text-2xl font-black tabular-nums text-slate-900 dark:text-slate-50" dir="ltr">{value}</p>
      {hint && <p className={`mt-1 text-xs font-semibold ${toneClass}`}>{hint}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label, labelFormat }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900" dir={appDir()}>
      <p className="mb-1 font-bold text-slate-900 dark:text-slate-100">{labelFormat ? labelFormat(label, payload) : label}</p>
      {payload.filter((item: any) => item.value != null).map((item: any) => (
        <p key={item.dataKey} className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: item.color || item.fill || item.stroke }} />{item.name}</span>
          <b className="tabular-nums text-slate-900 dark:text-slate-100" dir="ltr">{money.format(Number(item.value))}</b>
        </p>
      ))}
    </div>
  )
}

const Empty = () => <div className="grid h-full min-h-40 place-items-center text-sm text-slate-400">{tr("لا توجد بيانات بالفترة")}</div>
const grid = <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
const yAxis = (width = 56) => <YAxis {...AXIS} axisLine={false} width={width} tickFormatter={(value) => compact.format(Number(value))} />
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0]

/** أشرطة أفقية مرتّبة (أعلى العملاء/الأصناف/المدينين) بتسميات عربية على اليمين */
function RankBars({ rows, dataKey, name, color, height = 300, extra }: { rows: any[]; dataKey: string; name: string; color: string; height?: number; extra?: { dataKey: string; name: string; color: string } }) {
  if (!rows.length) return <Empty />
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
          <XAxis type="number" {...AXIS} axisLine={false} tickFormatter={(value) => compact.format(Number(value))} />
          <YAxis type="category" dataKey="name" orientation="right" width={150} {...AXIS} axisLine={false} tick={{ fill: "var(--viz-text)", fontSize: 11 }} tickFormatter={(value) => String(value).length > 22 ? `${String(value).slice(0, 21)}…` : value} />
          <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip />} />
          <Bar dataKey={dataKey} name={tr(name)} fill={color} radius={[0, 4, 4, 0]} stackId={extra ? "s" : undefined} maxBarSize={18} />
          {extra && <Bar dataKey={extra.dataKey} name={tr(extra.name)} fill={extra.color} radius={[0, 4, 4, 0]} stackId="s" maxBarSize={18} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── الإطار: فلاتر + تحميل ──
const TITLES: Record<Kind, { title: string; description: string; icon: any }> = {
  cash: { title: "لوحة التدفق النقدي والسيولة", description: "المقبوضات والمصروفات شهرياً، طرق الدفع، الشيكات المستحقة قريباً، وأرصدة الصناديق والبنوك", icon: Banknote },
  sales: { title: "لوحة تحليل المبيعات والربحية", description: "صافي المبيعات ومجمل الربح والهامش، المقارنة مع السنة السابقة، وأفضل العملاء والأصناف والفروع", icon: TrendingUp },
  receivables: { title: "لوحة الذمم والتحصيل", description: "أرصدة الذمم وأعمارها، أكبر المدينين مقابل سقف الدين، والمبيعات الآجلة مقابل التحصيلات", icon: Users2 },
}

function DashboardShell({ kind, children }: { kind: Kind; children: (data: any) => ReactNode }) {
  const meta = TITLES[kind]
  const [filters, setFilters] = useState({ from: listYearStart(), to: listToday(), branchIds: [] as number[] })
  const [branches, setBranches] = useState<ReportOption[]>([])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (withMeta = false) => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams({ kind, from_date: filters.from, to_date: filters.to })
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (withMeta) params.set("meta", "1")
      const response = await fetch(`/api/reports/dashboards?${params}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل اللوحة"))
      if (body.meta?.branches) setBranches(body.meta.branches)
      setData(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل اللوحة"))
    } finally {
      setLoading(false)
    }
  }, [kind, filters])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true) }, [kind])

  return (
    <ReportPage loading={loading}>
      <ReportHeader icon={meta.icon} category={tr("تقارير احصائية")} title={<>{tr(meta.title)}</>} description={<>{tr(meta.description)}</>}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!data}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>} />
      <div className="report-filters flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="space-y-1.5"><Label>{tr("من تاريخ")}</Label><Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="w-44 rounded-xl" /></div>
        <div className="space-y-1.5"><Label>{tr("إلى تاريخ")}</Label><Input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="w-44 rounded-xl" /></div>
        <div className="w-64"><ReportMultiChoice label={tr("الفروع")} options={branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder={tr("جميع الفروع المتاحة")} /></div>
        <Button data-report-apply onClick={() => void load()} disabled={loading} className="rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
          {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <RefreshCw className="me-2 h-4 w-4" />}{tr("تحديث")}
        </Button>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="viz-root flex flex-col gap-4">{data ? children(data) : !error && <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>}</div>
    </ReportPage>
  )
}

// ── 1) التدفق النقدي ──
export function CashFlowDashboard() {
  return <DashboardShell kind="cash">{(data) => {
    const k = data.kpis
    const methodNames: Record<string, string> = { cash: "نقدي", cheques: "شيكات", cards: "بطاقات" }
    const methods = (data.methods || []).map((row: any) => ({ ...row, name: tr(methodNames[row.key]) }))
    const balances = (data.balances || []).slice(0, 10).map((row: any) => ({ ...row, name: `${row.name}` }))
    return <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="المقبوضات" value={money.format(k.inflow)} icon={ArrowDownRight} hint={tr("سندات قبض + مبيعات نقدية")} />
        <Kpi label="المصروفات" value={money.format(k.outflow)} icon={ArrowUpRight} hint={tr("سندات صرف + مشتريات نقدية")} />
        <Kpi label="صافي التدفق" value={money.format(k.net)} icon={Gauge} tone={k.net >= 0 ? "good" : "bad"} hint={k.net >= 0 ? tr("فائض نقدي بالفترة") : tr("عجز نقدي بالفترة")} />
        <Kpi label="السيولة (صناديق + بنوك)" value={money.format(k.liquidity)} icon={Banknote} hint={tr("شيكات واردة خلال 12 أسبوعاً: {0}", money.format(k.cheques_in_12w))} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="المقبوضات مقابل المصروفات شهرياً" subtitle="الخط: صافي التدفق" legend={[{ label: "المقبوضات", color: S1 }, { label: "المصروفات", color: S2 }, { label: "الصافي", color: S3 }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.monthly} barGap={2}>
              {grid}<XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip labelFormat={monthLabel} />} />
              <Bar dataKey="inflow" name={tr("المقبوضات")} fill={S1} radius={BAR_RADIUS} maxBarSize={22} />
              <Bar dataKey="outflow" name={tr("المصروفات")} fill={S2} radius={BAR_RADIUS} maxBarSize={22} />
              <Line dataKey="net" name={tr("الصافي")} stroke={S3} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }} />
            </ComposedChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="حسب طريقة الدفع" legend={[{ label: "مقبوضات", color: S1 }, { label: "مصروفات", color: S2 }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={methods} barGap={2}>
              {grid}<XAxis dataKey="name" {...AXIS} tick={{ fill: "var(--viz-text)", fontSize: 12 }} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip />} />
              <Bar dataKey="inflow" name={tr("مقبوضات")} fill={S1} radius={BAR_RADIUS} maxBarSize={28} />
              <Bar dataKey="outflow" name={tr("مصروفات")} fill={S2} radius={BAR_RADIUS} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="الشيكات المستحقة خلال 12 أسبوعاً" subtitle="واردة بالصندوق/برسم التحصيل وصادرة لم تُصرف — حسب أسبوع الاستحقاق" legend={[{ label: "واردة", color: S1 }, { label: "صادرة", color: S2 }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.cheques} barGap={2}>
              {grid}<XAxis dataKey="week" {...AXIS} tickFormatter={(value) => String(value).slice(5).replace("-", "/")} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip labelFormat={(value: string) => `${tr("أسبوع يبدأ")} ${value}`} />} />
              <Bar dataKey="incoming" name={tr("واردة")} fill={S1} radius={BAR_RADIUS} maxBarSize={20} />
              <Bar dataKey="outgoing" name={tr("صادرة")} fill={S2} radius={BAR_RADIUS} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="أرصدة الصناديق والبنوك" subtitle="حتى نهاية الفترة — أعلى 10 حسابات">
          <RankBars rows={balances} dataKey="balance" name="الرصيد" color={S1} height={288} />
        </Card>
      </div>
    </>
  }}</DashboardShell>
}

// ── 2) المبيعات والربحية ──
export function SalesDashboard() {
  return <DashboardShell kind="sales">{(data) => {
    const k = data.kpis
    const weekdays = (data.weekdays || []).map((row: any) => ({ ...row, name: tr(WEEKDAYS[row.day]) }))
    return <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="صافي المبيعات" value={money.format(k.sales)} icon={TrendingUp} tone={k.growth == null ? undefined : k.growth >= 0 ? "good" : "bad"}
          hint={k.growth == null ? tr("لا مبيعات بنفس الفترة من السنة السابقة") : `${pct(k.growth)} ${tr("عن نفس الفترة من السنة السابقة")}`} />
        <Kpi label="مجمل الربح" value={money.format(k.profit)} icon={Gauge} tone={k.profit >= 0 ? "good" : "bad"} hint={`${tr("هامش")} ${k.margin.toFixed(1)}%`} />
        <Kpi label="عدد الفواتير" value={k.invoices.toLocaleString("en-US")} icon={PieIcon} hint={`${tr("متوسط الفاتورة")} ${money.format(k.average_invoice)}`} />
        <Kpi label="المرتجعات" value={money.format(k.returns)} icon={ArrowDownRight} tone={k.returns > 0 ? "warn" : undefined} hint={`${k.returns_count} ${tr("مرتجع")}`} />
        <Kpi label="جودة الكلفة" value={k.unpriced_lines ? `${k.unpriced_lines}` : "✓"} icon={AlertTriangle} tone={k.unpriced_lines ? "warn" : "good"}
          hint={k.unpriced_lines ? tr("أسطر بلا كلفة — الربح أعلى من الحقيقي") : tr("كل الأسطر مسعّرة بالكلفة")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="المبيعات: هذه الفترة مقابل السنة السابقة" subtitle="صافي الفواتير (مبيعات − مرتجعات)" legend={[{ label: "هذه الفترة", color: S1 }, { label: "السنة السابقة", color: S2, dashed: true }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly}>
              {grid}<XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />{yAxis()}
              <Tooltip content={<ChartTooltip labelFormat={monthLabel} />} />
              <Line dataKey="invoiced" name={tr("هذه الفترة")} stroke={S1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }} />
              <Line dataKey="previous_year" name={tr("السنة السابقة")} stroke={S2} strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="المبيعات ومجمل الربح شهرياً" subtitle="قبل الضريبة، الكلفة بالمعدل" legend={[{ label: "المبيعات", color: S1 }, { label: "مجمل الربح", color: S3 }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} barGap={2}>
              {grid}<XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip labelFormat={monthLabel} />} />
              <Bar dataKey="sales" name={tr("المبيعات")} fill={S1} radius={BAR_RADIUS} maxBarSize={22} />
              <Bar dataKey="profit" name={tr("مجمل الربح")} fill={S3} radius={BAR_RADIUS} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="أفضل 10 عملاء" subtitle="حسب صافي المبيعات" legend={[{ label: "الكلفة", color: S2 }, { label: "مجمل الربح", color: S3 }]}>
          <RankBars rows={(data.customers || []).map((row: any) => ({ ...row, profit_part: Math.max(row.profit, 0), cost_part: Math.max(row.sales - Math.max(row.profit, 0), 0) }))} dataKey="cost_part" name="الكلفة" color={S2} extra={{ dataKey: "profit_part", name: "مجمل الربح", color: S3 }} height={320} />
        </Card>
        <Card title="أفضل 10 أصناف" subtitle="حسب صافي المبيعات" legend={[{ label: "الكلفة", color: S2 }, { label: "مجمل الربح", color: S3 }]}>
          <RankBars rows={(data.items || []).map((row: any) => ({ ...row, profit_part: Math.max(row.profit, 0), cost_part: Math.max(row.sales - Math.max(row.profit, 0), 0) }))} dataKey="cost_part" name="الكلفة" color={S2} extra={{ dataKey: "profit_part", name: "مجمل الربح", color: S3 }} height={320} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="المبيعات حسب أيام الأسبوع" legend={[{ label: "المبيعات", color: S1 }, { label: "مجمل الربح", color: S3 }]}>
          <div className="h-64" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdays} barGap={2}>
              {grid}<XAxis dataKey="name" {...AXIS} tick={{ fill: "var(--viz-text)", fontSize: 11 }} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip />} />
              <Bar dataKey="sales" name={tr("المبيعات")} fill={S1} radius={BAR_RADIUS} maxBarSize={26} />
              <Bar dataKey="profit" name={tr("مجمل الربح")} fill={S3} radius={BAR_RADIUS} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="المبيعات حسب الفرع">
          <RankBars rows={data.branches || []} dataKey="sales" name="المبيعات" color={S1} height={256} />
        </Card>
      </div>
    </>
  }}</DashboardShell>
}

// ── 3) الذمم والتحصيل ──
// التعمير لون واحد متدرّج (الأحدث فاتح ← الأقدم داكن): مقدار لا هويّة
const AGING_STEPS = ["var(--viz-seq-1)", "var(--viz-seq-2)", "var(--viz-seq-3)", "var(--viz-seq-4)", "var(--viz-seq-5)"]

export function ReceivablesDashboard() {
  return <DashboardShell kind="receivables">{(data) => {
    const k = data.kpis
    const debtors = (data.top_debtors || []).map((row: any) => ({ ...row, current: Math.max(row.balance - row.overdue, 0) }))
    return <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="الذمم المدينة" value={money.format(k.receivables)} icon={Users2} hint={`${k.debtors} ${tr("ذمة مدينة")} · ${tr("دائنة")} ${money.format(k.payables)}`} />
        <Kpi label="متأخر أكثر من 60 يوماً" value={money.format(k.overdue)} icon={AlertTriangle} tone={k.overdue_share > 30 ? "bad" : k.overdue_share > 10 ? "warn" : "good"} hint={`${k.overdue_share.toFixed(1)}% ${tr("من الذمم")}`} />
        <Kpi label="متوسط فترة التحصيل (DSO)" value={k.dso == null ? "—" : k.dso > 365 ? `+365 ${tr("يوم")}` : `${k.dso} ${tr("يوم")}`} icon={Gauge}
          tone={k.dso == null ? undefined : k.dso <= 45 ? "good" : k.dso <= 90 ? "warn" : "bad"} hint={tr("الذمم ÷ متوسط الحركات المدينة اليومية")} />
        <Kpi label="نسبة التحصيل" value={k.collection_rate == null ? "—" : `${k.collection_rate.toFixed(1)}%`} icon={TrendingUp} tone={k.collection_rate == null ? undefined : k.collection_rate >= 90 ? "good" : k.collection_rate >= 70 ? "warn" : "bad"} hint={tr("المقبوضات ÷ (رصيد أول المدة + الحركات المدينة)")} />
        <Kpi label="تجاوز سقف الدين" value={String(k.over_limit)} icon={AlertTriangle} tone={k.over_limit ? "bad" : "good"} hint={k.over_limit ? tr("ذمم رصيدها أعلى من سقفها") : tr("لا تجاوزات")} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="أعمار الذمم المدينة" subtitle="بالأيام حتى نهاية الفترة">
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.aging}>
              {grid}<XAxis dataKey="label" {...AXIS} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip labelFormat={(value: string) => `${value} ${tr("يوم")}`} />} />
              <Bar dataKey="amount" name={tr("الرصيد")} radius={BAR_RADIUS} maxBarSize={44}>
                {(data.aging || []).map((_: any, index: number) => <Cell key={index} fill={AGING_STEPS[index] || AGING_STEPS[4]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card className="xl:col-span-2" title="المبيعات الآجلة مقابل التحصيلات" subtitle="شهرياً — فواتير وسندات قبض الذمم" legend={[{ label: "مبيعات آجلة", color: S2 }, { label: "تحصيلات", color: S1 }]}>
          <div className="h-72" dir="ltr"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.monthly} barGap={2}>
              {grid}<XAxis dataKey="month" {...AXIS} tickFormatter={monthLabel} />{yAxis()}
              <Tooltip cursor={{ fill: "var(--viz-hover)" }} content={<ChartTooltip labelFormat={monthLabel} />} />
              <Bar dataKey="credit_sales" name={tr("مبيعات آجلة")} fill={S2} radius={BAR_RADIUS} maxBarSize={22} />
              <Bar dataKey="collections" name={tr("تحصيلات")} fill={S1} radius={BAR_RADIUS} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <Card title="أكبر 10 مدينين" subtitle="الرصيد مقسوماً: حديث (حتى 60 يوماً) ومتأخر" legend={[{ label: "حديث", color: S1 }, { label: "متأخر +60", color: S2 }]}>
        <RankBars rows={debtors} dataKey="current" name="حديث" color={S1} extra={{ dataKey: "overdue", name: "متأخر +60", color: S2 }} height={340} />
        {debtors.some((row: any) => row.credit_limit && row.balance > row.credit_limit) && (
          <p className="mt-2 flex flex-wrap gap-2 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" />{tr("تجاوز السقف:")}
            {debtors.filter((row: any) => row.credit_limit && row.balance > row.credit_limit).map((row: any) => <span key={row.id} className="rounded-full bg-rose-50 px-2 dark:bg-rose-950">{row.name} ({money.format(row.balance)} / {money.format(row.credit_limit)})</span>)}
          </p>
        )}
      </Card>
    </>
  }}</DashboardShell>
}
