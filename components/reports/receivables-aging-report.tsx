"use client"

import { useEffect, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarRange, Clock3, Download, FileBarChart, Loader2, Plus, Printer, RefreshCcw, Search, Settings2, Trash2 } from "lucide-react"

// تقرير تعمير الذمم بالأرصدة (نقل من ShamelWeb CustomersCreditHistoryReport): رصيد كل ذمة موزّعاً على
// فترات عمر الدين (1-30، 31-60 ... فأكثر) — الحساب في app/api/reports/receivables-aging/route.ts.

type Meta = { accounts: ReportOption[]; currencies: ReportOption[]; branches: ReportOption[]; salesmen: ReportOption[]; periods: number[] }
type Row = {
  id: number
  account_code: string
  account_name: string
  salesman_name: string
  phone: string
  credit_limit: number | null
  balance: number
  cheques: number
  aging_balance: number
  buckets: number[]
  last_vch_code: string
  last_vch_date: string
}

const today = () => new Date().toISOString().slice(0, 10)
const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const emptyMeta: Meta = { accounts: [], currencies: [], branches: [], salesmen: [], periods: [30, 60, 90, 120] }
// تدرّج لوني من الحديث (أخضر) إلى الأقدم (أحمر)
const BUCKET_TONES = ["bg-emerald-50 text-emerald-800", "bg-lime-50 text-lime-800", "bg-amber-50 text-amber-800", "bg-orange-50 text-orange-800", "bg-rose-50 text-rose-800", "bg-red-100 text-red-900"]
const BAR_TONES = ["bg-emerald-400", "bg-lime-400", "bg-amber-400", "bg-orange-400", "bg-rose-400", "bg-red-500"]
const toneIndex = (index: number, count: number) => Math.min(BUCKET_TONES.length - 1, Math.round((index / Math.max(1, count - 1)) * (BUCKET_TONES.length - 1)))
const toneFor = (index: number, count: number) => BUCKET_TONES[Math.min(BUCKET_TONES.length - 1, Math.round((index / Math.max(1, count - 1)) * (BUCKET_TONES.length - 1)))]

export const periodLabels = (periods: number[]) => [
  ...periods.map((days, index) => `${index === 0 ? 1 : periods[index - 1] + 1} - ${days}`),
  `${(periods[periods.length - 1] || 0) + 1} فأكثر`,
]

