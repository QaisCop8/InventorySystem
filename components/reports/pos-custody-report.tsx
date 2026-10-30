"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, Cigarette, Printer, Search, Wallet } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// تقرير عهد البيع بالتجزئة (app/api/reports/pos-custody): كل الورديات/العهد في الفترة مع النقد والمبيعات وعهدة الدخان.
type TobaccoRow = { product_code: string; product_name: string; opening: number; sold: number | null; expected: number | null; counted: number | null; difference: number | null }
type Row = {
  id: number; status: string; opened_at: string; closed_at: string | null; point_code: string; point_name: string; currency_code: string; user_name: string
  opening_cash: number; expected_cash: number; counted_cash: number | null; handover_amount: number | null; cash_difference: number | null
  received_from_user: string | null; handover_to_user: string | null; tobacco_opened: boolean; tobacco_handed_over: boolean
  invoices: number; returns: number; net_sales: number; cash_in: number; cash_out: number
  payments: { method: string; amount: number; count: number }[]; tobacco: TobaccoRow[]
}

const STATUS_OPTIONS: ReportOption[] = [
  { id: 1, name: "مفتوحة", code: "open" } as any, { id: 2, name: "بانتظار الاستلام", code: "handover_pending" } as any,
  { id: 3, name: "مُسلَّمة", code: "handed_over" } as any, { id: 4, name: "مغلقة", code: "closed" } as any,
]
const STATUS_LABEL: Record<string, string> = { open: "مفتوحة", handover_pending: "بانتظار الاستلام", handed_over: "مُسلَّمة", closed: "مغلقة" }
const STATUS_TONE: Record<string, string> = { open: "bg-sky-100 text-sky-700", handover_pending: "bg-amber-100 text-amber-700", handed_over: "bg-emerald-100 text-emerald-700", closed: "bg-slate-200 text-slate-700" }
const METHOD_LABEL: Record<string, string> = { cash: "نقدي", card: "بطاقات", cheque: "شيكات", cheques: "شيكات", credit: "ذمم", account: "ذمم", voucher: "قسائم" }
const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => (value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 }))
const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`
const today = () => new Date().toISOString().slice(0, 10)

export default function PosCustodyReport() {
  const [meta, setMeta] = useState<{ points: ReportOption[]; users: ReportOption[] }>({ points: [], users: [] })
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), pointIds: [] as number[], userIds: [] as number[], statuses: [] as number[] })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch("/api/reports/pos-custody?meta=1", { cache: "no-store" }).then((response) => response.json()).then((data) => setMeta({ points: data.points || [], users: data.users || [] })).catch(() => undefined)
  }, [])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const statusCodes = filters.statuses.map((id) => (STATUS_OPTIONS.find((option) => option.id === id) as any)?.code).filter(Boolean)
      const query = new URLSearchParams({ from_date: filters.from, to_date: filters.to, point_ids: filters.pointIds.join(","), user_ids: filters.userIds.join(","), statuses: statusCodes.join(",") })
      const response = await fetch(`/api/reports/pos-custody?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(data.rows || []); setExpanded(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally { setLoading(false) }
  }, [filters])

  const totals = useMemo(() => (rows || []).reduce((sum, row) => ({
    sessions: sum.sessions + 1, sales: sum.sales + Number(row.net_sales || 0),
    expected: sum.expected + Number(row.expected_cash || 0), counted: sum.counted + Number(row.counted_cash ?? 0),
    difference: sum.difference + Number(row.cash_difference || 0),
    tobaccoDiff: sum.tobaccoDiff + (row.tobacco || []).reduce((s, line) => s + Number(line.difference || 0), 0),
  }), { sessions: 0, sales: 0, expected: 0, counted: 0, difference: 0, tobaccoDiff: 0 }), [rows])

  const toggle = (id: number) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const hasData = Boolean(rows?.length)

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Wallet}
        category="نظام البيع بالتجزئة"
        title="تقرير عهد البيع بالتجزئة"
        description="عهد الكاشير لكل وردية: النقد الافتتاحي والمتوقع والمسلَّم والفرق، المبيعات والدفعات، وعهدة الدخان"
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="ml-2 h-4 w-4" />طباعة</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label="نقاط البيع" options={meta.points} selected={filters.pointIds} onChange={(pointIds) => setFilters({ ...filters, pointIds })} placeholder="كل النقاط" />
          <ReportMultiChoice label="الكاشير" options={meta.users} selected={filters.userIds} onChange={(userIds) => setFilters({ ...filters, userIds })} placeholder="كل الكاشيرات" />
          <ReportMultiChoice label="حالة العهدة" options={STATUS_OPTIONS} selected={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} placeholder="كل الحالات" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="ml-2 h-4 w-4" />عرض النتائج</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ReportSummaryCard label="عدد العهد">{String(totals.sessions)}</ReportSummaryCard>
            <ReportSummaryCard label="صافي المبيعات">{money(totals.sales)}</ReportSummaryCard>
            <ReportSummaryCard label="النقد المتوقع">{money(totals.expected)}</ReportSummaryCard>
            <ReportSummaryCard label="فرق النقد">{money(totals.difference)}</ReportSummaryCard>
            <ReportSummaryCard label="فرق الدخان (كمية)">{qty(totals.tobaccoDiff)}</ReportSummaryCard>
          </div>

          {/* مثل باقي التقارير: الصفحة بارتفاع ثابت، والجدول وحده يتمرّر عمودياً وأفقياً (كان يُقصّ بلا تمرير) */}
          <section className="report-results">
          <div className="report-table-scroll">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-2" />
                  <th className="p-2 text-right">الوردية</th><th className="p-2 text-right">النقطة</th><th className="p-2 text-right">الكاشير</th>
                  <th className="p-2 text-right">الفتح</th><th className="p-2 text-right">الإغلاق/التسليم</th><th className="p-2 text-center">الحالة</th>
                  <th className="p-2 text-left">الافتتاحي</th><th className="p-2 text-left">صافي المبيعات</th><th className="p-2 text-left">المتوقع</th>
                  <th className="p-2 text-left">المسلَّم</th><th className="p-2 text-left">الفرق</th><th className="p-2 text-center">الدخان</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">لا توجد عهد في الفترة المحددة</td></tr> : rows.map((row) => {
                  const open = expanded.has(row.id)
                  return (
                    <Fragment key={row.id}>
                      <tr className="cursor-pointer border-t hover:bg-emerald-50/40" onClick={() => toggle(row.id)}>
                        <td className="p-2 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</td>
                        <td className="p-2 font-mono">#{row.id}</td>
                        <td className="p-2">{row.point_name}</td>
                        <td className="p-2">{row.user_name}</td>
                        <td className="p-2 font-mono text-xs" dir="ltr">{when(row.opened_at)}</td>
                        <td className="p-2 font-mono text-xs" dir="ltr">{when(row.closed_at)}</td>
                        <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[row.status] || "bg-slate-100"}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
                        <td className="p-2 text-left font-mono" dir="ltr">{money(row.opening_cash)}</td>
                        <td className="p-2 text-left font-mono" dir="ltr">{money(row.net_sales)}</td>
                        <td className="p-2 text-left font-mono" dir="ltr">{money(row.expected_cash)}</td>
                        <td className="p-2 text-left font-mono" dir="ltr">{row.counted_cash == null ? "—" : money(row.counted_cash)}</td>
                        <td className={`p-2 text-left font-mono font-bold ${row.cash_difference == null ? "" : Math.abs(Number(row.cash_difference)) < 0.005 ? "text-emerald-600" : "text-rose-600"}`} dir="ltr">{row.cash_difference == null ? "—" : money(row.cash_difference)}</td>
                        <td className="p-2 text-center text-xs">{row.tobacco?.length ? (row.tobacco_handed_over ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">مُسلَّمة</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">مستلمة</span>) : "—"}</td>
                      </tr>
                      {open && (
                        <tr className="border-t bg-slate-50/60">
                          <td />
                          <td colSpan={12} className="p-3">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                              <div className="space-y-2 rounded-xl border bg-white p-3 text-xs">
                                <b className="block text-sm">النقد والحركات</b>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  <span>عدد الفواتير: <b>{row.invoices}</b></span><span>المرتجعات: <b>{row.returns}</b></span>
                                  <span>إيداع نقدي: <b dir="ltr">{money(row.cash_in)}</b></span><span>سحب نقدي: <b dir="ltr">{money(row.cash_out)}</b></span>
                                  <span>استُلمت من: <b>{row.received_from_user || "فتح جديد"}</b></span><span>سُلِّمت إلى: <b>{row.handover_to_user || "—"}</b></span>
                                </div>
                                <b className="mt-2 block text-sm">الدفعات</b>
                                {row.payments?.length ? row.payments.map((payment) => (
                                  <div key={payment.method} className="flex justify-between border-t pt-1"><span>{METHOD_LABEL[payment.method] || payment.method} ({payment.count})</span><b dir="ltr">{money(payment.amount)} {row.currency_code}</b></div>
                                )) : <p className="text-muted-foreground">لا توجد دفعات</p>}
                              </div>
                              <div className="rounded-xl border bg-white p-3 text-xs">
                                <b className="mb-2 flex items-center gap-1.5 text-sm"><Cigarette className="h-4 w-4 text-amber-600" />عهدة الدخان</b>
                                {row.tobacco?.length ? (
                                  <table className="w-full">
                                    <thead className="text-slate-500"><tr><th className="p-1 text-right">الصنف</th><th className="p-1 text-center">الافتتاحي</th><th className="p-1 text-center">المباع</th><th className="p-1 text-center">المتوقع</th><th className="p-1 text-center">المسلَّم</th><th className="p-1 text-center">الفرق</th></tr></thead>
                                    <tbody>
                                      {row.tobacco.map((line) => (
                                        <tr key={line.product_code} className="border-t">
                                          <td className="p-1">{line.product_name}<small className="block font-mono text-slate-400">{line.product_code}</small></td>
                                          <td className="p-1 text-center font-mono">{qty(line.opening)}</td><td className="p-1 text-center font-mono">{qty(line.sold)}</td>
                                          <td className="p-1 text-center font-mono">{qty(line.expected)}</td><td className="p-1 text-center font-mono">{qty(line.counted)}</td>
                                          <td className={`p-1 text-center font-mono font-bold ${line.difference == null ? "" : Math.abs(Number(line.difference)) < 0.0001 ? "text-emerald-600" : "text-rose-600"}`}>{qty(line.difference)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : <p className="text-muted-foreground">لا توجد عهدة دخان لهذه الوردية</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          </section>
        </>
      )}
    </ReportPage>
  )
}
