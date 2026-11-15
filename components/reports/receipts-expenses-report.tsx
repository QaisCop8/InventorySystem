"use client"
import { tr } from "@/lib/i18n"
import { amountNumberFormat } from "@/lib/decimals"

import { useEffect, useMemo, useState } from "react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { voucherHref } from "@/lib/voucher-links"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportCurrencyFilter, OtherCurrenciesFilter } from "@/components/reports/report-currency-filter"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { listYearStart, listToday } from "@/components/common/voucher-list-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Printer, RefreshCcw, Search } from "lucide-react"
import { ReportGrid } from "@/components/reports/report-grid"

// كشف المقبوضات / كشف المصروفات (نقل من ShamelWeb ReceivablesReport) — الحساب في app/api/reports/receipts-expenses/route.ts

type Kind = "receipts" | "expenses"
type Meta = { accounts: ReportOption[]; currencies: ReportOption[]; branches: ReportOption[]; salesmen: ReportOption[] }
type Row = {
  id: number; vch_code: string; vch_date: string; vch_type: number; vch_type_name: string
  customer_code: string | null; customer_name: string; notes: string; branch_name: string | null; salesman_name: string | null
  cash_amount: number; cheques_amount: number; cards_amount: number; total: number
}
type Cheque = { voucher_id: number; cheq_num: string; bank_account: string; due_date: string; amount: number; bank_name: string | null; branch_name: string | null; currency_code: string | null }
type GridRow = Partial<Row> & { __kind?: "cheque"; __text?: string }

const money = amountNumberFormat("en-US")
const emptyMeta: Meta = { accounts: [], currencies: [], branches: [], salesmen: [] }
const TEXT: Record<Kind, { title: string; description: string; empty: string }> = {
  receipts: { title: "كشف المقبوضات", description: "سندات القبض والفواتير النقدية (مبيعات نقدية ومرتجع مشتريات نقدي) موزعة على نقدي وشيكات وبطاقات", empty: "لا توجد مقبوضات بالفترة" },
  expenses: { title: "كشف المصروفات", description: "سندات الصرف وصرف الشيكات والفواتير النقدية (مشتريات نقدية ومرتجع مبيعات نقدي) موزعة على نقدي وشيكات وبطاقات", empty: "لا توجد مصروفات بالفترة" },
}

const defaultFilters = () => ({
  accountIds: [] as number[], branchIds: [] as number[], salesmanIds: [] as number[], currencyId: 0,
  fromDate: listYearStart(), toDate: listToday(), showOther: true, chequeDetails: false, fromValue: "", toValue: "",
})

