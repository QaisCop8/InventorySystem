"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  ArrowDownLeft, ArrowUpRight, BookOpenCheck, CalendarRange, Check, ChevronDown,
  Download, Filter, Landmark, Loader2, Printer, RefreshCcw, Search, UsersRound, WalletCards,
} from "lucide-react"

type ReportKind = "receivables" | "accounting"
export type ReportOption = { id: number; code?: string; name?: string; account_code?: string; account_name?: string; currency_code?: string; currency_name?: string; branch_code?: string; branch_name?: string }
type ReportRow = {
  id: number; voucher_id: number; vch_code: string; vch_date: string; voucher_type_name: string; voucher_status: number
  account_code: string; account_name: string; debit: number; credit: number; balance: number; opening_balance: number
  currency_code?: string; currency_name?: string; rate?: number; note?: string; voucher_note?: string
  branch_name?: string; salesman_name?: string; counter_accounts?: string
  cheques?: Array<{ number?: string; amount?: number; due_date?: string; bank_account?: string; owner?: string; status?: string }>
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
  const filtered = options.filter((option) => `${option.code || option.account_code || option.branch_code || ""} ${option.name || option.account_name || option.branch_name || ""}`.toLowerCase().includes(query.toLowerCase()))
  const optionLabel = (option: ReportOption) => {
    const code = option.code || option.account_code || option.branch_code || option.currency_code || ""
    const name = option.name || option.account_name || option.branch_name || option.currency_name || ""
    return [code, name].filter(Boolean).join(" — ")
  }
  return <div className="space-y-2">
    <Label>{label}</Label>
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm transition hover:border-teal-400 dark:border-slate-700 dark:bg-slate-950">
        <span className="truncate">{selected.length ? `تم اختيار ${selected.length}` : placeholder}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180"/>
      </summary>
      <div className="absolute z-40 mt-2 w-full min-w-[260px] rounded-2xl border bg-background p-2 shadow-2xl">
        <div className="relative mb-2"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالرقم أو الاسم" className="pr-9"/></div>
        <div className="mb-2 flex gap-2 border-b pb-2 text-xs"><button type="button" className="text-teal-700" onClick={() => onChange(options.map(o => Number(o.id)))}>اختيار الكل</button><button type="button" className="text-muted-foreground" onClick={() => onChange([])}>إلغاء الاختيار</button></div>
        <div className="max-h-56 space-y-1 overflow-auto">{filtered.map(option => {
          const checked = selected.includes(Number(option.id))
          return <button type="button" key={option.id} onClick={() => onChange(checked ? selected.filter(id => id !== Number(option.id)) : [...selected, Number(option.id)])} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-sm ${checked ? "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-200" : "hover:bg-muted"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{checked && <Check className="h-3.5 w-3.5"/>}</span><span className="truncate">{optionLabel(option)}</span>
          </button>
        })}</div>
      </div>
    </details>
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
  const [filters, setFilters] = useState({
    accountIds: [] as number[], currencyIds: [] as number[], branchIds: [] as number[], salesmanIds: [] as number[],
    fromDate: yearStart(), toDate: today(), behavior: "all", status: "posted",
    showOpening: true, showTransactionCurrency: true, baseCurrency: false, showCounterAccounts: false,
    showCheques: false, showNotDueCheques: false, showReturnedCheques: false,
  })

  useEffect(() => {
    let active = true
    setLoadingMeta(true)
    fetch(`/api/reports/account-statement?kind=${kind}&meta=1`).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
      if (!active) return
      setMeta(data.meta || emptyMeta)
      setFilters(current => ({ ...current, accountIds: current.accountIds.length ? current.accountIds : data.meta?.accounts?.[0]?.id ? [Number(data.meta.accounts[0].id)] : [] }))
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير"))
      .finally(() => active && setLoadingMeta(false))
    return () => { active = false }
  }, [kind])

  const runReport = async () => {
    if (!filters.accountIds.length) { setError("اختر حسابًا واحدًا على الأقل"); return }
    if (filters.fromDate > filters.toDate) { setError("تاريخ البداية يجب أن يسبق تاريخ النهاية"); return }
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ kind, account_ids: filters.accountIds.join(","), from_date: filters.fromDate, to_date: filters.toDate, behavior: filters.behavior, status: filters.status })
      if (filters.currencyIds.length) params.set("currency_ids", filters.currencyIds.join(","))
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.salesmanIds.length) params.set("salesman_ids", filters.salesmanIds.join(","))
      if (filters.baseCurrency) params.set("base_currency", "1")
      if (filters.showCounterAccounts) params.set("show_counter_accounts", "1")
      if (filters.showCheques) params.set("show_cheques", "1")
      const response = await fetch(`/api/reports/account-statement?${params}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل كشف الحساب")
      setRows(data.rows || []); setSummary(data.summary || emptySummary); if (data.meta) setMeta(data.meta)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل كشف الحساب") }
    finally { setLoading(false) }
  }

  const reset = () => {
    setFilters(current => ({ ...current, accountIds: meta.accounts[0]?.id ? [Number(meta.accounts[0].id)] : [], currencyIds: [], branchIds: [], salesmanIds: [], fromDate: yearStart(), toDate: today(), behavior: "all", status: "posted", showOpening: true, showTransactionCurrency: true, baseCurrency: false, showCounterAccounts: false, showCheques: false, showNotDueCheques: false, showReturnedCheques: false }))
    setRows([]); setSummary(emptySummary); setSearch(""); setError("")
  }

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
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${isReceivables ? "كشف-حساب-ذمة" : "كشف-حساب-محاسبي"}-${today()}.csv`; link.click(); URL.revokeObjectURL(link.href)
  }

  const title = isReceivables ? "كشف حساب ذمة" : "كشف حساب محاسبي"
  const subtitle = isReceivables ? "متابعة حركة العملاء والموردين والأرصدة والشيكات من شاشة واحدة" : "عرض القيود والحركات والأرصدة المتسلسلة للحسابات المحاسبية"
  const statCards = [
    { label: "الرصيد السابق", value: summary.opening_balance, icon: BookOpenCheck, color: "from-slate-700 to-slate-900" },
    { label: "إجمالي المدين", value: summary.total_debit, icon: ArrowDownLeft, color: "from-emerald-500 to-teal-600" },
    { label: "إجمالي الدائن", value: summary.total_credit, icon: ArrowUpRight, color: "from-rose-500 to-orange-500" },
    { label: "الرصيد النهائي", value: summary.final_balance, icon: WalletCards, color: "from-indigo-500 to-violet-600" },
  ]

  return <main dir="rtl" className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,.10),transparent_28%),radial-gradient(circle_at_top_left,rgba(99,102,241,.08),transparent_25%)] p-3 sm:p-5 lg:p-7 print:bg-white print:p-0">
    <section className="mx-auto max-w-[1700px] space-y-5">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-slate-950 via-slate-900 to-teal-950 px-5 py-6 text-white shadow-xl sm:px-8">
        <div className="absolute -left-12 -top-16 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl"/><div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur"><Landmark className="h-7 w-7 text-teal-300"/></span><div><Badge className="mb-2 border-0 bg-teal-400/15 text-teal-200">التقارير المحاسبية</Badge><h1 className="text-2xl font-black sm:text-3xl">{title}</h1><p className="mt-1 max-w-2xl text-sm text-slate-300">{subtitle}</p></div></div>
          <div className="flex gap-2 print:hidden"><Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="ml-2 h-4 w-4"/>تصدير</Button><Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => window.print()} disabled={!visibleRows.length}><Printer className="ml-2 h-4 w-4"/>طباعة</Button></div>
        </div>
      </header>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,.45)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 print:hidden">
        <div className="mb-4 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950"><Filter className="h-4 w-4"/></span><div><h2 className="font-bold">خيارات التقرير</h2><p className="text-xs text-muted-foreground">اختر نطاق التقرير ثم اضغط عرض النتائج</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <ReportMultiChoice label={isReceivables ? "الذمم" : "الحسابات"} options={meta.accounts} selected={filters.accountIds} onChange={accountIds => setFilters({...filters,accountIds})} placeholder={loadingMeta ? "جاري التحميل..." : "اختر الحسابات"}/>
          <div className="space-y-2"><Label>سلوك الرصيد</Label><Select value={filters.behavior} onValueChange={behavior => setFilters({...filters,behavior})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">جميع الحسابات</SelectItem><SelectItem value="debit">أرصدة مدينة</SelectItem><SelectItem value="credit">أرصدة دائنة</SelectItem><SelectItem value="zero">أرصدة صفرية</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>من تاريخ</Label><div className="relative"><CalendarRange className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600"/><Input type="date" value={filters.fromDate} onChange={e => setFilters({...filters,fromDate:e.target.value})} className="rounded-xl pr-9"/></div></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" value={filters.toDate} onChange={e => setFilters({...filters,toDate:e.target.value})} className="rounded-xl"/></div>
          <ReportMultiChoice label="العملات" options={meta.currencies} selected={filters.currencyIds} onChange={currencyIds => setFilters({...filters,currencyIds})} placeholder="جميع العملات"/>
          <ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={branchIds => setFilters({...filters,branchIds})} placeholder="جميع الفروع المتاحة"/>
          <ReportMultiChoice label="المندوبون" options={meta.salesmen} selected={filters.salesmanIds} onChange={salesmanIds => setFilters({...filters,salesmanIds})} placeholder="جميع المندوبين"/>
          <div className="space-y-2"><Label>حالة السند</Label><Select value={filters.status} onValueChange={status => setFilters({...filters,status})}><SelectTrigger className="rounded-xl"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="posted">مرحّل فقط</SelectItem><SelectItem value="draft">مسودة فقط</SelectItem><SelectItem value="all">الكل</SelectItem></SelectContent></Select></div>
        </div>
        <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["showOpening","إظهار الرصيد السابق"],["showTransactionCurrency","إظهار عملة الحركة"],["baseCurrency","الرصيد بالعملة الأساسية"],["showCounterAccounts","إظهار الحسابات المقابلة"],
            ...(isReceivables ? [["showCheques","إظهار تفاصيل الشيكات"],["showNotDueCheques","إظهار غير المستحقة فقط"],["showReturnedCheques","إظهار الراجعة فقط"]] : []),
          ].map(([key,label]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm shadow-sm dark:bg-slate-950"><span>{label}</span><Switch checked={Boolean(filters[key as keyof typeof filters])} onCheckedChange={checked => setFilters({...filters,[key]:checked})}/></label>)}
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4"/>مسح الفلاتر</Button><Button onClick={runReport} disabled={loading || loadingMeta} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600 shadow-lg shadow-teal-600/20 hover:from-teal-700 hover:to-emerald-700">{loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Search className="ml-2 h-4 w-4"/>}عرض النتائج</Button></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{statCards.map(card => <article key={card.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-l ${card.color} p-4 text-white shadow-lg`}><div className="relative flex items-center justify-between"><div><p className="text-xs text-white/70">{card.label}</p><p className="mt-1 text-2xl font-black tabular-nums" dir="ltr">{money.format(card.value)}</p></div><card.icon className="h-8 w-8 text-white/75"/></div></article>)}</section>

      <section className="overflow-hidden rounded-[24px] border bg-background shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 print:hidden"><div><h2 className="font-bold">حركات الحساب</h2><p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar")} حركة ضمن الفترة المحددة</p></div><div className="relative w-full sm:w-80"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث في النتائج..." className="rounded-xl bg-muted/40 pr-9"/></div></div>
        <div className="max-h-[62vh] overflow-auto print:max-h-none print:overflow-visible"><table className="w-full min-w-[1100px] border-collapse text-sm"><thead className="sticky top-0 z-10 bg-slate-900 text-white print:static"><tr>{["التاريخ","السند","الحركة","الحساب","مدين","دائن","الرصيد",...(filters.showTransactionCurrency?["العملة"]:[]),"الملاحظة",...(filters.showCounterAccounts?["الحساب المقابل"]:[]),...(isReceivables&&filters.showCheques?["تفاصيل الشيكات"]:[])].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold">{label}</th>)}</tr></thead>
          <tbody>{filters.showOpening && (rows.length > 0 || summary.opening_balance !== 0) && <tr className="bg-indigo-50 font-bold text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"><td className="px-3 py-3">{filters.fromDate}</td><td colSpan={3}>الرصيد السابق للفترة</td><td className="px-3 py-3 tabular-nums" dir="ltr">{summary.opening_balance>0?money.format(summary.opening_balance):"—"}</td><td className="px-3 py-3 tabular-nums" dir="ltr">{summary.opening_balance<0?money.format(Math.abs(summary.opening_balance)):"—"}</td><td className="px-3 py-3 tabular-nums" dir="ltr">{money.format(summary.opening_balance)}</td><td colSpan={6}/></tr>}
          {visibleRows.map((row,index) => <tr key={row.id} className={`border-b transition hover:bg-teal-50/70 dark:hover:bg-teal-950/20 ${index%2 ? "bg-slate-50/60 dark:bg-slate-900/30" : ""}`}><td className="whitespace-nowrap px-3 py-3">{row.vch_date?.slice(0,10)}</td><td className="px-3 py-3 font-mono font-semibold text-teal-700 dark:text-teal-300">{row.vch_code}</td><td className="px-3 py-3"><Badge variant={row.voucher_status===2?"default":"secondary"}>{row.voucher_type_name}</Badge></td><td className="px-3 py-3"><div className="font-semibold">{row.account_name}</div><div className="text-xs text-muted-foreground">{row.account_code}</div></td><td className="px-3 py-3 font-semibold text-emerald-700" dir="ltr">{row.debit?money.format(row.debit):"—"}</td><td className="px-3 py-3 font-semibold text-rose-700" dir="ltr">{row.credit?money.format(row.credit):"—"}</td><td className={`px-3 py-3 font-black ${row.balance<0?"text-rose-700":"text-slate-900 dark:text-white"}`} dir="ltr">{money.format(row.balance)}</td>{filters.showTransactionCurrency&&<td className="px-3 py-3">{row.currency_code||row.currency_name||"—"}</td>}<td className="max-w-64 whitespace-normal px-3 py-3 text-muted-foreground">{row.note||row.voucher_note||"—"}</td>{filters.showCounterAccounts&&<td className="max-w-72 whitespace-normal px-3 py-3 text-xs">{row.counter_accounts||"—"}</td>}{isReceivables&&filters.showCheques&&<td className="min-w-64 px-3 py-2">{rowCheques(row).length ? <div className="space-y-1">{rowCheques(row).map((cheque,i)=><div key={i} className="rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-200"><b>#{cheque.number}</b> · {money.format(Number(cheque.amount||0))} · {cheque.due_date?.slice(0,10)||"بلا استحقاق"} {cheque.status&&`· ${cheque.status}`}</div>)}</div>:"—"}</td>}</tr>)}
          {!loading && !visibleRows.length && <tr><td colSpan={13} className="px-4 py-16 text-center"><UsersRound className="mx-auto mb-3 h-10 w-10 text-slate-300"/><p className="font-semibold">لا توجد حركات لعرضها</p><p className="mt-1 text-xs text-muted-foreground">غيّر الفترة أو الحسابات ثم اعرض النتائج</p></td></tr>}</tbody>
          {visibleRows.length>0&&<tfoot className="sticky bottom-0 bg-slate-100 font-black dark:bg-slate-900 print:static"><tr><td colSpan={4} className="px-3 py-3">الإجمالي</td><td className="px-3 py-3 text-emerald-700" dir="ltr">{money.format(summary.total_debit)}</td><td className="px-3 py-3 text-rose-700" dir="ltr">{money.format(summary.total_credit)}</td><td className="px-3 py-3" dir="ltr">{money.format(summary.final_balance)}</td><td colSpan={6}/></tr></tfoot>}
        </table></div>
      </section>
    </section>
  </main>
}

export function ReceivablesStatementReport() { return <AccountStatementReport kind="receivables"/> }
export function AccountingStatementReport() { return <AccountStatementReport kind="accounting"/> }
