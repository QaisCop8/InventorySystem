"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardList, Clock3, CreditCard,
  FilePlus, Flame, Layers3, Minus, Package, Receipt, RefreshCw, ShoppingBag, ShoppingCart, Sparkles, TrendingUp, Trophy, UserPlus, Users2, Wallet2,
} from "lucide-react"
import { QuickSalesOrder } from "@/components/quick-sales-order"
import { useAuth } from "@/components/auth/auth-context"
import { cn } from "@/lib/utils"

interface WelcomeDashboardProps {
  onOpenSection?: (section: string) => void
}

type Overview = {
  generatedAt: string
  scope: { all: boolean; branches: { id: number; name: string }[]; canSwitch: boolean }
  currency: { code: string; name: string } | null
  kpis: {
    salesToday: number; invoicesToday: number; salesYesterday: number; salesMonth: number; grossSalesMonth: number; returnsMonth: number
    salesPrevPeriod: number; invoicesMonth: number; purchasesMonth: number; purchasesPrevPeriod: number; receiptsMonth: number; paymentsMonth: number
  }
  daily: { date: string; sales: number; purchases: number; receipts: number; invoices: number }[]
  monthly: { month: string; sales: number; purchases: number; receipts: number }[]
  topProducts: { name: string; code: string | null; quantity: number; revenue: number }[]
  topCustomers: { name: string; code: string | null; invoices: number; revenue: number }[]
  byBranch: { name: string; sales: number; invoices: number }[]
  hours: { hour: number; invoices: number; sales: number }[]
  recent: { id: number; vch_type: number; type_name: string; code: string; date: string; status: number; amount: number; party: string | null }[]
  pending: { vch_type: number; type_name: string; count: number; amount: number }[]
}

const SECTION_BY_TYPE: Record<number, string> = {
  3: "journal-vouchers", 4: "receipt-vouchers", 5: "payment-vouchers", 6: "credit-notes", 7: "debit-notes", 8: "stock-in-vouchers",
  9: "stock-out-vouchers", 10: "internal-delivery-vouchers", 11: "use-vouchers", 12: "sales-invoices", 13: "sales-delivery",
  14: "delivery-consignment-sale", 15: "return-delivery-consignment-sale", 16: "return-sell", 17: "purchase-invoices",
  18: "delivery-pay", 19: "return-purchase", 21: "cheque-payment-vouchers",
}
const TYPE_TONE: Record<number, string> = { 12: "bg-emerald-500", 16: "bg-rose-500", 17: "bg-indigo-500", 19: "bg-violet-500", 4: "bg-sky-500", 5: "bg-amber-500", 21: "bg-amber-500", 3: "bg-slate-500" }
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
const DONUT = ["#0d9488", "#6366f1", "#f59e0b", "#e11d48", "#0ea5e9", "#a855f7"]

