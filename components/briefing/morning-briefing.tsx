"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CalendarClock, FileWarning, Landmark, Minus, PackageX, Percent, RefreshCw, Receipt, Sparkles, Sunrise, TrendingUp, Users, Wallet } from "lucide-react"
import type { MorningBriefing as Briefing } from "@/lib/morning-briefing"

type Response = Briefing & { summary: { text: string | null; error?: string } | null; generated_at: string }

const money = (value: number) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const VOUCHER_NAMES: Record<number, string> = { 4: "سند قبض", 5: "سند صرف", 12: "فاتورة مبيعات", 16: "مرتجع مبيعات" }
const localDay = (offset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
const dayLabel = (day: string) => {
  try { return new Date(`${day}T00:00:00`).toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" }) } catch { return day }
}

function Card({ title, icon, tone, children, badge }: { title: string; icon: ReactNode; tone: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>{icon}</span>{title}</h2>
        {badge}
      </header>
      {children}
    </section>
  )
}

function Kpi({ label, value, hint, icon, tone }: { label: string; value: string; hint?: ReactNode; icon: ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500"><span>{label}</span><span className={`grid h-8 w-8 place-items-center rounded-xl ${tone}`}>{icon}</span></div>
      <div className="mt-2 text-2xl font-black tabular-nums text-slate-900 dark:text-white" dir="ltr" style={{ textAlign: "right" }}>{value}</div>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 dark:bg-slate-800/60">{text}</p>

export default function MorningBriefing() {
  const [day, setDay] = useState(localDay(-1))
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")
  const requestRef = useRef(0)

  const load = useCallback(async (refresh = false) => {
    const request = ++requestRef.current
    setLoading(true)
    setError("")
    try {
      // الأرقام أولاً (سريعة)، ثم فقرة الذكاء الاصطناعي في طلب ثانٍ يعيد استخدام نفس الأرقام المخزنة بالخادم
      const response = await fetch(`/api/briefing?date=${day}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "تعذر تحميل الملخص")
      if (request !== requestRef.current) return
      setData(body)
      setLoading(false)
      if (body.summary?.text) return
      setAiLoading(true)
      const aiResponse = await fetch(`/api/briefing?date=${day}&ai=1${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
      const aiBody = await aiResponse.json()
      if (request === requestRef.current && aiResponse.ok) setData(aiBody)
    } catch (e) {
      if (request === requestRef.current) setError(e instanceof Error ? e.message : "تعذر تحميل الملخص")
    } finally {
      if (request === requestRef.current) { setLoading(false); setAiLoading(false) }
    }
  }, [day])

  useEffect(() => { void load() }, [load])

  const totals = data?.totals
  const change = totals?.changePercent
  const currency = data?.currency.code || ""
  const alerts = data ? data.cashier.length + data.cheques.returned.length + data.watch.cancelled.length + data.watch.discounts.length + (data.watch.drafts.count ? 1 : 0) + (data.watch.portalPayments.count ? 1 : 0) : 0

  return (
    <div dir="rtl" className="mx-auto w-full max-w-7xl space-y-4 p-1 md:p-2">
      <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-l from-amber-400 via-orange-400 to-rose-400 p-5 text-white shadow-lg md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Sunrise className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-black">الملخص الصباحي</h1>
            <p className="text-sm text-white/90">أداء {dayLabel(day)} وما يحتاج متابعتك اليوم{data?.branches.length ? ` · ${data.branches.map((branch) => branch.name).join("، ")}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={day} max={localDay(0)} onChange={(event) => event.target.value && setDay(event.target.value)} className="h-10 rounded-xl border-0 bg-white/90 px-3 text-sm font-semibold text-slate-800 outline-none" />
          <button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/20 px-4 text-sm font-bold hover:bg-white/30 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {loading && !data ? (
        <div className="grid h-64 place-items-center text-slate-400"><RefreshCw className="h-6 w-6 animate-spin" /></div>
      ) : data && totals ? (
        <>
          <section className="rounded-2xl border border-violet-200 bg-gradient-to-l from-violet-50 to-white p-4 dark:border-violet-900 dark:from-violet-950/40 dark:to-slate-900">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-violet-800 dark:text-violet-200"><Sparkles className="h-4 w-4" />قراءة المساعد الذكي</h2>
            {aiLoading && !data.summary?.text ? (
              <div className="space-y-2"><div className="h-3 w-11/12 animate-pulse rounded bg-violet-100 dark:bg-violet-900/50" /><div className="h-3 w-9/12 animate-pulse rounded bg-violet-100 dark:bg-violet-900/50" /><div className="h-3 w-10/12 animate-pulse rounded bg-violet-100 dark:bg-violet-900/50" /></div>
            ) : data.summary?.text ? (
              <p className="whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-200">{data.summary.text}</p>
            ) : (
              <p className="text-xs text-slate-500">{data.summary?.error || "لا يتوفر تحليل حالياً."} <button type="button" className="font-bold text-violet-700 hover:underline" onClick={() => void load(true)}>إعادة المحاولة</button></p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={`صافي المبيعات (${currency})`} value={money(totals.net)} icon={<TrendingUp className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10"
              hint={change === null || change === undefined ? <span className="text-slate-400">لا مبيعات في نفس اليوم من الأسبوع الماضي</span> : <span className={`inline-flex items-center gap-1 font-bold ${change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-600" : "text-slate-500"}`}>{change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : change < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}{Math.abs(change)}% عن الأسبوع الماضي ({money(totals.lastWeekNet)})</span>} />
            <Kpi label="عدد الفواتير" value={String(totals.invoices)} icon={<Receipt className="h-4 w-4" />} tone="bg-sky-50 text-sky-600 dark:bg-sky-400/10" hint={totals.returns > 0 ? <span className="text-amber-600">مردودات {money(totals.returns)}</span> : <span className="text-slate-400">بلا مردودات</span>} />
            <Kpi label={`المقبوضات (${currency})`} value={money(totals.receipts)} icon={<Banknote className="h-4 w-4" />} tone="bg-teal-50 text-teal-600 dark:bg-teal-400/10" hint={<span className="text-slate-400">{totals.receiptCount} سند قبض</span>} />
            <Kpi label="الهامش التقريبي" value={totals.marginPercent === null ? "—" : `${totals.marginPercent}%`} icon={<Percent className="h-4 w-4" />} tone="bg-amber-50 text-amber-600 dark:bg-amber-400/10" hint={<span className="text-slate-400">للأسطر المعروفة تكلفتها</span>} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="المبيعات حسب الفرع" icon={<Landmark className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10">
              {data.sales.current.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500"><th className="pb-2 text-right font-semibold">الفرع</th><th className="pb-2 text-left font-semibold">الصافي</th><th className="pb-2 text-left font-semibold">الأسبوع الماضي</th></tr></thead>
                  <tbody>{data.sales.current.map((row) => {
                    const last = data.sales.lastWeek.find((item) => item.branch_id === row.branch_id)
                    const lastNet = last ? last.sales - last.returns : 0, net = row.sales - row.returns
                    return <tr key={String(row.branch_id)} className="border-t border-slate-100 dark:border-slate-800"><td className="py-2 font-semibold">{row.branch_name}<span className="mr-2 text-xs font-normal text-slate-400">{row.invoices} فاتورة</span></td><td className="py-2 text-left tabular-nums font-bold" dir="ltr">{money(net)}</td><td className={`py-2 text-left tabular-nums text-xs ${net >= lastNet ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">{money(lastNet)}</td></tr>
                  })}</tbody>
                </table>
              ) : <Empty text="لا توجد مبيعات في هذا اليوم" />}
            </Card>

            <Card title="تنبيهات تستحق المراجعة" icon={<AlertTriangle className="h-4 w-4" />} tone="bg-rose-50 text-rose-600 dark:bg-rose-400/10" badge={alerts ? <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">{alerts}</span> : null}>
              {alerts ? (
                <ul className="space-y-2 text-sm">
                  {data.cashier.map((row, index) => <li key={`c${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 px-3 py-2 dark:bg-rose-500/10"><span>فرق صندوق: {row.point_name} — {row.user_name}</span><b className={`tabular-nums ${row.difference < 0 ? "text-rose-600" : "text-amber-600"}`} dir="ltr">{row.difference > 0 ? "+" : ""}{money(row.difference)}</b></li>)}
                  {data.cheques.returned.map((row, index) => <li key={`r${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-rose-50/60 px-3 py-2 dark:bg-rose-500/10"><span>شيك راجع {row.cheq_num} — {row.owner}</span><b className="tabular-nums" dir="ltr">{money(row.amount)} {row.currency_code}</b></li>)}
                  {data.watch.discounts.map((row) => <li key={`d${row.vch_code}`} className="flex items-center justify-between gap-2 rounded-xl bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10"><span>خصم كبير على الفاتورة {row.vch_code}</span><b className="text-amber-700">{row.discount_percent}%</b></li>)}
                  {data.watch.cancelled.map((row) => <li key={`x${row.vch_type}-${row.vch_code}`} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><span>إلغاء {VOUCHER_NAMES[row.vch_type] || "سند"} {row.vch_code}</span><b className="tabular-nums" dir="ltr">{money(row.amount)}</b></li>)}
                  {data.watch.drafts.count > 0 && <li className="flex items-center justify-between gap-2 rounded-xl bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10"><span>{data.watch.drafts.count} مسودة طلبية بعربون لم تُحوَّل منذ أكثر من أسبوع</span><b className="tabular-nums" dir="ltr">{money(data.watch.drafts.deposits)}</b></li>}
                  {data.watch.portalPayments.count > 0 && <li className="flex items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2 dark:bg-sky-500/10"><span>{data.watch.portalPayments.count} دفعة من بوابة العملاء بانتظار الموافقة</span><b className="tabular-nums" dir="ltr">{money(data.watch.portalPayments.amount)}</b></li>}
                </ul>
              ) : <Empty text="لا توجد ملاحظات — يوم هادئ" />}
            </Card>

            <Card title="شيكات تستحق خلال أسبوع" icon={<CalendarClock className="h-4 w-4" />} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10" badge={data.cheques.dueCount ? <span className="text-xs font-bold text-indigo-700 tabular-nums">{data.cheques.dueCount} شيك · {money(data.cheques.dueAmount)} {currency}</span> : null}>
              {data.cheques.items.length ? (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{data.cheques.items.map((row, index) => <li key={index} className="flex items-center justify-between gap-2 py-2"><span><b className="ml-2 tabular-nums" dir="ltr">{row.due_date}</b>{row.owner} <span className="text-xs text-slate-400">#{row.cheq_num}</span></span><b className="tabular-nums" dir="ltr">{money(row.amount)} {row.currency_code}</b></li>)}</ul>
              ) : <Empty text="لا شيكات واردة تستحق هذا الأسبوع" />}
            </Card>

            <Card title="الذمم المدينة" icon={<Users className="h-4 w-4" />} tone="bg-orange-50 text-orange-600 dark:bg-orange-400/10" badge={<span className="text-xs font-bold tabular-nums text-orange-700" dir="ltr">{money(data.receivables.total)} {currency}</span>}>
              <p className="mb-2 text-xs text-slate-500">{data.receivables.customers} عميل برصيد مدين{data.receivables.overLimit ? <b className="mr-1 text-rose-600">· {data.receivables.overLimit} تجاوزوا السقف</b> : null}</p>
              {data.receivables.top.length ? (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{data.receivables.top.map((row) => <li key={row.id} className="flex items-center justify-between gap-2 py-2"><span>{row.name} <span className="text-xs text-slate-400">{row.code}</span></span><b className={`tabular-nums ${row.limit > 0 && row.balance > row.limit ? "text-rose-600" : ""}`} dir="ltr">{money(row.balance)}</b></li>)}</ul>
              ) : <Empty text="لا أرصدة مدينة" />}
            </Card>

            <Card title="مخزون يحتاج إجراء" icon={<PackageX className="h-4 w-4" />} tone="bg-lime-50 text-lime-700 dark:bg-lime-400/10" badge={<span className="text-xs text-slate-500">{data.stock.atRisk} صنف قد ينفد · {data.stock.deadItems} راكد</span>}>
              {data.stock.items.length ? (
                <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{data.stock.items.map((row) => <li key={row.id} className="flex items-center justify-between gap-2 py-2"><span>{row.name} <span className="text-xs text-slate-400">الرصيد {row.stock} · بيع يومي {row.daily}</span></span><b className={row.days_left < 2 ? "text-rose-600" : "text-amber-600"}>{row.days_left <= 0 ? "نفد" : `${row.days_left} يوم`}</b></li>)}</ul>
              ) : <Empty text="لا أصناف مهددة بالنفاد خلال أسبوع" />}
            </Card>

            <Card title="صافي اليوم" icon={<Wallet className="h-4 w-4" />} tone="bg-teal-50 text-teal-600 dark:bg-teal-400/10">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">المبيعات</dt><dd className="text-left font-bold tabular-nums" dir="ltr">{money(totals.sales)}</dd>
                <dt className="text-slate-500">المردودات</dt><dd className="text-left font-bold tabular-nums text-amber-600" dir="ltr">{money(totals.returns)}</dd>
                <dt className="text-slate-500">الصافي</dt><dd className="text-left font-black tabular-nums" dir="ltr">{money(totals.net)}</dd>
                <dt className="text-slate-500">المقبوضات</dt><dd className="text-left font-bold tabular-nums text-teal-700" dir="ltr">{money(totals.receipts)}</dd>
              </dl>
              <p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><FileWarning className="h-3 w-3" />المبالغ بعملة الأساس {data.currency.name} · حُدّثت {new Date(data.generated_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}</p>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}
