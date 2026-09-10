"use client"

import { useEffect, useMemo, useState } from "react"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarRange, Download, FileBarChart, Loader2, Printer, RefreshCcw, Search, UsersRound } from "lucide-react"

type BalanceKind = "receivables" | "accounting"
type Meta = { accounts: ReportOption[]; currencies: ReportOption[]; branches: ReportOption[] }
type Row = { id: number; account_code: string; account_name: string; debit: number; credit: number; balance: number; currency_code?: string; currency_name?: string }
const today = () => new Date().toISOString().slice(0, 10)
const money = new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const emptyMeta: Meta = { accounts: [], currencies: [], branches: [] }

export function AccountBalancesReport({ kind }: { kind: BalanceKind }) {
  const isReceivables = kind === "receivables"
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState({ accountIds: [] as number[], currencyId: 0, branchIds: [] as number[], toDate: today(), behavior: "all", showOtherCurrencies: true })
  const title = isReceivables ? "تقرير أرصدة الذمم بتاريخ معين" : "تقرير أرصدة الحسابات بتاريخ معين"
  const subtitle = isReceivables ? "عرض أرصدة العملاء والموردين حتى تاريخ محدد" : "عرض أرصدة الحسابات المحاسبية حتى تاريخ محدد"

  const loadMeta = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/reports/account-balances?kind=${kind}&meta=1`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
      const nextMeta = data.meta || emptyMeta
      setMeta(nextMeta)
      setFilters(current => ({ ...current, accountIds: nextMeta.accounts.map((account: ReportOption) => Number(account.id)), currencyId: Number(nextMeta.currencies[0]?.id || 0) }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير") } finally { setLoading(false) }
  }
  useEffect(() => { void loadMeta() }, [kind])

  const run = async () => {
    if (!filters.accountIds.length) { setError("اختر حسابًا واحدًا على الأقل"); return }
    setRunning(true); setError("")
    try {
      const params = new URLSearchParams({ kind, account_ids: filters.accountIds.join(","), to_date: filters.toDate, behavior: filters.behavior, report_currency_id: String(filters.currencyId) })
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (!filters.showOtherCurrencies) params.set("currency_ids", String(filters.currencyId))
      const response = await fetch(`/api/reports/account-balances?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل تقرير الأرصدة")
      setRows(data.rows || []); if (data.meta) setMeta(data.meta)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل تقرير الأرصدة") } finally { setRunning(false) }
  }
  const reset = () => { setFilters({ accountIds: meta.accounts.map(account => Number(account.id)), currencyId: Number(meta.currencies[0]?.id || 0), branchIds: [], toDate: today(), behavior: "all", showOtherCurrencies: true }); setRows([]); setSearch(""); setError("") }
  const visibleRows = useMemo(() => rows.filter(row => !search || `${row.account_code} ${row.account_name}`.toLowerCase().includes(search.toLowerCase())), [rows, search])
  const totalDebit = visibleRows.reduce((sum, row) => sum + Number(row.debit || 0), 0)
  const totalCredit = visibleRows.reduce((sum, row) => sum + Number(row.credit || 0), 0)
  const exportCsv = () => { const csv = [["رقم الحساب","اسم الحساب","مدين","دائن","الرصيد","العملة"], ...visibleRows.map(row => [row.account_code,row.account_name,row.debit,row.credit,row.balance,row.currency_code || row.currency_name || ""])].map(values => values.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `${title}-${filters.toDate}.csv`; link.click(); URL.revokeObjectURL(link.href) }

  return <main dir="rtl" className="min-h-full w-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,.10),transparent_28%),radial-gradient(circle_at_top_left,rgba(99,102,241,.08),transparent_25%)] p-3 sm:p-5 lg:p-7 print:bg-white print:p-0"><section className="w-full space-y-5"><header className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-emerald-700 via-teal-600 to-green-500 px-5 py-6 text-white shadow-xl shadow-emerald-900/20 sm:px-8"><div className="relative flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10"><UsersRound className="h-7 w-7"/></span><div><Badge className="mb-2 border-0 bg-teal-400/15 text-teal-100">التقارير المحاسبية</Badge><h1 className="text-2xl font-black sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-emerald-50/80">{subtitle}</p></div></div><div className="flex gap-2 print:hidden"><Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="ml-2 h-4 w-4"/>تصدير</Button><Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={() => window.print()} disabled={!visibleRows.length}><Printer className="ml-2 h-4 w-4"/>طباعة</Button></div></div></header><ReportFilters><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6"><ReportMultiChoice label={isReceivables ? "الذمم" : "الحسابات"} options={meta.accounts} selected={filters.accountIds} onChange={accountIds => setFilters({ ...filters, accountIds })} placeholder={loading ? "جاري التحميل..." : "جميع الحسابات"}/><div className="space-y-2"><Label>حتى تاريخ</Label><div className="relative"><CalendarRange className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600"/><Input type="date" value={filters.toDate} onChange={event => setFilters({ ...filters, toDate: event.target.value })} className="rounded-xl pr-9"/></div></div><ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={currencyId => setFilters({ ...filters, currencyId })}/><ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={branchIds => setFilters({ ...filters, branchIds })} placeholder="جميع الفروع المتاحة"/><div className="space-y-2"><Label>سلوك الرصيد</Label><Select value={filters.behavior} onValueChange={behavior => setFilters({ ...filters, behavior })}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">كل الأرصدة</SelectItem><SelectItem value="debit">أرصدة مدينة</SelectItem><SelectItem value="credit">أرصدة دائنة</SelectItem><SelectItem value="zero">أرصدة صفرية</SelectItem></SelectContent></Select></div></div><div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4"/>مسح الفلاتر</Button><Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">{running ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Search className="ml-2 h-4 w-4"/>}عرض النتائج</Button></div></ReportFilters>{error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<section className="grid gap-3 sm:grid-cols-3"><ReportSummaryCard label="إجمالي المدين">{money.format(totalDebit)}</ReportSummaryCard><ReportSummaryCard label="إجمالي الدائن">{money.format(totalCredit)}</ReportSummaryCard><ReportSummaryCard label="الرصيد النهائي">{money.format(totalDebit - totalCredit)}</ReportSummaryCard></section><section className="overflow-hidden rounded-[24px] border bg-background shadow-xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">الأرصدة حتى {filters.toDate}</h2><p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar")} حساب</p></div><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم أو اسم الحساب..." className="w-full rounded-xl sm:w-80"/></div><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[780px] text-sm"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white"><tr>{["رقم الحساب","اسم الحساب","مدين","دائن","الرصيد","العملة"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 text-right text-xs">{label}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id} className={`border-b hover:bg-teal-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}><td className="px-4 py-3 font-mono font-bold text-teal-700">{row.account_code}</td><td className="px-4 py-3 font-semibold">{row.account_name}</td><td className="px-4 py-3 text-emerald-700" dir="ltr">{money.format(Number(row.debit || 0))}</td><td className="px-4 py-3 text-rose-700" dir="ltr">{money.format(Number(row.credit || 0))}</td><td className="px-4 py-3 font-black" dir="ltr">{money.format(Number(row.balance || 0))}</td><td className="px-4 py-3">{row.currency_code || row.currency_name || "—"}</td></tr>)}{!running && !visibleRows.length && <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300"/>لا توجد أرصدة</td></tr>}</tbody></table></div></section></section></main>
}

export function ReceivablesBalancesReport() { return <AccountBalancesReport kind="receivables"/> }
export function AccountingBalancesReport() { return <AccountBalancesReport kind="accounting"/> }