const fmt = (value: number, digits = 0) => new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value || 0)
const compact = (value: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0)
const pctChange = (current: number, previous: number) => (previous > 0 ? ((current - previous) / previous) * 100 : null)
const dayLabel = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(d)}/${Number(m)}` }
const monthLabel = (key: string) => MONTHS[Number(key.split("-")[1]) - 1] ?? key
const timeAgo = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  if (date.getHours() === 0 && date.getMinutes() === 0) return iso.slice(0, 10)
  if (minutes < 1) return "الآن"
  if (minutes < 60) return `منذ ${minutes} د`
  if (minutes < 1440) return `منذ ${Math.round(minutes / 60)} س`
  return iso.slice(0, 10)
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? "صباح الخير" : hour < 18 ? "مساء الخير" : "مساء النور"
}

function Delta({ value, inverse = false, suffix = "عن الفترة نفسها من الشهر الماضي" }: { value: number | null; inverse?: boolean; suffix?: string }) {
  if (value === null) return <span className="text-[11px] text-slate-400">لا توجد بيانات للمقارنة</span>
  const up = value > 0.5, down = value < -0.5
  const good = inverse ? down : up
  const bad = inverse ? up : down
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus
  return <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold", good ? "bg-emerald-50 text-emerald-700" : bad ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600")} dir="ltr">
      <Icon className="h-3 w-3" />{Math.abs(value).toFixed(1)}%
    </span>{suffix}
  </span>
}

function Panel({ title, icon, action, children, className }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-5 dark:border-slate-800 dark:bg-slate-900", className)}>
    <header className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-black text-slate-800 dark:text-slate-100"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{icon}</span>{title}</h3>
      {action}
    </header>
    {children}
  </section>
}

function Empty({ text }: { text: string }) {
  return <div className="grid flex-1 place-items-center py-8 text-center text-sm text-slate-400">{text}</div>
}

function ChartTooltip({ active, payload, label, currency, labels }: any) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" dir="rtl">
    <p className="mb-1 font-bold text-slate-700 dark:text-slate-200">{label}</p>
    {payload.map((entry: any) => <p key={entry.dataKey} className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />{labels?.[entry.dataKey] ?? entry.name}</span>
      <b dir="ltr" className="text-slate-800 dark:text-slate-100">{fmt(entry.value, 2)} {currency}</b>
    </p>)}
  </div>
}

function KpiCard({ title, value, currency, icon, tone, footer, spark, sparkKey }: {
  title: string; value: string; currency?: string; icon: ReactNode; tone: string; footer: ReactNode; spark?: any[]; sparkKey?: string
}) {
  return <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{title}</p>
        <p className="mt-2 truncate text-[26px] font-black leading-none tracking-tight text-slate-900 dark:text-white" dir="ltr">{value}{currency && <span className="mr-1 text-xs font-bold text-slate-400"> {currency}</span>}</p>
      </div>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm", tone)}>{icon}</span>
    </div>
    <div className="mt-3 min-h-[20px]">{footer}</div>
    {spark && sparkKey && <div className="pointer-events-none mt-2 h-10" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs><linearGradient id={`spark-${sparkKey}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity={0.25} /><stop offset="100%" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>
          <Area type="monotone" dataKey={sparkKey} stroke="currentColor" strokeWidth={2} fill={`url(#spark-${sparkKey})`} className="text-teal-600" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>}
  </article>
}

