"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, TrendingDown, TrendingUp, Wallet, ShoppingCart, Package, Receipt, ArrowUpLeft } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { tr } from "@/lib/i18n"

/**
 * «ربحك اليومي بضغطة» (2026-11-24): زر الهيدر يفتح هذه النافذة — صافي ربح اليوم كبيراً، ثم المبيعات/الكلفة/مجمل الربح/المصاريف
 * مع مقارنة بالأمس، وأعلى الأصناف ربحاً وأكبر المصاريف. البيانات من /api/reports/daily-profit (lib/daily-profit.ts).
 */
type DailyProfit = {
  date: string; currency: string; sales: number; returns: number; net_sales: number; cost: number; gross_profit: number; margin: number
  invoices: number; unpriced_lines: number; expenses: number; other_income: number; net_profit: number
  expense_accounts: { name: string; amount: number }[]; top_items: { name: string; profit: number; sales: number }[]
}
type Response = DailyProfit & { previous: DailyProfit }

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const shiftDay = (day: string, by: number) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + by)
  return isoDay(date)
}
const money = (value: number) => (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Change({ now, before, goodWhenDown }: { now: number; before: number; goodWhenDown?: boolean }) {
  if (!before && !now) return <span className="text-[11px] text-slate-400">—</span>
  const diff = now - before
  const percent = before ? (diff / Math.abs(before)) * 100 : null
  const up = diff >= 0
  const good = goodWhenDown ? diff <= 0 : up
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${good ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {percent === null ? money(diff) : `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`}
      <span className="font-normal text-slate-400">{tr("عن الأمس")}</span>
    </span>
  )
}

function Stat({ icon: Icon, label, value, before, tone, currency, invert }: { icon: any; label: string; value: number; before: number; tone: string; currency: string; invert?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100" dir="ltr">{money(value)} <span className="text-xs font-normal text-slate-400">{currency}</span></div>
      <Change now={value} before={before} goodWhenDown={invert} />
    </div>
  )
}

export function DailyProfitDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [day, setDay] = useState(() => isoDay(new Date()))
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async (target: string) => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/reports/daily-profit?date=${target}`, { cache: "no-store" })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || tr("تعذر حساب ربح اليوم"))
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("تعذر حساب ربح اليوم"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load(day)
  }, [open, day, load])

  const today = isoDay(new Date())
  const isToday = day === today
  const previous = data?.previous
  const positive = (data?.net_profit ?? 0) >= 0

  const openReport = () => {
    onOpenChange(false)
    window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: "period-profit-report" } }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-32px)] max-w-2xl overflow-y-auto p-0" dir="rtl">
        <div className={`rounded-t-lg bg-gradient-to-l px-5 pb-5 pt-4 text-white ${positive ? "from-emerald-600 to-teal-700" : "from-rose-600 to-rose-800"}`}>
          <div className="flex items-center justify-between gap-2 pe-8">
            <div>
              <DialogTitle className="text-base font-bold">{isToday ? tr("ربحك اليوم") : tr("ربح يوم")} </DialogTitle>
              <DialogDescription className="text-xs text-white/75">{tr("صافي الربح = مجمل ربح المبيعات + إيرادات أخرى − المصاريف")}</DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setDay((value) => shiftDay(value, -1))} className="rounded-full p-1.5 hover:bg-white/15" aria-label={tr("اليوم السابق")}><ChevronRight className="h-4 w-4" /></button>
              <input
                type="date"
                value={day}
                max={today}
                onChange={(event) => event.target.value && setDay(event.target.value)}
                className="rounded-md bg-white/15 px-2 py-1 text-xs text-white outline-none [color-scheme:dark]"
              />
              <button type="button" disabled={isToday} onClick={() => setDay((value) => shiftDay(value, 1))} className="rounded-full p-1.5 hover:bg-white/15 disabled:opacity-40" aria-label={tr("اليوم التالي")}><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => load(day)} className="rounded-full p-1.5 hover:bg-white/15" aria-label={tr("تحديث")}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-white/75">{tr("صافي الربح")}</div>
              <div className="text-3xl font-extrabold tabular-nums sm:text-4xl" dir="ltr">
                {loading && !data ? <Loader2 className="h-8 w-8 animate-spin" /> : <>{money(data?.net_profit ?? 0)} <span className="text-sm font-medium text-white/75">{data?.currency}</span></>}
              </div>
            </div>
            {data && (
              <div className="text-end text-xs text-white/85">
                <div>{tr("هامش الربح")}: <b dir="ltr">{data.margin.toFixed(1)}%</b></div>
                <div>{tr("عدد الفواتير")}: <b>{data.invoices}</b></div>
                {previous && <div>{tr("الأمس")}: <b dir="ltr">{money(previous.net_profit)}</b></div>}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 p-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">{error}</div>}
          {data && previous && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat icon={ShoppingCart} label={tr("صافي المبيعات")} value={data.net_sales} before={previous.net_sales} currency={data.currency} tone="bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300" />
                <Stat icon={Package} label={tr("كلفة البضاعة")} value={data.cost} before={previous.cost} currency={data.currency} tone="bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300" invert />
                <Stat icon={TrendingUp} label={tr("مجمل الربح")} value={data.gross_profit} before={previous.gross_profit} currency={data.currency} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300" />
                <Stat icon={Receipt} label={tr("المصاريف")} value={data.expenses} before={previous.expenses} currency={data.currency} tone="bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300" invert />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{tr("المبيعات")}: <b className="tabular-nums text-slate-700 dark:text-slate-200" dir="ltr">{money(data.sales)}</b></span>
                <span>{tr("المردودات")}: <b className="tabular-nums text-slate-700 dark:text-slate-200" dir="ltr">{money(data.returns)}</b></span>
                {data.other_income > 0 && <span>{tr("إيرادات أخرى")}: <b className="tabular-nums text-slate-700 dark:text-slate-200" dir="ltr">{money(data.other_income)}</b></span>}
              </div>

              {data.unpriced_lines > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {tr("تنبيه")}: {data.unpriced_lines} {tr("سطر مبيعات بلا كلفة (أصناف بلا سعر شراء) — الربح الفعلي أقل مما يظهر")}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><TrendingUp className="h-4 w-4 text-emerald-600" />{tr("الأكثر ربحاً اليوم")}</h3>
                  {data.top_items.length ? (
                    <ul className="space-y-1.5">
                      {data.top_items.map((item) => (
                        <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-600 dark:text-slate-300">{item.name}</span>
                          <b className={`shrink-0 tabular-nums ${item.profit >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600"}`} dir="ltr">{money(item.profit)}</b>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-slate-400">{tr("لا توجد مبيعات في هذا اليوم")}</p>}
                </section>
                <section className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><Wallet className="h-4 w-4 text-rose-600" />{tr("أكبر المصاريف")}</h3>
                  {data.expense_accounts.length ? (
                    <ul className="space-y-1.5">
                      {data.expense_accounts.map((row) => (
                        <li key={row.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-slate-600 dark:text-slate-300">{row.name}</span>
                          <b className="shrink-0 tabular-nums text-rose-600 dark:text-rose-300" dir="ltr">{money(row.amount)}</b>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-slate-400">{tr("لا توجد مصاريف مسجلة في هذا اليوم")}</p>}
                </section>
              </div>

              <button type="button" onClick={openReport} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-400/30 dark:text-emerald-300 dark:hover:bg-emerald-400/10">
                <ArrowUpLeft className="h-4 w-4" />{tr("تفاصيل أكثر في تقرير أرباح فترة معينة")}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
