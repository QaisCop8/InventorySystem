"use client"
import { tr, appDir } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"
import { printReportFrom } from "@/lib/voucher-print/report-print"

import { ReportPage, ReportHeader } from "@/components/reports/report-page"

import { ReportFilters } from "@/components/reports/report-filters"

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import { ReportCurrencyFilter, OtherCurrenciesFilter } from "@/components/reports/report-currency-filter"
import { VoucherLink } from "@/components/reports/voucher-link"
import { STATEMENT_PREFILL_EVENT, clearReceivablesStatementPrefill, takeReceivablesStatementPrefill } from "@/lib/statement-prefill"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"
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
const money = amountNumberFormat("ar")

export function ReportMultiChoice({ label, options, selected, onChange, placeholder, portalContainer }: {
  label: string; options: ReportOption[]; selected: number[]; onChange: (ids: number[]) => void; placeholder: string
  // اختياري: عنصر تُفتَح فيه القائمة (كنافذة حاضنة) بدل document.body.
  portalContainer?: HTMLElement | null
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  // قيمة الفلتر المقروءة (للطباعة/أرشفة التقارير): أسماء المختار أو «جميع …» عند اختيار الكل/لا شيء
  const filterSummary = useMemo(() => {
    if (!selected.length || selected.length >= options.length) return placeholder
    const chosen = new Set(selected.map(Number))
    const names = options.filter((option) => chosen.has(Number(option.id))).map((option) => option.name || option.account_name || option.branch_name || option.currency_name || option.code || option.account_code || String(option.id))
    return names.length > 3 ? `${names.slice(0, 3).join("، ")} +${names.length - 3}` : names.join("، ")
  }, [selected, options, placeholder])
  // القائمة تُفتح فوراً والخيارات تُرسم بالإطار التالي — الفتح لا ينتظر رسم مئات الأزرار
  const [listReady, setListReady] = useState(false)
  useEffect(() => {
    if (!open) { setListReady(false); return }
    const frame = requestAnimationFrame(() => setListReady(true))
    return () => cancelAnimationFrame(frame)
  }, [open])
  const selectedSet = useMemo(() => new Set(selected), [selected])
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
  const visibleOptions = useMemo(() => (listReady ? filtered.slice(0, 100) : []), [filtered, listReady])

  return <div className="min-w-0 space-y-2">
    <Label htmlFor={triggerId}>{label}</Label>
    <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
    <button id={triggerId} type="button" data-filter-value={filterSummary} className="flex h-10 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-950">
      <span className="truncate">{selected.length ? tr("تم اختيار {0}", selected.length) : placeholder}</span><ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}/>
    </button>
    </PopoverTrigger>
    <PopoverContent container={portalContainer} dir={appDir()} align="start" collisionPadding={8} className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] min-w-[min(260px,calc(100vw-16px))] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl p-2 shadow-2xl" aria-label={label}>
        <div className="relative mb-2 shrink-0"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("بحث بالرقم أو الاسم")} className="ps-9"/></div>
        <div className="mb-2 flex shrink-0 gap-2 border-b pb-2 text-xs"><button type="button" className="text-teal-700" onClick={() => onChange(options.map(o => Number(o.id)))}>{tr("اختيار الكل")}</button><button type="button" className="text-muted-foreground" onClick={() => onChange([])}>{tr("إلغاء الاختيار")}</button></div>
        {listReady && filtered.length > visibleOptions.length && <p className="shrink-0 px-2 text-xs text-muted-foreground">{tr("اعرض أول ")}{visibleOptions.length}{tr(" من ")}{filtered.length}{tr(". ابحث بالرقم أو الاسم للمزيد.")}</p>}
        <div className="min-h-0 max-h-56 space-y-1 overflow-y-auto overscroll-contain">{visibleOptions.map(option => {
          const checked = selectedSet.has(Number(option.id))
          return <button type="button" key={option.id} aria-pressed={checked} onClick={() => onChange(checked ? selected.filter(id => id !== Number(option.id)) : [...selected, Number(option.id)])} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm ${checked ? "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200" : "hover:bg-muted"}`}>
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
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل خيارات التقرير"))
      if (!active) return
      setMeta(data.meta || emptyMeta)
      setFilters(current => ({ ...current, currencyIds: current.currencyIds.length ? current.currencyIds : data.meta?.currencies?.[0]?.id ? [Number(data.meta.currencies[0].id)] : [], accountIds: current.accountIds.length ? current.accountIds : data.meta?.accounts?.[0]?.id ? [Number(data.meta.accounts[0].id)] : [] }))
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : tr("تعذر تحميل خيارات التقرير")))
      .finally(() => active && setLoadingMeta(false))
    return () => { active = false }
  }, [kind])

  // فتح البيان لذمة محددة من شاشة العملاء/الموردين/المشتركين (lib/statement-prefill.ts): تُختار الذمة ثم يُعرض البيان
  const [prefillAccountId, setPrefillAccountId] = useState<number | null>(null)
  useEffect(() => {
    if (kind !== "receivables") return
    const pending = takeReceivablesStatementPrefill()
    if (pending) setPrefillAccountId(pending)
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: string; accountId: number }>).detail
      if (detail?.kind === "receivables" && detail.accountId > 0) { clearReceivablesStatementPrefill(); setPrefillAccountId(detail.accountId) }
    }
    window.addEventListener(STATEMENT_PREFILL_EVENT, handler)
    return () => window.removeEventListener(STATEMENT_PREFILL_EVENT, handler)
  }, [kind])
  useEffect(() => {
    if (!prefillAccountId || loadingMeta) return
    if (filters.accountIds.length !== 1 || filters.accountIds[0] !== prefillAccountId) {
      reportRequestRef.current += 1
      setActiveAccountId(null); setRows([]); setSummary(emptySummary)
      setFilters(current => ({ ...current, accountIds: [prefillAccountId] }))
      return
    }
    setPrefillAccountId(null)
    void runReport(prefillAccountId)
  }, [prefillAccountId, loadingMeta, filters.accountIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const runReport = async (requestedAccountId?: number) => {
    if (!filters.accountIds.length) { setError(tr("اختر حسابًا واحدًا على الأقل")); return }
    if (filters.fromDate > filters.toDate) { setError(tr("تاريخ البداية يجب أن يسبق تاريخ النهاية")); return }
    const accountId = requestedAccountId || (activeAccountId && filters.accountIds.includes(activeAccountId) ? activeAccountId : filters.accountIds[0])
    if (!accountId) { setError(tr("اختر حسابًا واحدًا على الأقل")); return }
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
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل كشف الحساب"))
      if (requestId !== reportRequestRef.current) return
      setRows(data.rows || []); setSummary(data.summary || emptySummary); if (data.meta) setMeta(data.meta)
    } catch (reason) { if (requestId === reportRequestRef.current) setError(reason instanceof Error ? reason.message : tr("تعذر تحميل كشف الحساب")) }
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


  // شبكة التقرير (ReportGrid/DataGridView): الرصيد السابق، الحركات، وأسطر الشيكات/أصناف الفواتير كصفوف تفصيلية
  const gridRows = useMemo(() => {
    const list: any[] = []
    if (filters.showOpening && (rows.length > 0 || summary.opening_balance !== 0)) list.push({
      __kind: "opening", vch_date: filters.fromDate, voucher_type_name: tr("الرصيد السابق للفترة"),
      debit: summary.opening_balance > 0 ? summary.opening_balance : null, credit: summary.opening_balance < 0 ? Math.abs(summary.opening_balance) : null, balance: summary.opening_balance,
    })
    for (const row of visibleRows) {
      list.push({ ...row, __kind: "row" })
      if (filters.showCheques) for (const cheque of rowCheques(row)) list.push({ __kind: "detail", note: `${tr("شيك #")}${cheque.number} · ${money.format(Number(cheque.amount || 0))} · ${cheque.due_date?.slice(0, 10) || tr("بلا استحقاق")}${cheque.bank_account ? ` · ${cheque.bank_account}` : ""}${cheque.owner ? ` · ${cheque.owner}` : ""}${cheque.status ? ` · ${cheque.status}` : ""}` })
      if (filters.showInvoiceDetails) for (const item of row.invoice_items || []) list.push({ __kind: "detail", note: `${item.code || tr("صنف")} · ${item.name}${tr(" · الكمية ")}${item.quantity} ${item.unit || ""}${tr(" · السعر ")}${money.format(Number(item.unit_price || 0))}${tr(" · الخصم ")}${item.discount_percent || 0}${tr("% · الإجمالي ")}${money.format(Number(item.total_price || 0))}` })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, filters.showOpening, filters.showCheques, filters.showInvoiceDetails, filters.fromDate, summary])
  const gridColumns = useMemo((): ReportGridColumn[] => [
    { key: "vch_date", label: tr("التاريخ"), width: 110, value: (row) => String(row.vch_date || "").slice(0, 10) },
    { key: "vch_code", label: tr("السند"), width: 130, render: (row) => row.__kind === "row" ? <VoucherLink id={row.voucher_id} type={row.vch_type} code={row.vch_code}/> : null },
    { key: "voucher_type_name", label: tr("الحركة"), width: 150, render: (row) => row.__kind === "row" ? <Badge variant={row.voucher_status === 2 ? "default" : "secondary"}>{row.voucher_type_name}</Badge> : <b>{row.voucher_type_name}</b> },
    { key: "account_name", label: tr("الحساب"), width: 200, value: (row) => row.account_name ? `${row.account_name} (${row.account_code})` : "" },
    { key: "debit", label: tr("مدين"), type: "number", width: 130, total: summary.total_debit },
    { key: "credit", label: tr("دائن"), type: "number", width: 130, total: summary.total_credit },
    { key: "balance", label: tr("الرصيد"), type: "number", width: 150, total: summary.final_balance },
    { key: "currency", label: tr("العملة"), width: 90, visible: filters.showTransactionCurrency, value: (row) => row.__kind === "row" ? row.currency_code || row.currency_name || "" : "" },
    { key: "note", label: tr("الملاحظة"), width: "*", minWidth: 220, value: (row) => row.note || row.voucher_note || "" },
    { key: "counter_accounts", label: tr("الحساب المقابل"), width: 240, visible: filters.showCounterAccounts },
  ], [summary, filters.showTransactionCurrency, filters.showCounterAccounts])

  const exportCsv = () => {
    const header = [tr("التاريخ"),tr("رقم السند"),tr("نوع الحركة"),tr("رقم الحساب"),tr("اسم الحساب"),tr("مدين"),tr("دائن"),tr("الرصيد"),tr("العملة"),tr("الملاحظة")]
    const csvRows = visibleRows.map(row => [row.vch_date?.slice(0,10),row.vch_code,row.voucher_type_name,row.account_code,row.account_name,row.debit,row.credit,row.balance,row.currency_code || row.currency_name || "",row.note || row.voucher_note || ""].map(value => `"${String(value ?? "").replace(/"/g,'""')}"`).join(","))
    const blob = new Blob(["\ufeff" + [header.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" })
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${isReceivables ? "بيان-حساب-ذمة" : "بيان-حساب-محاسبي"}-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const title = isReceivables ? tr("بيان حساب الذمة") : tr("بيان حساب محاسبي")
  const subtitle = isReceivables ? tr("متابعة حركة العملاء والموردين والأرصدة والشيكات من شاشة واحدة") : tr("عرض القيود والحركات والأرصدة المتسلسلة للحسابات المحاسبية")
  const statCards = [
    { label: tr("الرصيد السابق"), value: summary.opening_balance },
    { label: tr("إجمالي المدين"), value: summary.total_debit, tone: "debit" },
    { label: tr("إجمالي الدائن"), value: summary.total_credit },
    { label: tr("الرصيد النهائي"), value: summary.final_balance },
  ]

  return <ReportPage loading={loading || loadingMeta}>

      <ReportHeader icon={Landmark} category={tr("تقارير محاسبية")} title={<>{title}</>} description={<>{subtitle}</>} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="me-2 h-4 w-4"/>{tr("تصدير")}</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={event => void printReportFrom(event.currentTarget)} disabled={!visibleRows.length}><Printer className="me-2 h-4 w-4"/>{tr("طباعة")}</Button></>} />

      <ReportFilters>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <ReportMultiChoice label={isReceivables ? tr("الذمم") : tr("الحسابات")} options={meta.accounts} selected={filters.accountIds} onChange={accountIds => { reportRequestRef.current += 1; setLoading(false); setFilters({...filters,accountIds}); setActiveAccountId(null); setRows([]); setSummary(emptySummary) }} placeholder={loadingMeta ? tr("جاري التحميل...") : tr("اختر الحسابات")}/>
          <div className="space-y-2"><Label>{tr("سلوك الرصيد")}</Label><Select value={filters.behavior} onValueChange={behavior => setFilters({...filters,behavior})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{tr("جميع الحسابات")}</SelectItem><SelectItem value="debit">{tr("أرصدة مدينة")}</SelectItem><SelectItem value="credit">{tr("أرصدة دائنة")}</SelectItem><SelectItem value="zero">{tr("أرصدة صفرية")}</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><div className="relative"><CalendarRange className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600"/><Input type="date" value={filters.fromDate} onChange={e => setFilters({...filters,fromDate:e.target.value})} className="rounded-xl ps-9"/></div></div>
          <div className="space-y-2"><Label>{tr("إلى تاريخ")}</Label><Input type="date" value={filters.toDate} onChange={e => setFilters({...filters,toDate:e.target.value})} className="rounded-xl"/></div>
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyIds[0]} onChange={id=>setFilters({...filters,currencyIds:[id]})}/>
          <ReportMultiChoice label={tr("الفروع")} options={meta.branches} selected={filters.branchIds} onChange={branchIds => setFilters({...filters,branchIds})} placeholder={tr("جميع الفروع المتاحة")}/>
          <ReportMultiChoice label={tr("المندوبون")} options={meta.salesmen} selected={filters.salesmanIds} onChange={salesmanIds => setFilters({...filters,salesmanIds})} placeholder={tr("جميع المندوبين")}/>
          <div className="space-y-2"><Label>{tr("حالة السند")}</Label><Select value={filters.status} onValueChange={status => setFilters({...filters,status})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="posted">{tr("معتمد فقط")}</SelectItem><SelectItem value="draft">{tr("مسودة فقط")}</SelectItem><SelectItem value="all">{tr("الكل")}</SelectItem></SelectContent></Select></div>
          <OtherCurrenciesFilter checked={filters.showOtherCurrencies} onCheckedChange={showOtherCurrencies=>setFilters({...filters,showOtherCurrencies})}/>
          <div className="space-y-2"><Label>{tr("خيارات أخرى")}</Label><DropdownMenu dir={appDir()}><DropdownMenuTrigger asChild><Button type="button" variant="outline" className="w-full justify-between rounded-xl border-emerald-200 font-normal text-emerald-700 hover:bg-emerald-50"><span>{tr("خيارات أخرى")}</span><ChevronDown className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>{tr("خيارات العرض")}</DropdownMenuLabel><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showOpening} onCheckedChange={showOpening => setFilters({...filters,showOpening})}>{tr("إظهار الرصيد السابق")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showTransactionCurrency} onCheckedChange={showTransactionCurrency => setFilters({...filters,showTransactionCurrency})}>{tr("إظهار عملة الحركة")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showCounterAccounts} onCheckedChange={showCounterAccounts => setFilters({...filters,showCounterAccounts})}>{tr("إظهار الحسابات المقابلة")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showInvoiceDetails} onCheckedChange={showInvoiceDetails => setFilters({...filters,showInvoiceDetails})}>{tr("إظهار تفاصيل الفاتورة")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showCheques} onCheckedChange={showCheques => setFilters({...filters,showCheques})}>{tr("إظهار تفاصيل الشيكات")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showNotDueCheques} onCheckedChange={showNotDueCheques => setFilters({...filters,showNotDueCheques})}>{tr("إظهار غير المستحقة فقط")}</DropdownMenuCheckboxItem><DropdownMenuCheckboxItem className="data-[state=checked]:bg-emerald-500 data-[state=checked]:text-white" checked={filters.showReturnedCheques} onCheckedChange={showReturnedCheques => setFilters({...filters,showReturnedCheques})}>{tr("إظهار الراجعة فقط")}</DropdownMenuCheckboxItem></DropdownMenuContent></DropdownMenu></div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={reset}><RefreshCcw className="me-2 h-4 w-4"/>{tr("مسح الفلاتر")}</Button><Button data-report-apply onClick={() => void runReport()} disabled={loading || loadingMeta} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 shadow-lg shadow-teal-600/20 hover:from-teal-700 hover:to-emerald-700">{loading ? <Loader2 className="me-2 h-4 w-4 animate-spin"/> : <Search className="me-2 h-4 w-4"/>}{tr("عرض النتائج")}</Button></div>
      </ReportFilters>
    {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      <section dir={appDir()} className="grid shrink-0 grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">{statCards.map(card => <ReportSummaryCard key={card.label} label={card.label} highlight={card.tone === "debit"}>{money.format(card.value)}</ReportSummaryCard>)}</section>

      <section className={`grid min-h-[430px] flex-1 gap-4 ${selectedAccounts.length > 1 ? "xl:grid-cols-[360px_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {selectedAccounts.length > 1 && <aside className="report-results print:hidden">
          <div className="shrink-0 border-b bg-gradient-to-l from-teal-50 to-white p-4 dark:from-teal-950/40 dark:to-slate-950"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white"><UsersRound className="h-4 w-4"/></span><div><h2 className="font-black">{isReceivables ? tr("الذمم المحددة") : tr("الحسابات المحددة")}</h2><p className="text-xs text-muted-foreground">{tr("اختر ")}{isReceivables ? tr("ذمة") : tr("حسابًا")}{tr(" لعرض حركاته")}</p></div></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto"><table className="w-full table-fixed text-sm"><thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 to-sky-700 text-white"><tr><th className="px-3 py-2.5 text-start">{isReceivables ? tr("اسم الذمة") : tr("اسم الحساب")}</th><th className="w-20 px-2 py-2.5 text-center">{tr("الإجراء")}</th></tr></thead><tbody>{selectedAccounts.map(account => { const isActive = Number(account.id) === activeAccountId; return <tr key={account.id} className={`border-b transition ${isActive ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}><td className="min-w-0 px-3 py-3"><p className={`truncate font-bold ${isActive ? "text-teal-800 dark:text-teal-200" : ""}`} title={account.name || account.account_name}>{account.name || account.account_name}</p><p className="mt-1 truncate font-mono text-xs text-muted-foreground">{account.code || account.account_code}</p></td><td className="px-2 py-3 text-center"><Button size="sm" variant={isActive ? "default" : "outline"} disabled={loading && isActive} onClick={() => void runReport(Number(account.id))} className={`h-8 rounded-lg px-3 ${isActive ? "bg-teal-600 hover:bg-teal-700" : ""}`}>{loading && isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : tr("عرض")}</Button></td></tr>})}</tbody></table></div>
        </aside>}
        <section className="report-results">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4 print:hidden"><div><h2 className="font-bold">{tr("حركات الحساب")}{activeAccount ? ` — ${activeAccount.name || activeAccount.account_name}` : ""}</h2><p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar-u-nu-latn")}{tr(" حركة ضمن الفترة المحددة")}</p></div><div className="relative w-full sm:w-80"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("ابحث في النتائج...")} className="rounded-xl bg-muted/40 ps-9"/></div></div>
        <div className="flex min-h-[350px] flex-1 flex-col p-2">
          <ReportGrid
            rows={gridRows}
            columns={gridColumns}
            rowClassName={(row: any) => row.__kind === "opening" ? "report-row-opening" : row.__kind === "detail" ? "report-row-muted" : undefined}
            exportFileName={isReceivables ? tr("بيان حساب الذمة") : tr("بيان حساب محاسبي")}
            emptyText={loading ? undefined : tr("لا توجد حركات لعرضها")}
          />
        </div>
        </section>
      </section>

  </ReportPage>
}

export function ReceivablesStatementReport() { return <AccountStatementReport kind="receivables"/> }
export function AccountingStatementReport() { return <AccountStatementReport kind="accounting"/> }