export function ReceivablesAgingReport() {
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [rows, setRows] = useState<Row[]>([])
  const [periods, setPeriods] = useState<number[]>(emptyMeta.periods)
  const [resultPeriods, setResultPeriods] = useState<number[]>(emptyMeta.periods)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [hasRun, setHasRun] = useState(false)
  const [filters, setFilters] = useState({
    accountIds: [] as number[], currencyId: 0, branchIds: [] as number[], salesmanIds: [] as number[],
    toDate: today(), behavior: "debit", includeCheques: false, showZero: false,
  })
  const [periodsOpen, setPeriodsOpen] = useState(false)
  const [draftPeriods, setDraftPeriods] = useState<string[]>([])
  const [periodsError, setPeriodsError] = useState("")
  const [savingPeriods, setSavingPeriods] = useState(false)

  const loadMeta = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/reports/receivables-aging?meta=1", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل خيارات التقرير")
      const next: Meta = { ...emptyMeta, ...(data.meta || {}) }
      setMeta(next)
      setPeriods(next.periods?.length ? next.periods : emptyMeta.periods)
      setResultPeriods(next.periods?.length ? next.periods : emptyMeta.periods)
      setFilters((current) => ({ ...current, accountIds: next.accounts.map((account) => Number(account.id)), currencyId: Number(next.currencies[0]?.id || 0) }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل خيارات التقرير")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadMeta() }, [])

  const run = async () => {
    if (!filters.accountIds.length) { setError("اختر ذمة واحدة على الأقل"); return }
    setRunning(true)
    setError("")
    try {
      const params = new URLSearchParams({
        account_ids: filters.accountIds.join(","), to_date: filters.toDate, behavior: filters.behavior,
        report_currency_id: String(filters.currencyId), periods: periods.join(","),
        include_cheques: filters.includeCheques ? "1" : "0", show_zero: filters.showZero ? "1" : "0",
      })
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.salesmanIds.length) params.set("salesman_ids", filters.salesmanIds.join(","))
      const response = await fetch(`/api/reports/receivables-aging?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل تقرير تعمير الذمم")
      setRows(data.rows || [])
      setResultPeriods(data.periods || periods)
      setHasRun(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل تقرير تعمير الذمم")
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setFilters({ accountIds: meta.accounts.map((account) => Number(account.id)), currencyId: Number(meta.currencies[0]?.id || 0), branchIds: [], salesmanIds: [], toDate: today(), behavior: "debit", includeCheques: false, showZero: false })
    setPeriods(meta.periods?.length ? meta.periods : emptyMeta.periods)
    setRows([])
    setSearch("")
    setError("")
    setHasRun(false)
  }

  // ── تعديل الفترات ──
  const openPeriods = () => {
    setDraftPeriods(periods.map(String))
    setPeriodsError("")
    setPeriodsOpen(true)
  }
  const parsedDraft = () => {
    const list = draftPeriods.map((value) => Number(value))
    if (!list.length || list.some((days) => !Number.isInteger(days) || days <= 0)) return null
    for (let i = 1; i < list.length; i++) if (list[i] <= list[i - 1]) return null
    return list
  }
  const applyPeriods = async (persist: boolean) => {
    const list = parsedDraft()
    if (!list) { setPeriodsError("خطأ في الفترات المدخلة، الرجاء إدخال فترات متصاعدة بأيام موجبة"); return }
    if (persist) {
      setSavingPeriods(true)
      try {
        const response = await fetch("/api/reports/receivables-aging", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ periods: list }) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر حفظ الفترات")
        setMeta((current) => ({ ...current, periods: list }))
      } catch (reason) {
        setPeriodsError(reason instanceof Error ? reason.message : "تعذر حفظ الفترات")
        return
      } finally {
        setSavingPeriods(false)
      }
    }
    setPeriods(list)
    setPeriodsOpen(false)
  }

  const labels = periodLabels(resultPeriods)
  const visibleRows = useMemo(
    () => rows.filter((row) => !search || `${row.account_code} ${row.account_name} ${row.salesman_name}`.toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  )
  const bucketTotals = labels.map((_, index) => visibleRows.reduce((sum, row) => sum + Number(row.buckets[index] || 0), 0))
  const totalBalance = visibleRows.reduce((sum, row) => sum + Number(row.aging_balance || 0), 0)
  const totalAbs = bucketTotals.reduce((sum, value) => sum + Math.abs(value), 0)
  const overdueTotal = bucketTotals.slice(1).reduce((sum, value) => sum + value, 0)
  const showCheques = filters.includeCheques && rows.some((row) => Math.abs(row.cheques) > 0)
  const currencyLabel = String(meta.currencies.find((currency: any) => Number(currency.id) === filters.currencyId)?.currency_code || "")

  const exportCsv = () => {
    const header = ["رقم الحساب", "اسم الحساب", "المندوب", "الهاتف", "الرصيد", ...(showCheques ? ["الشيكات", "رصيد التعمير"] : []), ...labels, "آخر حركة", "تاريخ آخر حركة"]
    const body = visibleRows.map((row) => [row.account_code, row.account_name, row.salesman_name, row.phone, row.balance, ...(showCheques ? [row.cheques, row.aging_balance] : []), ...row.buckets, row.last_vch_code, row.last_vch_date])
    const csv = [header, ...body].map((values) => values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    link.download = `تعمير-الذمم-${filters.toDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <ReportPage loading={loading || running}>
      <ReportHeader
        icon={Clock3}
        category="تقارير محاسبية"
        title={<>تقرير تعمير الذمم</>}
        description={<>توزيع أرصدة العملاء والموردين على فترات عمر الدين حتى تاريخ محدد</>}
        actions={<>
          <Button variant="secondary" onClick={exportCsv} disabled={!visibleRows.length}><Download className="ml-2 h-4 w-4" />تصدير</Button>
          <Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!visibleRows.length}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
        </>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          <ReportMultiChoice label="الذمم" options={meta.accounts} selected={filters.accountIds} onChange={(accountIds) => setFilters({ ...filters, accountIds })} placeholder={loading ? "جاري التحميل..." : "جميع الذمم"} />
          <div className="space-y-2">
            <Label>بتاريخ</Label>
            <div className="relative">
              <CalendarRange className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
              <Input type="date" value={filters.toDate} onChange={(event) => setFilters({ ...filters, toDate: event.target.value })} className="rounded-xl pr-9" />
            </div>
          </div>
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => setFilters({ ...filters, currencyId })} />
          <ReportMultiChoice label="الفروع" options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder="جميع الفروع المتاحة" />
          <ReportMultiChoice label="المندوبون" options={meta.salesmen} selected={filters.salesmanIds} onChange={(salesmanIds) => setFilters({ ...filters, salesmanIds })} placeholder="جميع المندوبين" />
          <div className="space-y-2">
            <Label>نوع الرصيد</Label>
            <Select value={filters.behavior} onValueChange={(behavior) => setFilters({ ...filters, behavior })}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">أرصدة مدينة (ذمم مستحقة لنا)</SelectItem>
                <SelectItem value="credit">أرصدة دائنة (مستحقة علينا)</SelectItem>
                <SelectItem value="all">كل الأرصدة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">فترات التعمير:</span>
            {periodLabels(periods).map((label) => (
              <span key={label} className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200" dir="ltr">{label}</span>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-7 rounded-full" onClick={openPeriods}><Settings2 className="ml-1 h-3.5 w-3.5" />تعديل الفترات</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2" title="احتساب الشيكات الواردة غير المحصّلة ضمن رصيد الذمة (والصادرة غير المصروفة)">
              <Checkbox checked={filters.includeCheques} onCheckedChange={(value) => setFilters({ ...filters, includeCheques: value === true })} />
              احتساب الشيكات
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={filters.showZero} onCheckedChange={(value) => setFilters({ ...filters, showZero: value === true })} />
              إظهار الأرصدة الصفرية
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={reset}><RefreshCcw className="ml-2 h-4 w-4" />مسح الفلاتر</Button>
          <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
            {running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Search className="ml-2 h-4 w-4" />}عرض النتائج
          </Button>
        </div>
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        <ReportSummaryCard label="إجمالي الأرصدة">{money.format(totalBalance)}</ReportSummaryCard>
        <ReportSummaryCard label={`ضمن الفترة الأولى (${labels[0]} يوم)`}>{money.format(bucketTotals[0] || 0)}</ReportSummaryCard>
        <ReportSummaryCard label="متأخر (بعد الفترة الأولى)">{money.format(overdueTotal)}</ReportSummaryCard>
      </section>

      {hasRun && totalAbs > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-bold text-slate-500">توزيع الأرصدة على الفترات</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" dir="ltr">
            {bucketTotals.map((value, index) => Math.abs(value) > 0 && (
              <div key={index} title={`${labels[index]}: ${money.format(value)}`} className={BAR_TONES[toneIndex(index, labels.length)]} style={{ width: `${(Math.abs(value) / totalAbs) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {labels.map((label, index) => (
              <div key={label} className={`rounded-xl px-3 py-2 ${toneFor(index, labels.length)}`}>
                <p className="text-[11px] font-bold" dir="ltr">{label} يوم</p>
                <p className="font-black tabular-nums" dir="ltr">{money.format(bucketTotals[index] || 0)}</p>
                <p className="text-[11px] opacity-80">{totalAbs ? Math.round((Math.abs(bucketTotals[index] || 0) / totalAbs) * 100) : 0}%</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">تعمير الذمم بتاريخ {filters.toDate}{currencyLabel ? ` · ${currencyLabel}` : ""}</h2>
            <p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar")} ذمة</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم أو اسم الذمة أو المندوب..." className="w-full rounded-xl sm:w-80" />
        </div>
        <div className="report-table-scroll">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-gradient-to-l from-teal-700 via-cyan-700 to-sky-700 text-white">
              <tr>
                {["#", "رقم الحساب", "اسم الحساب", "المندوب", "الرصيد", ...(showCheques ? ["الشيكات", "رصيد التعمير"] : [])].map((label) => (
                  <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs">{label}</th>
                ))}
                {labels.map((label) => <th key={label} className="whitespace-nowrap px-3 py-3 text-right text-xs" dir="ltr">{label}</th>)}
                <th className="whitespace-nowrap px-3 py-3 text-right text-xs">آخر حركة</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id} className={`border-b hover:bg-teal-50/70 ${index % 2 ? "bg-slate-50/60" : ""}`}>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{index + 1}</td>
                  <td className="px-3 py-2.5 font-mono font-bold text-teal-700">{row.account_code}</td>
                  <td className="px-3 py-2.5 font-semibold">
                    {row.account_name}
                    {row.credit_limit != null && Math.abs(row.aging_balance) > row.credit_limit && (
                      <span className="mr-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700" title={`سقف الرصيد ${money.format(row.credit_limit)}`}>تجاوز السقف</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{row.salesman_name || "—"}</td>
                  <td className="px-3 py-2.5 font-black tabular-nums" dir="ltr">{money.format(row.balance)}</td>
                  {showCheques && <td className="px-3 py-2.5 tabular-nums text-slate-600" dir="ltr">{money.format(row.cheques)}</td>}
                  {showCheques && <td className="px-3 py-2.5 font-bold tabular-nums" dir="ltr">{money.format(row.aging_balance)}</td>}
                  {row.buckets.map((value, bucket) => (
                    <td key={bucket} className={`px-3 py-2.5 tabular-nums ${Math.abs(value) > 0 ? `${toneFor(bucket, labels.length)} font-bold` : "text-slate-300"}`} dir="ltr">
                      {Math.abs(value) > 0 ? money.format(value) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.last_vch_date ? <><span className="font-mono">{row.last_vch_code}</span><br />{row.last_vch_date}</> : "—"}</td>
                </tr>
              ))}
              {!running && !visibleRows.length && (
                <tr><td colSpan={7 + labels.length} className="px-4 py-16 text-center text-muted-foreground"><FileBarChart className="mx-auto mb-3 h-10 w-10 text-slate-300" />{hasRun ? "لا توجد أرصدة" : "اختر الفلاتر ثم اضغط عرض النتائج"}</td></tr>
              )}
            </tbody>
            {visibleRows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-100 font-black">
                <tr>
                  <td className="px-3 py-3" colSpan={4}>الإجمالي</td>
                  <td className="px-3 py-3 tabular-nums" dir="ltr">{money.format(visibleRows.reduce((sum, row) => sum + row.balance, 0))}</td>
                  {showCheques && <td className="px-3 py-3 tabular-nums" dir="ltr">{money.format(visibleRows.reduce((sum, row) => sum + row.cheques, 0))}</td>}
                  {showCheques && <td className="px-3 py-3 tabular-nums" dir="ltr">{money.format(totalBalance)}</td>}
                  {bucketTotals.map((value, index) => <td key={index} className="px-3 py-3 tabular-nums" dir="ltr">{money.format(value)}</td>)}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <Dialog open={periodsOpen} onOpenChange={setPeriodsOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>تعديل فترات التعمير</DialogTitle>
            <DialogDescription>أدخل نهاية كل فترة بالأيام بشكل متصاعد — تُضاف تلقائياً فترة أخيرة "فأكثر".</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {draftPeriods.map((value, index) => {
              const previous = index === 0 ? 0 : Number(draftPeriods[index - 1]) || 0
              return (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs font-bold text-slate-500">من يوم {previous + 1} إلى</span>
                  <Input type="number" min={1} value={value} dir="ltr" className="h-9 text-right" onChange={(event) => setDraftPeriods((list) => list.map((item, i) => (i === index ? event.target.value : item)))} />
                  <span className="text-xs text-slate-500">يوم</span>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-600" disabled={draftPeriods.length <= 1} onClick={() => setDraftPeriods((list) => list.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )
            })}
            <Button type="button" variant="outline" size="sm" disabled={draftPeriods.length >= 12} onClick={() => setDraftPeriods((list) => [...list, String((Number(list[list.length - 1]) || 0) + 30)])}><Plus className="ml-1 h-4 w-4" />إضافة فترة</Button>
            <p className="text-xs text-slate-500">الفترة الأخيرة: من يوم {(Number(draftPeriods[draftPeriods.length - 1]) || 0) + 1} فأكثر</p>
            {periodsError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{periodsError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" onClick={() => void applyPeriods(true)} disabled={savingPeriods}>{savingPeriods && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ كافتراضي</Button>
            <Button type="button" variant="outline" onClick={() => void applyPeriods(false)}>تطبيق على هذا العرض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReportPage>
  )
}
