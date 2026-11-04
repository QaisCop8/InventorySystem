"use client"
import { tr } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useState } from "react"
import { CalendarRange, ListChecks, Printer, Search } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// تقارير الشيكات: الإجمالي (مجاميع يومية/شهرية حسب الاستحقاق) والتفصيلي (شيك بسطر) — رصيد البنوك ثم الوارد يزيد
// والصادر ينقص، مع رصيد تراكمي يبيّن السيولة المتوقعة. الخادم: app/api/reports/cheques.

type View = "total" | "detailed"
type Option = { id: number; code?: string; name?: string; currency_id?: number }
type Row = Record<string, any>

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const today = () => new Date().toISOString().slice(0, 10)
const nextYear = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10) }
const dateText = (value?: string) => (value ? value.split("-").reverse().join("/") : "")

const CONFIG: Record<View, { title: string; description: string; icon: typeof ListChecks }> = {
  total: { title: tr("تقرير الشيكات إجمالي"), description: tr("مجاميع الشيكات الواردة والصادرة حسب تاريخ الاستحقاق يومياً أو شهرياً مع الرصيد التراكمي"), icon: CalendarRange },
  detailed: { title: tr("تقرير الشيكات تفصيلي"), description: tr("كل شيك قائم بسطر حسب تاريخ الاستحقاق مع الرصيد التراكمي بعد رصيد البنوك"), icon: ListChecks },
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">{children}</select>
    </div>
  )
}