export default function WelcomeDashboard({ onOpenSection }: WelcomeDashboardProps) {
  const { user } = useAuth()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [scopeAll, setScopeAll] = useState(false)
  const [range, setRange] = useState<"30d" | "12m">("30d")
  const [company, setCompany] = useState("")
  const [showQuickOrder, setShowQuickOrder] = useState(false)

  const load = useCallback(async (all = scopeAll) => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/dashboard/overview${all ? "?scope=all" : ""}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "تعذر تحميل البيانات")
      setData(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل البيانات")
    } finally {
      setLoading(false)
    }
  }, [scopeAll])

  useEffect(() => { void load(scopeAll) }, [scopeAll, load])

  useEffect(() => {
    let active = true
    const apply = (payload: any) => { const settings = payload?.settings ?? payload; if (active && settings) setCompany(String(settings.company_name ?? "").trim()) }
    fetch("/api/settings/system", { cache: "no-store" }).then(response => (response.ok ? response.json() : null)).then(apply).catch(() => undefined)
    const onUpdate = (event: Event) => apply((event as CustomEvent).detail)
    window.addEventListener("system-settings-updated", onUpdate)
    return () => { active = false; window.removeEventListener("system-settings-updated", onUpdate) }
  }, [])

  const currency = data?.currency?.code ?? ""
  const k = data?.kpis
  const trend = useMemo(() => {
    if (!data) return []
    return range === "30d"
      ? data.daily.map(row => ({ ...row, label: dayLabel(row.date) }))
      : data.monthly.map(row => ({ ...row, label: monthLabel(row.month) }))
  }, [data, range])
  const salesChange = k ? pctChange(k.salesMonth, k.salesPrevPeriod) : null
  const purchasesChange = k ? pctChange(k.purchasesMonth, k.purchasesPrevPeriod) : null
  const todayChange = k ? pctChange(k.salesToday, k.salesYesterday) : null
  const netCash = k ? k.receiptsMonth - k.paymentsMonth : 0
  const returnsRatio = k && k.grossSalesMonth > 0 ? (k.returnsMonth / k.grossSalesMonth) * 100 : 0
  const avgTicket = k && k.invoicesMonth > 0 ? k.grossSalesMonth / k.invoicesMonth : 0
  const maxProduct = Math.max(1, ...(data?.topProducts ?? []).map(row => row.revenue))
  const maxCustomer = Math.max(1, ...(data?.topCustomers ?? []).map(row => row.revenue))
  const hours = useMemo(() => {
    const byHour = new Map((data?.hours ?? []).map(row => [row.hour, row]))
    return Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${hour}`, invoices: byHour.get(hour)?.invoices ?? 0, sales: byHour.get(hour)?.sales ?? 0 }))
  }, [data])
  const peak = hours.reduce((best, row) => (row.invoices > best.invoices ? row : best), { hour: -1, invoices: 0, sales: 0, label: "" })
  const branchTotal = (data?.byBranch ?? []).reduce((sum, row) => sum + row.sales, 0)

  const insights = useMemo(() => {
    if (!k) return []
    const list: { tone: "good" | "warn" | "bad" | "info"; title: string; text: string; section?: string }[] = []
    if (salesChange !== null) list.push(salesChange >= 0
      ? { tone: "good", title: "نمو المبيعات", text: `صافي المبيعات أعلى بنسبة ${salesChange.toFixed(1)}% من الفترة نفسها في الشهر الماضي` }
      : { tone: "bad", title: "تراجع المبيعات", text: `صافي المبيعات أقل بنسبة ${Math.abs(salesChange).toFixed(1)}% من الفترة نفسها في الشهر الماضي` })
    if (returnsRatio >= 5) list.push({ tone: returnsRatio >= 10 ? "bad" : "warn", title: "نسبة المرتجعات", text: `المرتجعات ${returnsRatio.toFixed(1)}% من مبيعات الشهر (${fmt(k.returnsMonth, 2)} ${currency})`, section: "return-sell" })
    if (netCash < 0) list.push({ tone: "warn", title: "التدفق النقدي سالب", text: `المدفوعات تتجاوز المقبوضات هذا الشهر بمقدار ${fmt(Math.abs(netCash), 2)} ${currency}` })
    if (peak.invoices > 0) list.push({ tone: "info", title: "ساعة الذروة", text: `أكثر ساعة بيعاً خلال 30 يوماً: ${peak.hour}:00 – ${peak.hour + 1}:00 (${peak.invoices} فاتورة)` })
    if (!list.length) list.push({ tone: "good", title: "كل شيء على ما يرام", text: "لا توجد مؤشرات تحتاج انتباهك الآن" })
    return list
  }, [k, salesChange, returnsRatio, netCash, peak, currency])

  const actions: { label: string; icon: typeof UserPlus; tone: string; section?: string; onClick?: () => void }[] = [
    { label: "فاتورة مبيعات", section: "sales-invoices", icon: FilePlus, tone: "text-emerald-600 bg-emerald-50" },
    { label: "طلبية سريعة", icon: ShoppingCart, tone: "text-orange-600 bg-orange-50", onClick: () => setShowQuickOrder(true) },
    { label: "نقطة البيع", section: "pos-cashier", icon: ShoppingBag, tone: "text-teal-600 bg-teal-50" },
    { label: "سند قبض", section: "receipt-vouchers", icon: Receipt, tone: "text-sky-600 bg-sky-50" },
    { label: "سند صرف", section: "payment-vouchers", icon: CreditCard, tone: "text-amber-600 bg-amber-50" },
    { label: "فاتورة مشتريات", section: "purchase-invoices", icon: Package, tone: "text-indigo-600 bg-indigo-50" },
    { label: "عميل جديد", section: "customers", icon: UserPlus, tone: "text-violet-600 bg-violet-50" },
    { label: "طلب داخلي", section: "internal-manufacturing-request", icon: ClipboardList, tone: "text-cyan-600 bg-cyan-50" },
  ]
  const open = (section?: string, onClick?: () => void) => (onClick ? onClick() : section && onOpenSection?.(section))

  const today = new Date()
  const dateText = today.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const scopeLabel = data ? (data.scope.all ? "كل الفروع" : data.scope.branches[0]?.name ?? "") : ""

  return <div dir="rtl" className="min-h-full space-y-4 bg-slate-50 p-3 sm:p-5 dark:bg-slate-950">
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-indigo-600 via-violet-600 to-teal-500 px-5 py-5 text-white shadow-lg shadow-indigo-500/20 sm:px-7">
      {/* زخارف ناعمة: توهّجان ونقش نقطي خفيف */}
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-fuchsia-400/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-indigo-50/90"><CalendarDays className="h-3.5 w-3.5" />{dateText}</p>
          <h1 className="mt-1.5 break-words text-xl font-black leading-tight text-white drop-shadow-sm sm:text-[28px]">{greeting()}{user?.fullName || user?.username ? `، ${user?.fullName || user?.username}` : ""}</h1>
          <p className="mt-1 text-sm text-indigo-50/90">{company || "لوحة المعلومات"}{scopeLabel && <span className="mr-2 rounded-full bg-white/20 px-2 py-0.5 text-[11px]">{scopeLabel}</span>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.scope.canSwitch && <div className="flex rounded-xl bg-white/15 p-1 text-xs font-bold ring-1 ring-white/20 backdrop-blur" role="group" aria-label="نطاق الفروع">
            <button type="button" onClick={() => setScopeAll(false)} className={cn("rounded-lg px-3 py-1.5 transition", !scopeAll ? "bg-white text-indigo-700 shadow-sm" : "text-white/90 hover:bg-white/15")}>الفرع الحالي</button>
            <button type="button" onClick={() => setScopeAll(true)} className={cn("rounded-lg px-3 py-1.5 transition", scopeAll ? "bg-white text-indigo-700 shadow-sm" : "text-white/90 hover:bg-white/15")}>كل الفروع</button>
          </div>}
          <button type="button" onClick={() => void load()} disabled={loading} className="flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-bold ring-1 ring-white/20 backdrop-blur transition hover:bg-white/25 disabled:opacity-60" title="تحديث">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />{data ? new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "تحديث"}
          </button>
        </div>
      </div>
      <nav className="relative mt-5 grid grid-cols-2 gap-2 pb-1 sm:flex sm:flex-wrap" aria-label="إجراءات سريعة">
        {actions.map(action => <button key={action.label} type="button" onClick={() => open(action.section, action.onClick)}
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl bg-white/95 py-1.5 pl-3.5 pr-1.5 text-right text-xs font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white">
          <span className={cn("grid h-7 w-7 place-items-center rounded-lg", action.tone)}><action.icon className="h-4 w-4" /></span>{action.label}
        </button>)}
      </nav>
    </header>

    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
      <button type="button" className="rounded-lg bg-white px-3 py-1 text-xs ring-1 ring-rose-200" onClick={() => void load()}>إعادة المحاولة</button>
    </div>}

    {!data && loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-white dark:bg-slate-900" />)}</div> : data && k && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="صافي مبيعات الشهر" value={fmt(k.salesMonth)} currency={currency} icon={<TrendingUp className="h-5 w-5" />} tone="bg-gradient-to-br from-teal-500 to-emerald-600"
          footer={<Delta value={salesChange} />} spark={data.daily} sparkKey="sales" />
        <KpiCard title="مبيعات اليوم" value={fmt(k.salesToday)} currency={currency} icon={<ShoppingBag className="h-5 w-5" />} tone="bg-gradient-to-br from-sky-500 to-indigo-600"
          footer={<div className="space-y-1"><Delta value={todayChange} suffix="عن الأمس" /><p className="text-[11px] text-slate-500">{k.invoicesToday} فاتورة اليوم · متوسط الفاتورة <b dir="ltr">{fmt(avgTicket, 2)}</b></p></div>} />
        <KpiCard title="مشتريات الشهر" value={fmt(k.purchasesMonth)} currency={currency} icon={<Package className="h-5 w-5" />} tone="bg-gradient-to-br from-violet-500 to-fuchsia-600"
          footer={<Delta value={purchasesChange} inverse />} spark={data.daily} sparkKey="purchases" />
        <KpiCard title="صافي التدفق النقدي" value={`${netCash < 0 ? "-" : ""}${fmt(Math.abs(netCash))}`} currency={currency} icon={<Wallet2 className="h-5 w-5" />} tone={netCash < 0 ? "bg-gradient-to-br from-rose-500 to-orange-500" : "bg-gradient-to-br from-amber-500 to-orange-500"}
          footer={<div className="grid grid-cols-2 gap-2 text-[11px]">
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/40">مقبوضات <b dir="ltr" className="block text-xs">{fmt(k.receiptsMonth)}</b></span>
            <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700 dark:bg-rose-950/40">مدفوعات <b dir="ltr" className="block text-xs">{fmt(k.paymentsMonth)}</b></span>
          </div>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="المبيعات والمشتريات" icon={<BarChart3 className="h-4 w-4" />} action={<div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold dark:bg-slate-800">
          {([["30d", "30 يوماً"], ["12m", "12 شهراً"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setRange(key)} className={cn("rounded-md px-2.5 py-1 transition", range === key ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500")}>{label}</button>)}
        </div>}>
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-500">
            {[["#0d9488", "صافي المبيعات"], ["#6366f1", "المشتريات"], ["#f59e0b", "المقبوضات"]].map(([color, label]) => <span key={label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>)}
          </div>
          <div className="h-[290px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs><linearGradient id="dash-sales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} /><stop offset="100%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} interval={range === "30d" ? 4 : 0} reversed />
                <YAxis orientation="right" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={value => compact(Number(value))} width={44}
                  domain={[(dataMin: number) => (dataMin < 0 ? Math.floor(dataMin) : 0), "auto"]} allowDecimals={false} />
                <Tooltip content={<ChartTooltip currency={currency} labels={{ sales: "صافي المبيعات", purchases: "المشتريات", receipts: "المقبوضات" }} />} />
                <Area type="monotone" dataKey="sales" stroke="#0d9488" strokeWidth={2.5} fill="url(#dash-sales)" />
                <Line type="monotone" dataKey="purchases" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="receipts" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title={data.scope.all ? "المبيعات حسب الفرع" : "ملخص الشهر"} icon={<Building2 className="h-4 w-4" />}>
          {data.scope.all && data.byBranch.length > 1 ? <>
            <div className="relative h-44" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byBranch.filter(row => row.sales > 0).length ? data.byBranch : [{ name: "-", sales: 1 }]} dataKey="sales" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                    {data.byBranch.map((row, index) => <Cell key={row.name} fill={DONUT[index % DONUT.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[11px] text-slate-400">الإجمالي</p><b className="text-lg" dir="ltr">{compact(branchTotal)}</b></div></div>
            </div>
            <ul className="mt-3 space-y-2">
              {data.byBranch.map((row, index) => <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT[index % DONUT.length] }} />{row.name}</span>
                <span className="text-xs text-slate-500"><b dir="ltr" className="text-slate-800 dark:text-slate-100">{fmt(row.sales)}</b> · {branchTotal ? ((row.sales / branchTotal) * 100).toFixed(0) : 0}%</span>
              </li>)}
            </ul>
          </> : <ul className="space-y-3">
            {[
              { label: "إجمالي المبيعات", value: k.grossSalesMonth, tone: "text-slate-900 dark:text-white" },
              { label: "المرتجعات", value: -k.returnsMonth, tone: "text-rose-600", hint: `${returnsRatio.toFixed(1)}%` },
              { label: "صافي المبيعات", value: k.salesMonth, tone: "text-teal-700", strong: true },
              { label: "عدد الفواتير", value: k.invoicesMonth, tone: "text-slate-900 dark:text-white", count: true },
              { label: "متوسط الفاتورة", value: avgTicket, tone: "text-slate-900 dark:text-white" },
            ].map(row => <li key={row.label} className={cn("flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm", row.strong ? "bg-teal-50 dark:bg-teal-950/40" : "bg-slate-50 dark:bg-slate-800/60")}>
              <span className="text-slate-600 dark:text-slate-300">{row.label}{row.hint && <small className="mr-1.5 text-[11px] text-slate-400">{row.hint}</small>}</span>
              <b dir="ltr" className={row.tone}>{row.count ? fmt(row.value) : fmt(row.value, 2)}</b>
            </li>)}
          </ul>}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <Panel title="الأصناف الأكثر مبيعاً هذا الشهر" icon={<Trophy className="h-4 w-4" />} action={<button type="button" onClick={() => onOpenSection?.("product-reports")} className="text-xs font-bold text-teal-700 hover:underline">التقارير</button>}>
          {data.topProducts.length ? <ol className="space-y-3">
            {data.topProducts.map((row, index) => <li key={`${row.code}-${index}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2"><span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black", index === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>{index + 1}</span><span className="truncate font-semibold">{row.name}</span></span>
                <span className="shrink-0 text-xs text-slate-500"><b dir="ltr" className="text-slate-800 dark:text-slate-100">{fmt(row.revenue)}</b> · {fmt(row.quantity, row.quantity % 1 ? 2 : 0)} وحدة</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-l from-teal-500 to-emerald-400" style={{ width: `${(row.revenue / maxProduct) * 100}%` }} /></div>
            </li>)}
          </ol> : <Empty text="لا توجد مبيعات أصناف هذا الشهر" />}
          {data.topProducts.length > 0 && <p className="mt-3 text-[10px] text-slate-400">القيم قبل الضريبة</p>}
        </Panel>

        <Panel title="أفضل العملاء هذا الشهر" icon={<Users2 className="h-4 w-4" />} action={<button type="button" onClick={() => onOpenSection?.("customers")} className="text-xs font-bold text-teal-700 hover:underline">العملاء</button>}>
          {data.topCustomers.length ? <ul className="space-y-2.5">
            {data.topCustomers.map(row => <li key={`${row.code}-${row.name}`} className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-black text-slate-600 dark:from-slate-800 dark:to-slate-700 dark:text-slate-200">{row.name.trim().charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold">{row.name}</span><b dir="ltr" className="shrink-0">{fmt(row.revenue)}</b></div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.revenue / maxCustomer) * 100}%` }} /></div>
                  <span className="shrink-0 text-[11px] text-slate-400">{row.invoices} فاتورة</span>
                </div>
              </div>
            </li>)}
          </ul> : <Empty text="لا توجد مبيعات للعملاء هذا الشهر" />}
        </Panel>

        <Panel title="ساعات الذروة (30 يوماً)" icon={<Flame className="h-4 w-4" />} className="lg:col-span-2 2xl:col-span-1">
          {peak.invoices > 0 ? <>
            <div className="h-48" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} interval={2} />
                  <Tooltip cursor={{ fill: "rgb(148 163 184 / 0.12)" }} content={({ active, payload }: any) => active && payload?.length ? <div className="rounded-lg border bg-white px-2.5 py-1.5 text-xs shadow" dir="rtl"><b>{payload[0].payload.hour}:00</b> — {payload[0].payload.invoices} فاتورة · <span dir="ltr">{fmt(payload[0].payload.sales)} {currency}</span></div> : null} />
                  <Bar dataKey="invoices" radius={[4, 4, 0, 0]}>
                    {hours.map(row => <Cell key={row.hour} fill={row.hour === peak.hour ? "#f59e0b" : "#cbd5e1"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5 text-amber-500" />الذروة بين <b dir="ltr">{peak.hour}:00 – {peak.hour + 1}:00</b> بعدد {peak.invoices} فاتورة</p>
          </> : <Empty text="لا توجد فواتير مسجلة بأوقات خلال آخر 30 يوماً" />}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="تحتاج انتباهك" icon={<Sparkles className="h-4 w-4" />}>
          <div className="space-y-2.5">
            {data.pending.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-200"><Layers3 className="h-4 w-4" />سندات غير مرحّلة</p>
              <div className="flex flex-wrap gap-1.5">
                {data.pending.map(row => <button key={row.vch_type} type="button" onClick={() => SECTION_BY_TYPE[row.vch_type] && onOpenSection?.(SECTION_BY_TYPE[row.vch_type])}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-amber-200 transition hover:ring-amber-400 dark:bg-slate-900 dark:text-slate-200">
                  {row.type_name}<span className="rounded-md bg-amber-100 px-1.5 font-black text-amber-800">{row.count}</span>
                </button>)}
              </div>
            </div>}
            {insights.map(item => {
              const tone = { good: "border-emerald-200 bg-emerald-50/60 text-emerald-800", warn: "border-amber-200 bg-amber-50/60 text-amber-800", bad: "border-rose-200 bg-rose-50/60 text-rose-800", info: "border-sky-200 bg-sky-50/60 text-sky-800" }[item.tone]
              const Icon = item.tone === "good" ? CheckCircle2 : item.tone === "info" ? Clock3 : AlertTriangle
              return <button key={item.title} type="button" disabled={!item.section} onClick={() => item.section && onOpenSection?.(item.section)} className={cn("flex w-full items-start gap-2.5 rounded-xl border p-3 text-right transition enabled:hover:shadow-sm dark:bg-transparent", tone)}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" /><span><b className="block text-sm">{item.title}</b><span className="text-xs opacity-90">{item.text}</span></span>
              </button>
            })}
          </div>
        </Panel>

        <Panel title="آخر الحركات" icon={<Receipt className="h-4 w-4" />}>
          {data.recent.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recent.map(row => <li key={row.id}>
              <button type="button" onClick={() => SECTION_BY_TYPE[row.vch_type] && onOpenSection?.(SECTION_BY_TYPE[row.vch_type])} className="flex w-full items-center gap-3 py-2.5 text-right transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className={cn("h-9 w-1 shrink-0 rounded-full", TYPE_TONE[row.vch_type] ?? "bg-slate-300")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm"><b className="truncate">{row.type_name}</b><span className="font-mono text-[11px] text-slate-400" dir="ltr">{row.code}</span>{row.status === 1 && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">غير مرحّل</span>}</span>
                  <span className="block truncate text-xs text-slate-500">{row.party || "—"}</span>
                </span>
                <span className="shrink-0 text-left"><b className="block text-sm" dir="ltr">{fmt(row.amount, 2)}</b><span className="text-[11px] text-slate-400">{timeAgo(row.date)}</span></span>
              </button>
            </li>)}
          </ul> : <Empty text="لا توجد حركات بعد" />}
        </Panel>
      </div>
    </>}

    <QuickSalesOrder open={showQuickOrder} onOpenChange={setShowQuickOrder} onOrderSaved={() => void load()} />
  </div>
}