function ReceiptsExpensesReport({ kind }: { kind: Kind }) {
  const text = TEXT[kind]
  const [meta, setMeta] = useState<Meta>(emptyMeta)
  const [rows, setRows] = useState<Row[]>([])
  const [cheques, setCheques] = useState<Record<number, Cheque[]>>({})
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [hasRun, setHasRun] = useState(false)
  const [filters, setFilters] = useState(defaultFilters)
  const set = (patch: Partial<ReturnType<typeof defaultFilters>>) => setFilters((current) => ({ ...current, ...patch }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/reports/receipts-expenses?kind=${kind}&meta=1`, { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || tr("تعذر تحميل خيارات التقرير"))
        if (cancelled) return
        const next: Meta = { ...emptyMeta, ...(data.meta || {}) }
        setMeta(next)
        setFilters((current) => ({ ...current, currencyId: Number(next.currencies[0]?.id || 0) }))
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : tr("تعذر تحميل خيارات التقرير"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [kind])

  const run = async () => {
    setRunning(true)
    setError("")
    try {
      const params = new URLSearchParams({
        kind, from_date: filters.fromDate, to_date: filters.toDate, report_currency_id: String(filters.currencyId),
        show_other_currencies: filters.showOther ? "1" : "0", cheque_details: filters.chequeDetails ? "1" : "0",
      })
      // "كل الحسابات" ⇐ بلا فلتر (أسرع، ويشمل الفواتير النقدية بلا حساب)
      if (filters.accountIds.length && filters.accountIds.length < meta.accounts.length) params.set("account_ids", filters.accountIds.join(","))
      if (filters.branchIds.length) params.set("branch_ids", filters.branchIds.join(","))
      if (filters.salesmanIds.length) params.set("salesman_ids", filters.salesmanIds.join(","))
      if (Number(filters.fromValue) > 0) params.set("from_value", filters.fromValue)
      if (Number(filters.toValue) > 0) params.set("to_value", filters.toValue)
      const response = await fetch(`/api/reports/receipts-expenses?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setRows(data.rows || [])
      setCheques(data.cheques || {})
      setHasRun(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setFilters({ ...defaultFilters(), currencyId: Number(meta.currencies[0]?.id || 0) })
    setRows([])
    setCheques({})
    setSearch("")
    setError("")
    setHasRun(false)
  }

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => !needle || `${row.vch_code} ${row.customer_code || ""} ${row.customer_name} ${row.notes} ${row.vch_type_name}`.toLowerCase().includes(needle))
  }, [rows, search])
  const totals = useMemo(() => ({
    cash: visibleRows.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0),
    cheques: visibleRows.reduce((sum, row) => sum + Number(row.cheques_amount || 0), 0),
    cards: visibleRows.reduce((sum, row) => sum + Number(row.cards_amount || 0), 0),
    total: visibleRows.reduce((sum, row) => sum + Number(row.total || 0), 0),
  }), [visibleRows])
  // تفاصيل الشيكات أسفل سندها (كالشامل)
  const gridRows = useMemo<GridRow[]>(() => visibleRows.flatMap((row) => [
    row,
    ...(filters.chequeDetails ? (cheques[row.id] || []).map((cheque): GridRow => ({
      __kind: "cheque",
      __text: [`${tr("شيك رقم")} ${cheque.cheq_num || ""}`, cheque.bank_name, cheque.branch_name, cheque.bank_account && `${tr("حساب")} ${cheque.bank_account}`, cheque.due_date && `${tr("استحقاق")} ${cheque.due_date}`, cheque.currency_code && `${money.format(cheque.amount)} ${cheque.currency_code}`].filter(Boolean).join(" · "),
    })) : []),
  ]), [visibleRows, cheques, filters.chequeDetails])
  const currencyLabel = String(meta.currencies.find((currency) => Number(currency.id) === filters.currencyId)?.currency_code || "")

  const openVoucher = (row: GridRow) => {
    if (row.__kind || !row.id) return
    window.open(voucherHref(Number(row.id), Number(row.vch_type), sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")
  }

  return (
    <ReportPage loading={loading || running}>
      <ReportHeader
        icon={kind === "receipts" ? ArrowDownToLine : ArrowUpFromLine}
        category={tr("تقارير محاسبية")}
        title={<>{tr(text.title)}</>}
        description={<>{tr(text.description)}</>}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!visibleRows.length}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><Input type="date" value={filters.fromDate} onChange={(event) => set({ fromDate: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>{tr("إلى تاريخ")}</Label><Input type="date" value={filters.toDate} onChange={(event) => set({ toDate: event.target.value })} className="rounded-xl" /></div>
          <ReportCurrencyFilter currencies={meta.currencies} value={filters.currencyId} onChange={(currencyId) => set({ currencyId })} />
          <OtherCurrenciesFilter checked={filters.showOther} onCheckedChange={(showOther) => set({ showOther })} />
          <ReportMultiChoice label={tr("الحسابات")} options={meta.accounts} selected={filters.accountIds} onChange={(accountIds) => set({ accountIds })} placeholder={loading ? tr("جاري التحميل...") : tr("جميع الحسابات")} />
          <ReportMultiChoice label={tr("الفروع")} options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => set({ branchIds })} placeholder={tr("جميع الفروع المتاحة")} />
          <ReportMultiChoice label={tr("مندوب الحركة")} options={meta.salesmen} selected={filters.salesmanIds} onChange={(salesmanIds) => set({ salesmanIds })} placeholder={tr("جميع المندوبين")} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label>{tr("من قيمة")}</Label><Input type="number" min={0} value={filters.fromValue} onChange={(event) => set({ fromValue: event.target.value })} className="rounded-xl" dir="ltr" /></div>
            <div className="space-y-2"><Label>{tr("إلى قيمة")}</Label><Input type="number" min={0} value={filters.toValue} onChange={(event) => set({ toValue: event.target.value })} className="rounded-xl" dir="ltr" /></div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={filters.chequeDetails} onCheckedChange={(value) => set({ chequeDetails: value === true })} />
            {tr("إظهار تفاصيل الشيكات")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={reset}><RefreshCcw className="me-2 h-4 w-4" />{tr("مسح الفلاتر")}</Button>
            <Button data-report-apply onClick={() => void run()} disabled={running || loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600">
              {running ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Search className="me-2 h-4 w-4" />}{tr("عرض النتائج")}
            </Button>
          </div>
        </div>
      </ReportFilters>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReportSummaryCard label={tr("نقدي")}>{money.format(totals.cash)}</ReportSummaryCard>
        <ReportSummaryCard label={tr("شيكات")}>{money.format(totals.cheques)}</ReportSummaryCard>
        <ReportSummaryCard label={tr("بطاقات")}>{money.format(totals.cards)}</ReportSummaryCard>
        <ReportSummaryCard label={tr("المجموع")}>{money.format(totals.total)}</ReportSummaryCard>
      </section>

      <section className="report-results">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-bold">{tr(text.title)} {filters.fromDate} — {filters.toDate}{currencyLabel ? ` · ${currencyLabel}` : ""}</h2>
            <p className="text-xs text-muted-foreground">{visibleRows.length.toLocaleString("ar-u-nu-latn")}{tr(" سند")}</p>
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr("ابحث برقم السند أو الحساب أو الملاحظات...")} className="w-full rounded-xl sm:w-80" />
        </div>
        <ReportGrid rows={gridRows} exportFileName={tr(text.title)} onRowDoubleClick={openVoucher}
          rowClassName={(row) => (row.__kind === "cheque" ? "report-row-muted" : undefined)}
          emptyText={running ? undefined : hasRun ? tr(text.empty) : tr("اختر الفلاتر ثم اضغط عرض النتائج")}
          columns={[
            { key: "vch_date", label: tr("التاريخ"), width: 110 },
            { key: "vch_code", label: tr("رقم السند"), width: 130 },
            { key: "vch_type_name", label: tr("نوع السند"), width: 140 },
            { key: "cash_amount", label: tr("نقدي"), type: "number", width: 130, total: totals.cash },
            { key: "cheques_amount", label: tr("شيكات"), type: "number", width: 130, total: totals.cheques },
            { key: "cards_amount", label: tr("بطاقات"), type: "number", width: 130, total: totals.cards },
            { key: "total", label: tr("المجموع"), type: "number", width: 140, total: totals.total },
            { key: "customer_code", label: tr("رقم الحساب"), width: 120 },
            { key: "customer_name", label: tr("اسم الحساب"), width: "*", minWidth: 220, value: (row) => (row.__kind === "cheque" ? row.__text : row.customer_name) },
            { key: "branch_name", label: tr("الفرع"), width: 130 },
            { key: "notes", label: tr("ملاحظات"), width: 220 },
          ]} />
      </section>
    </ReportPage>
  )
}

export function ReceiptsReport() { return <ReceiptsExpensesReport kind="receipts" /> }
export function ExpensesReport() { return <ReceiptsExpensesReport kind="expenses" /> }
