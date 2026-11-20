"use client"
import { Switch } from "@/components/ui/switch"
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
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

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
          {/* خيارات التقرير: بطاقات بمفتاح تشغيل بنفس ارتفاع وحدود حقول الفلتر (كانت مربعات اختيار صغيرة) */}
          <div className="grid gap-2 self-end sm:grid-cols-2">
            {([
              ["showReturned", tr("إظهار الشيكات الراجعة"), tr("ضمن المجاميع والرصيد")],
              ["periodOnly", tr("شيكات الفترة فقط"), tr("بدون المستحقة قبل الفترة")],
            ] as const).map(([key, title, hint]) => (
              <label key={key} className={`flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 transition ${filters[key] ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30" : "border-input bg-background hover:border-emerald-300"}`}>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold">{title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{hint}</span>
                </span>
                <Switch checked={filters[key]} onCheckedChange={(checked) => set({ [key]: checked } as any)} />
              </label>
            ))}
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

          <ReportGrid rows={rows} exportFileName={tr("تقرير الشيكات")} emptyText={tr("لا توجد شيكات قائمة للفترة والفلاتر المحددة")}
              rowClassName={(row: any) => row.kind === "opening" || row.kind === "previous" ? "report-row-opening" : undefined}
              columns={view === "total" ? [
                { key: "period", label: tr("التاريخ"), width: 120, value: (row: any) => row.kind === "opening" || row.kind === "previous" ? "" : filters.grouping === "monthly" ? String(row.period).slice(0, 7).split("-").reverse().join("/") : dateText(row.period) },
                { key: "label", label: grouping(filters.grouping), width: "*", minWidth: 160 },
                { key: "cheque_in", label: tr("الشيكات الواردة"), type: "number", width: 150, total: totalIn },
                { key: "count_in", label: tr("# الواردة"), type: "number", decimals: 0, width: 100, total: countIn },
                { key: "cheque_out", label: tr("الشيكات الصادرة"), type: "number", width: 150, total: totalOut },
                { key: "count_out", label: tr("# الصادرة"), type: "number", decimals: 0, width: 100, total: countOut },
                { key: "net_balance", label: tr("الصافي"), type: "number", width: 140, total: totalIn - totalOut },
                { key: "cumulative_balance", label: tr("الرصيد التراكمي"), type: "number", width: 160, total: closing },
              ] : [
                { key: "due_date", label: tr("تاريخ الاستحقاق"), width: 120, value: (row: any) => row.kind === "opening" || row.kind === "previous" ? "" : dateText(row.due_date) },
                { key: "label", label: tr("اليوم"), width: 120 },
                { key: "cheq_num", label: tr("# الشيك"), width: 110 },
                { key: "account", label: tr("الحساب"), width: "*", minWidth: 180, value: (row: any) => [row.account_code, row.account_name].filter(Boolean).join(" - ") },
                { key: "bank_account", label: tr("حساب البنك"), width: 180, value: (row: any) => [row.bank_account_code, row.bank_account_name].filter(Boolean).join(" - ") },
                { key: "status_name", label: tr("الحالة"), width: 110 },
                { key: "vch_code", label: tr("السند"), width: 120 },
                { key: "branch_name", label: tr("الفرع"), width: 120 },
                { key: "cheque_in", label: tr("وارد (مدين)"), type: "number", width: 140, total: totalIn },
                { key: "cheque_out", label: tr("صادر (دائن)"), type: "number", width: 140, total: totalOut },
                { key: "cumulative_balance", label: tr("الرصيد"), type: "number", width: 150, total: closing },
              ]}/>
        </>
      )}
    </ReportPage>
  )
}

const grouping = (value: string) => (value === "monthly" ? "الشهر" : "اليوم")

export const ChequesTotalReport = () => <ChequesReport view="total" />
export const ChequesDetailedReport = () => <ChequesReport view="detailed" />
