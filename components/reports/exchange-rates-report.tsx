"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { ArrowDownRight, ArrowUpRight, Coins, Download, Loader2, Minus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { canUseReportAction } from "@/components/auth/use-report-access"

type RateRow = {
  id: number
  currency_id: number
  currency_code: string
  currency_name: string
  rate_date: string
  buy_rate: number
  sell_rate: number
  exchange_rate: number
  previous_rate: number | null
  change: number | null
  entered_at: string | null
  entered_by_name: string | null
}
type Currency = { id: number; currency_code: string; currency_name: string }

const SECTION = "exchange-rates-report"
const fmt = (value: number | null | undefined, digits = 4) => (value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }))
const dayText = (value: string) => { const [y, m, d] = value.split("-"); return `${d}/${m}/${y}` }

// تقرير اسعار الصرف: سعر الشراء/البيع/الصرف لكل عملة بكل يوم، والتغيّر عن اليوم السابق، ومن أدخل السعر
// (أو «منسوخ تلقائياً» حين نُسخ آخر سعر لليوم دون إدخال) — app/api/reports/exchange-rates
export function ExchangeRatesReport() {
  const [filters, setFilters] = useState({ from: "", to: "", currency_id: "" })
  const [rows, setRows] = useState<RateRow[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [range, setRange] = useState({ from: "", to: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const canExport = canUseReportAction(SECTION, "export")

  const load = useCallback(async (next = filters) => {
    setLoading(true)
    setError("")
    const params = new URLSearchParams()
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.currency_id) params.set("currency_id", next.currency_id)
    try {
      const response = await fetch(`/api/reports/exchange-rates?${params.toString()}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر تحميل تقرير أسعار الصرف"))
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setCurrencies(Array.isArray(data.currencies) ? data.currencies : [])
      setRange({ from: data.from || "", to: data.to || "" })
      setFilters((current) => ({ ...current, from: current.from || data.from || "", to: current.to || data.to || "" }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذّر تحميل تقرير أسعار الصرف"))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const stats = useMemo(() => {
    const entered = rows.filter((row) => row.entered_at).length
    return { total: rows.length, entered, copied: rows.length - entered, currencies: new Set(rows.map((row) => row.currency_id)).size }
  }, [rows])

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      [tr("التاريخ")]: dayText(row.rate_date),
      [tr("العملة")]: `${row.currency_code} - ${row.currency_name}`,
      [tr("سعر الشراء")]: Number(row.buy_rate),
      [tr("سعر البيع")]: Number(row.sell_rate),
      [tr("سعر الصرف")]: Number(row.exchange_rate),
      [tr("التغيّر")]: row.change == null ? "" : Number(row.change),
      [tr("أدخله")]: row.entered_at ? row.entered_by_name || "—" : tr("منسوخ تلقائياً"),
    })))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "rates")
    const output = XLSX.write(book, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([output], { type: "application/octet-stream" }), `exchange-rates-${range.from}-${range.to}.xlsx`)
  }

  const input = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900"

  return (
    <div dir={appDir()} className="min-h-full space-y-4 bg-slate-50 p-3 sm:p-5 dark:bg-slate-950">
      <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -end-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Coins className="h-6 w-6 text-white" /></span>
            <div className="min-w-0">
              <h1 className="text-xl font-black leading-tight text-white drop-shadow-sm sm:text-2xl">{tr("تقرير اسعار الصرف")}</h1>
              <p className="mt-1 text-sm text-emerald-50/90">{tr("أسعار العملات لكل يوم، والتغيّر عن اليوم السابق، ومن أدخل السعر")}</p>
            </div>
          </div>
          {canExport && (
            <button type="button" onClick={exportExcel} disabled={!rows.length} className="flex h-9 items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/25 disabled:opacity-60">
              <Download className="h-4 w-4" />{tr("تصدير Excel")}
            </button>
          )}
        </div>
      </header>

      <form onSubmit={(event) => { event.preventDefault(); void load() }} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{tr("من تاريخ")}</span>
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className={input} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{tr("إلى تاريخ")}</span>
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className={input} />
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{tr("العملة")}</span>
          <select value={filters.currency_id} onChange={(event) => setFilters((current) => ({ ...current, currency_id: event.target.value }))} className={input}>
            <option value="">{tr("كل العملات")}</option>
            {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.currency_code} - {currency.currency_name}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" data-report-apply disabled={loading} className="h-10 w-full rounded-xl bg-emerald-600 font-bold hover:bg-emerald-700">
            {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض التقرير")}
          </Button>
        </div>
      </form>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [tr("عدد الأسعار"), stats.total],
          [tr("العملات"), stats.currencies],
          [tr("أُدخلت يدوياً"), stats.entered],
          [tr("منسوخة تلقائياً"), stats.copied],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" />{tr("جاري التحميل...")}</div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">{tr("لا توجد أسعار صرف في هذه الفترة")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{tr("التاريخ")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{tr("العملة")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{tr("سعر الشراء")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{tr("سعر البيع")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{tr("سعر الصرف")}</th>
                  <th className="px-4 py-3 text-center font-semibold">{tr("التغيّر")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{tr("أدخله")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => {
                  const change = row.change == null ? null : Number(row.change)
                  const tone = change == null || Math.abs(change) < 1e-9 ? "text-slate-400" : change > 0 ? "text-emerald-600" : "text-rose-600"
                  const Icon = change == null || Math.abs(change) < 1e-9 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 tabular-nums" dir="ltr">{dayText(row.rate_date)}</td>
                      <td className="px-4 py-2.5"><span className="me-2 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold dark:bg-slate-800">{row.currency_code}</span>{row.currency_name}</td>
                      <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(row.buy_rate)}</td>
                      <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(row.sell_rate)}</td>
                      <td className="px-4 py-2.5 text-center font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmt(row.exchange_rate)}</td>
                      <td className={`px-4 py-2.5 text-center font-mono tabular-nums ${tone}`}>
                        <span className="inline-flex items-center gap-1" dir="ltr"><Icon className="h-3.5 w-3.5" />{change == null ? "—" : fmt(change)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {row.entered_at
                          ? <span className="text-slate-700 dark:text-slate-200">{row.entered_by_name || "—"}</span>
                          : <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{tr("منسوخ تلقائياً")}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