function ChequesReport({ view }: { view: View }) {
  const config = CONFIG[view]
  const [meta, setMeta] = useState<{ currencies: Option[]; bankAccounts: Option[]; branches: Option[] }>({ currencies: [], bankAccounts: [], branches: [] })
  const [filters, setFilters] = useState({ from: today(), to: nextYear(), currencyId: "", bankAccountId: "", branchId: "", chequeType: "", grouping: "daily", showReturned: false, periodOnly: false })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [closing, setClosing] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    fetch(`/api/reports/cheques?view=${view}&meta=1`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setMeta({ currencies: data.currencies || [], bankAccounts: data.bankAccounts || [], branches: data.branches || [] }))
      .catch(() => undefined)
  }, [view])

  const run = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams({
        view, from_date: filters.from, to_date: filters.to, currency_id: filters.currencyId, bank_account_id: filters.bankAccountId,
        branch_id: filters.branchId, cheque_type: filters.chequeType, grouping: filters.grouping,
        show_returned: filters.showReturned ? "1" : "0", period_only: filters.periodOnly ? "1" : "0",
      })
      const response = await fetch(`/api/reports/cheques?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setRows(data.rows || [])
      setClosing(Number(data.closing) || 0)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
    } finally {
      setLoading(false)
    }
  }, [filters, view])

  const body = (rows || []).filter((row) => row.kind === "period" || row.kind === "cheque")
  const totalIn = body.reduce((sum, row) => sum + Number(row.cheque_in || 0), 0)
  const totalOut = body.reduce((sum, row) => sum + Number(row.cheque_out || 0), 0)
  const countIn = view === "total" ? body.reduce((sum, row) => sum + Number(row.count_in || 0), 0) : body.filter((row) => Number(row.cheq_type) === 1).length
  const countOut = view === "total" ? body.reduce((sum, row) => sum + Number(row.count_out || 0), 0) : body.filter((row) => Number(row.cheq_type) === 2).length
  const bankAccounts = filters.currencyId ? meta.bankAccounts.filter((account) => String(account.currency_id) === filters.currencyId) : meta.bankAccounts
  const columns = view === "total" ? 8 : 11

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={config.icon}
        category={tr("تقارير الشيكات")}
        title={config.title}
        description={config.description}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!body.length}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>{tr("استحقاق من")}</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => set({ from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>{tr("استحقاق إلى")}</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => set({ to: event.target.value })} className="rounded-xl" /></div>
          <Select label={tr("العملة")} value={filters.currencyId} onChange={(currencyId) => set({ currencyId, bankAccountId: "" })}>
            <option value="">{tr("كل العملات (بالعملة الأساسية)")}</option>
            {meta.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name || currency.code}</option>)}
          </Select>
          <Select label={tr("حساب البنك")} value={filters.bankAccountId} onChange={(bankAccountId) => set({ bankAccountId })}>
            <option value="">{tr("كل حسابات البنوك")}</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{[account.code, account.name].filter(Boolean).join(" - ")}</option>)}
          </Select>
          <Select label={tr("نوع الشيكات")} value={filters.chequeType} onChange={(chequeType) => set({ chequeType })}>
            <option value="">{tr("الوارد والصادر")}</option>
            <option value="1">{tr("الشيكات الواردة")}</option>
            <option value="2">{tr("الشيكات الصادرة")}</option>
          </Select>
          <Select label={tr("الفرع")} value={filters.branchId} onChange={(branchId) => set({ branchId })}>
            <option value="">{tr("كل الفروع")}</option>
            {meta.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          {view === "total" && (
            <Select label={tr("التجميع")} value={filters.grouping} onChange={(grouping) => set({ grouping })}>
              <option value="daily">{tr("يومي")}</option>
              <option value="monthly">{tr("شهري")}</option>
            </Select>
          )}
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.showReturned} onChange={(event) => set({ showReturned: event.target.checked })} className="h-4 w-4 accent-emerald-600" />{tr("إظهار الشيكات الراجعة")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.periodOnly} onChange={(event) => set({ periodOnly: event.target.checked })} className="h-4 w-4 accent-emerald-600" />{tr("التقرير بشيكات الفترة فقط")}</label>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="me-2 h-4 w-4" />{tr("عرض النتائج")}</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportSummaryCard label={tr("الشيكات الواردة ({0})", countIn)}><span dir="ltr">{money(totalIn)}</span></ReportSummaryCard>
            <ReportSummaryCard label={tr("الشيكات الصادرة ({0})", countOut)}><span dir="ltr">{money(totalOut)}</span></ReportSummaryCard>
            <ReportSummaryCard label={tr("صافي الفترة")}><span dir="ltr">{money(totalIn - totalOut)}</span></ReportSummaryCard>
            <ReportSummaryCard label={tr("الرصيد المتوقع في نهاية الفترة")}><span dir="ltr">{money(closing)}</span></ReportSummaryCard>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                {view === "total" ? (
                  <tr>{["التاريخ", grouping(filters.grouping), "الشيكات الواردة", "# الواردة", "الشيكات الصادرة", "# الصادرة", "الصافي", "الرصيد التراكمي"].map((title) => <th key={title} className="whitespace-nowrap p-2 text-start">{title}</th>)}</tr>
                ) : (
                  <tr>{["تاريخ الاستحقاق", "اليوم", "# الشيك", "الحساب", "حساب البنك", "الحالة", "السند", "الفرع", "وارد (مدين)", "صادر (دائن)", "الرصيد"].map((title) => <th key={title} className="whitespace-nowrap p-2 text-start">{title}</th>)}</tr>
                )}
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const special = row.kind === "opening" || row.kind === "previous"
                  if (view === "total") {
                    return (
                      <tr key={index} className={special ? "border-t bg-emerald-50/50 font-semibold" : "border-t hover:bg-emerald-50/40"}>
                        <td className="p-2" dir="ltr">{special ? "" : filters.grouping === "monthly" ? String(row.period).slice(0, 7).split("-").reverse().join("/") : dateText(row.period)}</td>
                        <td className="p-2">{row.label}</td>
                        <td className="p-2 font-mono" dir="ltr">{row.cheque_in != null ? money(row.cheque_in) : ""}</td>
                        <td className="p-2">{row.count_in ?? ""}</td>
                        <td className="p-2 font-mono" dir="ltr">{row.cheque_out != null ? money(row.cheque_out) : ""}</td>
                        <td className="p-2">{row.count_out ?? ""}</td>
                        <td className="p-2 font-mono" dir="ltr">{money(row.net_balance)}</td>
                        <td className="p-2 font-mono font-bold" dir="ltr">{money(row.cumulative_balance)}</td>
                      </tr>
                    )
                  }
                  return special ? (
                    <tr key={index} className="border-t bg-emerald-50/50 font-semibold">
                      <td className="p-2" colSpan={8}>{row.label}</td>
                      <td className="p-2 font-mono" dir="ltr">{row.cheque_in != null ? money(row.cheque_in) : ""}</td>
                      <td className="p-2 font-mono" dir="ltr">{row.cheque_out != null ? money(row.cheque_out) : ""}</td>
                      <td className="p-2 font-mono font-bold" dir="ltr">{money(row.cumulative_balance)}</td>
                    </tr>
                  ) : (
                    <tr key={index} className="border-t hover:bg-emerald-50/40">
                      <td className="p-2" dir="ltr">{dateText(row.due_date)}</td>
                      <td className="p-2">{row.label}</td>
                      <td className="p-2 font-mono font-semibold">{row.cheq_num}</td>
                      <td className="p-2">{[row.account_code, row.account_name].filter(Boolean).join(" - ")}</td>
                      <td className="p-2">{[row.bank_account_code, row.bank_account_name].filter(Boolean).join(" - ")}</td>
                      <td className="p-2">{row.status_name}</td>
                      <td className="p-2 font-mono">{row.vch_code}</td>
                      <td className="p-2">{row.branch_name}</td>
                      <td className="p-2 font-mono text-emerald-700" dir="ltr">{row.cheque_in ? money(row.cheque_in) : ""}</td>
                      <td className="p-2 font-mono text-rose-700" dir="ltr">{row.cheque_out ? money(row.cheque_out) : ""}</td>
                      <td className="p-2 font-mono font-bold" dir="ltr">{money(row.cumulative_balance)}</td>
                    </tr>
                  )
                })}
                {!body.length && <tr><td colSpan={columns} className="p-8 text-center text-muted-foreground">{tr("لا توجد شيكات قائمة للفترة والفلاتر المحددة")}</td></tr>}
              </tbody>
              {body.length > 0 && (
                <tfoot className="border-t-2 bg-slate-50 font-bold">
                  {view === "total" ? (
                    <tr>
                      <td className="p-2" colSpan={2}>{tr("الإجمالي")}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(totalIn)}</td><td className="p-2">{countIn}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(totalOut)}</td><td className="p-2">{countOut}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(totalIn - totalOut)}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(closing)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td className="p-2" colSpan={8}>{tr("الإجمالي (")}{body.length}{tr(" شيك)")}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(totalIn)}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(totalOut)}</td>
                      <td className="p-2 font-mono" dir="ltr">{money(closing)}</td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </ReportPage>
  )
}

const grouping = (value: string) => (value === "monthly" ? "الشهر" : "اليوم")

export const ChequesTotalReport = () => <ChequesReport view="total" />
export const ChequesDetailedReport = () => <ChequesReport view="detailed" />
