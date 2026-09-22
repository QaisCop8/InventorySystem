"use client"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { ReportFilters } from "@/components/reports/report-filters"

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import { ReportCurrencyFilter, OtherCurrenciesFilter } from "@/components/reports/report-currency-filter"
import { VoucherLink } from "@/components/reports/voucher-link"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  CalendarRange, Check, ChevronDown,
  Download, Filter, Landmark, Loader2, Printer, RefreshCcw, Search, UsersRound,
} from "lucide-react"

type ReportKind = "receivables" | "accounting"
export type ReportOption = { id: number; code?: string; name?: string; account_code?: string; account_name?: string; currency_code?: string; currency_name?: string; branch_code?: string; branch_name?: string }
type ReportRow = {
  id: number; voucher_id: number; vch_type: number; vch_code: string; vch_date: string; voucher_type_name: string; voucher_status: number
  account_code: string; account_name: string; debit: number; credit: number; balance: number; opening_balance: number
  currency_code?: string; currency_name?: string; rate?: number; note?: string; voucher_note?: string
  branch_name?: string; salesman_name?: string; counter_accounts?: string
  cheques?: Array<{ number?: string; amount?: number; due_date?: string; bank_account?: string; owner?: string; status?: string }>
  invoice_items?: Array<{ code?: string; name?: string; quantity?: number; unit?: string; unit_price?: number; discount_percent?: number; total_price?: number }>
}
type Meta = { accounts: ReportOption[]; currencies: ReportOption[]; branches: ReportOption[]; salesmen: ReportOption[] }
type Summary = { opening_balance: number; total_debit: number; total_credit: number; final_balance: number }

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${today().slice(0, 4)}-01-01`
const emptyMeta: Meta = { accounts: [], currencies: [], branches: [], salesmen: [] }
const emptySummary: Summary = { opening_balance: 0, total_debit: 0, total_credit: 0, final_balance: 0 }
const money = new Intl.NumberFormat("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ReportMultiChoice({ label, options, selected, onChange, placeholder }: {
  label: string; options: ReportOption[]; selected: number[]; onChange: (ids: number[]) => void; placeholder: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const triggerId = useId()
  const optionLabel = (option: ReportOption) => {
    const code = option.code || option.account_code || option.branch_code || option.currency_code || ""
    const name = option.name || option.account_name || option.branch_name || option.currency_name || ""
    return [code, name].filter(Boolean).join(" — ")
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? options.filter(option => optionLabel(option).toLowerCase().includes(term)) : options
  }, [options, query])
  const visibleOptions = useMemo(() => filtered.slice(0, 100), [filtered])

  return <div className="min-w-0 space-y-2">
    <Label htmlFor={triggerId}>{label}</Label>
    <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
    <button id={triggerId} type="button" className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-950">
      <span className="truncate">{selected.length ? `تم اختيار ${selected.length}` : placeholder}</span><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}/>
    </button>
    </PopoverTrigger>
    <PopoverContent dir="rtl" align="start" collisionPadding={8} className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] min-w-[min(260px,calc(100vw-16px))] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl p-2 shadow-2xl" aria-label={label}>
        <div className="relative mb-2 shrink-0"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالرقم أو الاسم" className="pr-9"/></div>
        <div className="mb-2 flex shrink-0 gap-2 border-b pb-2 text-xs"><button type="button" className="text-teal-700" onClick={() => onChange(options.map(o => Number(o.id)))}>اختيار الكل</button><button type="button" className="text-muted-foreground" onClick={() => onChange([])}>إلغاء الاختيار</button></div>
        {filtered.length > visibleOptions.length && <p className="shrink-0 px-2 text-xs text-muted-foreground">اعرض أول {visibleOptions.length} من {filtered.length}. ابحث بالرقم أو الاسم للمزيد.</p>}
        <div className="min-h-0 max-h-56 space-y-1 overflow-y-auto overscroll-contain">{visibleOptions.map(option => {
          const checked = selected.includes(Number(option.id))
          return <button type="button" key={option.id} aria-pressed={checked} onClick={() => onChange(checked ? selected.filter(id => id !== Number(option.id)) : [...selected, Number(option.id)])} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm ${checked ? "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200" : "hover:bg-muted"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{checked && <Check className="h-3.5 w-3.5"/>}</span><span className="truncate">{optionLabel(option)}</span>
          </button>
        })}</div>
    </PopoverContent>
    </Popover>
  </div>
}

export function AccountStatementReport({ kind }: { kind: ReportKind }) {
  const isReceivables = kind === "receivables"
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null)
  const reportRequestRef = useRef(0)
  const [filters, setFilters] = useState({
    accountIds: [] as number[], currencyIds: [] as number[], branchIds: [] as number[], salesmanIds: [] as number[],
    fromDate: yearStart(), toDate: today(), behavior: "all", status: "all",
    showOpening: true, showTransactionCurrency: true, showOtherCurrencies: true, showCounterAccounts: false,
    showCheques: false, showInvoiceDetails: false, showNotDueCheques: false, showReturnedCheques: false,
  })

  useEffect(() => {
    let active = true
    setLoadingMeta(true)
    fetch(`/api/reports/account-statement?kind=${kind}&meta=1`).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
      if (!active) return
      setMeta(data.meta || emptyMeta)
      setFilters(current => ({ ...current, currencyIds: current.currencyIds.length ? current.currencyIds : data.meta?.currencies?.[0]?.id ? [Number(data.meta.currencies[0].id)] : [], accountIds: current.accountIds.length ? current.accountIds : data.meta?.accounts?.[0]?.id ? [Number(data.meta.accounts[0].id)] : [] }))
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير"))
      .finally(() => active && setLoadingMeta(false))
    return () => { active = false }
  }, [kind])

  const runReport = async (requestedAccountId?: number) => {
    if (!filters.accountIds.length) { setError("اختر حسابًا واحدًا على الأقل"); return }
    if (filters.fromDate > filters.toDate) { setError("تاريخ البداية يجب أن يسبق تاريخ النهاية"); return }
    const accountId = requestedAccountId || (activeAccountId && filters.accountIds.includes(activeAccountId) ? activeAccountId : filters.accountIds[0])
    if (!accountId) { setError("اختر حسابًا واحدًا على الأقل"); return }
    const requestId = ++reportRequestRef.current
    if (accountId !== activeAccountId) { setRows([]); setSummary(emptySummary); setSearch("") }
    setActiveAccountId(accountId)
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ kind, account_ids: String(accountId), from_date: filters.fromDate, to_date: filters.toDate, behavior: filters.behavior, status: filters.status })
      if (filters.currencyIds[0]) params.set("report_currency_id", String(filters.currencyIds[0]))
      if (!filters.showOtherCurrencies && filters.currencyIds.length) params.set("currency_ids", filters.currencyIds.join(","))
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.salesmanIds.length) params.set("salesman_ids", filters.salesmanIds.join(","))
      if (filters.showCounterAccounts) params.set("show_counter_accounts", "1")
      if (filters.showCheques) params.set("show_cheques", "1")
      if (filters.showInvoiceDetails) params.set("show_invoice_details", "1")
      const response = await fetch(`/api/reports/account-statement?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل كشف الحساب")
      if (requestId !== reportRequestRef.current) return
      setRows(data.rows || []); setSummary(data.summary || emptySummary); if (data.meta) setMeta(data.meta)
    } catch (reason) { if (requestId === reportRequestRef.current) setError(reason instanceof Error ? reason.message : "تعذر تحميل كشف الحساب") }
    finally { if (requestId === reportRequestRef.current) setLoading(false) }
  }

  const reset = () => {
    reportRequestRef.current += 1
    setFilters(current => ({ ...current, accountIds: meta.accounts[0]?.id ? [Number(meta.accounts[0].id)] : [], currencyIds: meta.currencies[0]?.id ? [Number(meta.currencies[0].id)] : [], branchIds: [], salesmanIds: [], fromDate: yearStart(), toDate: today(), behavior: "all", status: "all", showOpening: true, showTransactionCurrency: true, showOtherCurrencies: true, showCounterAccounts: false, showCheques: false, showInvoiceDetails: false, showNotDueCheques: false, showReturnedCheques: false }))
    setLoading(false); setActiveAccountId(null); setRows([]); setSummary(emptySummary); setSearch(""); setError("")
  }

  const selectedAccounts = useMemo(() => filters.accountIds.map(id => meta.accounts.find(account => Number(account.id) === id)).filter(Boolean) as ReportOption[], [filters.accountIds, meta.accounts])
  const activeAccount = selectedAccounts.find(account => Number(account.id) === activeAccountId)
  const visibleRows = useMemo(() => rows.filter(row => !search || `${row.vch_code} ${row.voucher_type_name} ${row.account_code} ${row.account_name} ${row.note || ""} ${row.voucher_note || ""}`.toLowerCase().includes(search.toLowerCase())), [rows, search])
  const rowCheques = (row: ReportRow) => (row.cheques || []).filter(cheque => {
    if (filters.showNotDueCheques && !(cheque.due_date && new Date(cheque.due_date) > new Date())) return false
    if (filters.showReturnedCheques && !cheque.status?.includes("راجع")) return false
    return true
  })

  const exportCsv = () => {
    const header = ["التاريخ","رقم السند","نوع الحركة","رقم الحساب","اسم الحساب","مدين","دائن","الرصيد","العملة","الملاحظة"]
    const csvRows = visibleRows.map(row => [row.vch_date?.slice(0,10),row.vch_code,row.voucher_type_name,row.account_code,row.account_name,row.debit,row.credit,row.balance,row.currency_code || row.currency_name || "",row.note || row.voucher_note || ""].map(value => `"${String(value ?? "").replace(/"/g,'""')}"`).join(","))
    const blob = new Blob(["\ufeff" + [header.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" })
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${isReceivables ? "بيان-حساب-ذمة" : "بيان-حساب-محاسبي"}-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const title = isReceivables ? "بيان حساب الذمة" : "بيان حساب محاسبي"
  const subtitle = isReceivables ? "متابعة حركة العملاء والموردين والأرصدة والشيكات من شاشة واحدة" : "عرض القيود والحركات والأرصدة المتسلسلة للحسابات المحاسبية"
  const statCards = [
    { label: "الرصيد السابق", value: summary.opening_balance },
    { label: "إجمالي المدين", value: summary.total_debit, tone: "debit" },
    { label: "إجمالي الدائن", value: summary.total_credit },
    { label: "الرصيد النهائي", value: summary.final_balance },
  ]

  return <ReportPage>

      <ReportHeader icon={Landmark} category="تقارير محاسبية" title={<>{title}</>} description={<>{subtitle}</>} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="ml-2 h-4 w-4"/>تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!visibleRows.length}><Printer className="ml-2 h-4 w-4"/>طباعة</Button></>} />

      <ReportFilters>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <ReportMultiChoice label={isReceivables ? "الذمم" : "الحسابات"} options={meta.accounts} selected={filters.accountIds} onChange={accountIds => { reportRequestRef.current += 1; setLoading(false); setFilters({...filters,accountIds}); setActiveAccountId(null); setRows([]); setSummary(emptySummary) }} placeholder={loadingMeta ? "جاري التحميل..." : "اختر الحسابات"}/>
          <div className="space-y-2"><Label>سلوك الرصيد</Label><Select value={filters.behavior} onValueChange={behavior => setFilters({...filters,behavior})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">جميع الحسابات</SelectItem><SelectItem value="debit">أرصدة مدينة</SelectItem><SelectItem value="credit">أرصدة دائنة</SelectItem><SelectItem value="zero">أرصدة صفرية</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>من تاريخ</Label><div className="relative"><CalendarRange className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600"/><Input type="date" value={filters.fromDate} onChange={e => setFilters({...filters,fromDate:e.target.value})} className="rounded-xl pr-9"/></div></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => setFilters({...filters,toDate:e.target.value})} className="rounded-xl"/></div>
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyIds[0]} onChange={id=>setFilters({...filters,currencyIds:[id]})}/>
          <ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={branchIds => setFilters({...filters,branchIds})} placeholder="جميع الفروع المتاحة"/>
          <ReportMultiChoice label="المندوبون" options={meta.salesmen} selected={filters.salesmanIds} onChange={salesmanIds => setFilters({...filters,salesmanIds})} placeholder="جميع المندوبين"/>
          <div className="space-y-2"><Label>حالة السند</Label><Select value={filters.status} onValueChange={status => setFilters({...filters,status})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="posted">مرحّل فقط</SelectItem><SelectItem value="draft">مسودة فقط</SelectItem><SelectItem value="all">الكل</SelectItem></SelectContent></Select></div>
          <OtherCurrenciesFilter checked={filters.showOtherCurrencies} onCheckedChange={showOtherCurrencies=>setFilters({...filters,showOtherCurrencies})}/>
          <div className="space-y-2"><Label>خيارات أخرى</Label><DropdownMenu dir="rtl"><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between rounded-xl border-emerald-200 font-normal text-emerald-700 hover:bg-emerald-50"><span>خيارات أخرى</span><ChevronDown className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>خيارات العرض</DropdownMenuLabel><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showOpening} onCheckedChange={showOpening => setFilters({...filters,showOpening})}>إظهار الرصيد السابق</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showTransactionCurrency} onCheckedChange={showTransactionCurrency => setFilters({...filters,showTransactionCurrency})}>إظهار عملة الحركة</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showCounterAccounts} onCheckedChange={showCounterAccounts => setFilters({...filters,showCounterAccounts})}>إظهار الحسابات المقابلة</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showInvoiceDetails} onCheckedChange={showInvoiceDetails => setFilters({...filters,showInvoiceDetails})}>إظهار تفاصيل الفاتورة</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showCheques} onCheckedChange={showCheques => setFilters({...filters,showCheques})}>إظهار تفاصيل الشيكات</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showNotDueCheques} onCheckedChange={showNotDueCheques => setFilters({...filters,showNotDueCheques})}>إظهار غير المستحقة فقط</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showReturnedCheques} onCheckedChange={showReturnedCheques => setFilters({...filters,showReturnedCheques})}>إظهار الراجعة فقط</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4"/>مسح الفلاتر</Button><Button data-report-apply onClick={() => void runReport()} disabled={loading || loadingMeta} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 shadow-lg shadow-teal-600/20 hover:from-teal-700 hover:to-emerald-700">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Search className="ml-2 h-4 w-4"/>}عرض النتائج</Button></div>
      </ReportFilters>
    {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      <section dir="rtl" className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">{statCards.map(card => <ReportSummaryCard key={card.label} label={card.label} highlight={card.tone === "debit"}>{money.format(card.value)}</ReportSummaryCard>)}</section>

      <section className={`grid min-h-[430px] flex-1 gap-4 ${selectedAccounts.length > 1 ? "xl:grid-cols-[360px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {selectedAccounts.length > 1 && <aside className="report-results print:hidden">
          <div className="shrink-0 border-b bg-gradient-to-l from-teal-50 to-white p-4 dark:from-teal-950/40 dark:to-slate-950"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white"><UsersRound className="h-4 w-4"/></span><div><h2 className="font-black">{isReceivables ? "الذمم المحددة" : "الحسابات المحددة"}</h2><p className="text-xs text-muted-foreground">اختر {isReceivables ? "ذمة" : "حسابًا"} لعرض حركاته</p></div></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto"><table className="w-full table-fixed text-sm"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 to-sky-700 text-white"><tr><th className="px-3 py-2.5 text-right">{isReceivables ? "اسم الذمة" : "اسم الحساب"}</th><th className="w-20 px-2 py-2.5 text-center">الإجراء</th></tr></thead><tbody>{selectedAccounts.map(account => { const isActive = Number(account.id) === activeAccountId; return <tr key={account.id} className={`border-b transition ${isActive ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}><td className="min-w-0 px-3 py-3"><p className={`truncate font-bold ${isActive ? "text-teal-800 dark:text-teal-200" : ""}`} title={account.name || account.account_name}>{account.name || account.account_name}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{account.code || account.account_code}</p></td><td className="px-2 py-3 text-center"><Button size="sm" variant={isActive ? "default" : "outline"} disabled={loading && isActive} onClick={() => void runReport(Number(account.id))} className={`h-8 rounded-lg px-3 ${isActive ? "bg-teal-600 hover:bg-teal-700" : ""}`}>{loading && isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : "عرض"}</Button></td></tr>})}</tbody></table></div>
        </aside>}
        <section className="report-results">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4 print:hidden"><div><h2 className="font-bold">حركات الحساب{activeAccount ? ` — ${activeAccount.name || activeAccount.account_name}` : ""}</h2><p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar")} حركة ضمن الفترة المحددة</p></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في النتائج..." className="rounded-xl bg-muted/40 pr-9"/></div></div>
        <div className="min-h-[350px] flex-1 overflow-auto overscroll-contain print:max-h-none print:overflow-visible"><table className="w-full min-w-[1100px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white print:static"><tr>{["التاريخ","السند","الحركة","الحساب","مدين","دائن","الرصيد",...(filters.showTransactionCurrency?["العملة"]:[]),"الملاحظة",...(filters.showCounterAccounts?["الحساب المقابل"]:[])].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead>
          <tbody>{filters.showOpening && (rows.length > 0 || summary.opening_balance !== 0) && <tr className="bg-indigo-50 font-bold text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"><td className="px-3 py-3">{filters.fromDate}</td><td colSpan={3}>الرصيد السابق للفترة</td><td className="px-3 py-3 tabular-nums" dir="ltr">{summary.opening_balance>0?money.format(summary.opening_balance):"—"}</td><td className="px-3 py-3 tabular-nums" dir="ltr">{summary.opening_balance<0?money.format(Math.abs(summary.opening_balance)):"—"}</td><td className="px-3 py-3 tabular-nums" dir="ltr">{money.format(summary.opening_balance)}</td><td colSpan={6}/></tr>}
          {visibleRows.map((row,index) => <Fragment key={row.id}><tr className={`border-b transition hover:bg-teal-50/70 dark:hover:bg-teal-950/20 ${index%2 ? "bg-slate-50/60 dark:bg-slate-900/30" : ""}`}><td className="whitespace-nowrap px-3 py-3">{row.vch_date?.slice(0,10)}</td><td className="px-3 py-3 font-mono font-semibold text-teal-700 dark:text-teal-300"><VoucherLink id={row.voucher_id} type={row.vch_type} code={row.vch_code}/></td><td className="px-3 py-3"><Badge variant={row.voucher_status===2?"default":"secondary"}>{row.voucher_type_name}</Badge></td><td className="px-3 py-3"><div className="font-semibold">{row.account_name}</div><div className="text-xs text-muted-foreground">{row.account_code}</div></td><td className="px-3 py-3 font-semibold text-emerald-700" dir="ltr">{row.debit?money.format(row.debit):"—"}</td><td className="px-3 py-3 font-semibold text-rose-700" dir="ltr">{row.credit?money.format(row.credit):"—"}</td><td className={`px-3 py-3 font-black ${row.balance<0?"text-rose-700":"text-slate-900 dark:text-white"}`} dir="ltr">{money.format(row.balance)}</td>{filters.showTransactionCurrency&&<td className="px-3 py-3">{row.currency_code||row.currency_name||"—"}</td>}<td className="max-w-64 whitespace-normal px-3 py-3 text-muted-foreground">{row.note||row.voucher_note||"—"}</td>{filters.showCounterAccounts&&<td className="max-w-72 whitespace-normal px-3 py-3 text-xs">{row.counter_accounts||"—"}</td>}</tr>
            {filters.showCheques&&rowCheques(row).map((cheque,i)=><tr key={`cheque-${i}`} className="border-b bg-amber-50/70 text-xs dark:bg-amber-950/20"><td colSpan={7+(filters.showTransactionCurrency?1:0)+(filters.showCounterAccounts?1:0)} className="px-5 py-2"><b>شيك #{cheque.number}</b> · {money.format(Number(cheque.amount||0))} · {cheque.due_date?.slice(0,10)||"بلا استحقاق"}{cheque.bank_account&&` · ${cheque.bank_account}`}{cheque.owner&&` · ${cheque.owner}`}{cheque.status&&` · ${cheque.status}`}</td></tr>)}
            {filters.showInvoiceDetails&&row.invoice_items?.map((item,i)=><tr key={`invoice-${i}`} className="border-b bg-sky-50/70 text-xs dark:bg-sky-950/20"><td colSpan={7+(filters.showTransactionCurrency?1:0)+(filters.showCounterAccounts?1:0)} className="px-5 py-2"><b>{item.code||"صنف"} · {item.name}</b> · الكمية {item.quantity} {item.unit||""} · السعر {money.format(Number(item.unit_price||0))} · الخصم {item.discount_percent||0}% · الإجمالي {money.format(Number(item.total_price||0))}</td></tr>)}</Fragment>)}
          {!loading && !visibleRows.length && <tr><td colSpan={13} className="px-4 py-16 text-center"><UsersRound className="mx-auto mb-3 h-10 w-10 text-slate-300"/><p className="font-semibold">لا توجد حركات لعرضها</p><p className="mt-1 text-xs text-muted-foreground">غيّر الفترة أو الحسابات ثم اعرض النتائج</p></td></tr>}</tbody>
          {visibleRows.length>0&&<tfoot className="sticky bottom-0 bg-slate-100 font-black dark:bg-slate-900 print:static"><tr><td colSpan={4} className="px-3 py-3">الإجمالي</td><td className="px-3 py-3 text-emerald-700" dir="ltr">{money.format(summary.total_debit)}</td><td className="px-3 py-3 text-rose-700" dir="ltr">{money.format(summary.total_credit)}</td><td className="px-3 py-3" dir="ltr">{money.format(summary.final_balance)}</td><td colSpan={6}/></tr></tfoot>}
        </table></div>
        </section>
      </section>

  </ReportPage>
}

export function ReceivablesStatementReport() { return <AccountStatementReport kind="receivables"/> }
export function AccountingStatementReport() { return <AccountStatementReport kind="accounting"/> }
