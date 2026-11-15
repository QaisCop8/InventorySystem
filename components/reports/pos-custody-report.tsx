"use client"
import { tr } from "@/lib/i18n"
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
import { ReportGrid, type ReportGridColumn } from "@/components/reports/report-grid"

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
const STATUS_LABEL: Record<string, string> = { open: tr("مفتوحة"), handover_pending: tr("بانتظار الاستلام"), handed_over: tr("مُسلَّمة"), closed: tr("مغلقة") }
const STATUS_TONE: Record<string, string> = { open: "bg-sky-100 text-sky-700", handover_pending: "bg-amber-100 text-amber-700", handed_over: "bg-emerald-100 text-emerald-700", closed: "bg-slate-200 text-slate-700" }
const METHOD_LABEL: Record<string, string> = { cash: tr("نقدي"), card: tr("بطاقات"), cheque: tr("شيكات"), cheques: tr("شيكات"), credit: tr("ذمم"), account: tr("ذمم"), voucher: tr("قسائم") }
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
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setRows(data.rows || []); setExpanded(new Set())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
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
        category={tr("نظام البيع بالتجزئة")}
        title={tr("تقرير عهد البيع بالتجزئة")}
        description={tr("عهد الكاشير لكل وردية: النقد الافتتاحي والمتوقع والمسلَّم والفرق، المبيعات والدفعات، وعهدة الدخان")}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!hasData}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label={tr("نقاط البيع")} options={meta.points} selected={filters.pointIds} onChange={(pointIds) => setFilters({ ...filters, pointIds })} placeholder={tr("كل النقاط")} />
          <ReportMultiChoice label={tr("الكاشير")} options={meta.users} selected={filters.userIds} onChange={(userIds) => setFilters({ ...filters, userIds })} placeholder={tr("كل الكاشيرات")} />
          <ReportMultiChoice label={tr("حالة العهدة")} options={STATUS_OPTIONS} selected={filters.statuses} onChange={(statuses) => setFilters({ ...filters, statuses })} placeholder={tr("كل الحالات")} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="me-2 h-4 w-4" />{tr("عرض النتائج")}</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ReportSummaryCard label={tr("عدد العهد")}>{String(totals.sessions)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("صافي المبيعات")}>{money(totals.sales)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("النقد المتوقع")}>{money(totals.expected)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("فرق النقد")}>{money(totals.difference)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("فرق الدخان (كمية)")}>{qty(totals.tobaccoDiff)}</ReportSummaryCard>
          </div>

          {/* مثل باقي التقارير: الصفحة بارتفاع ثابت، والجدول وحده يتمرّر عمودياً وأفقياً (كان يُقصّ بلا تمرير) */}
          <section className="report-results">
          <ReportGrid rows={rows} exportFileName={tr("تقرير عهد البيع بالتجزئة")} emptyText={tr("لا توجد عهد في الفترة المحددة")}
              onRowDoubleClick={(row: any) => toggle(row.id)}
              rowClassName={(row: any) => expanded.has(row.id) ? "report-row-subtotal" : undefined}
              columns={[
                { key: "session", label: tr("الوردية"), width: 90, value: (row: any) => `#${row.id}` },
                { key: "point_name", label: tr("النقطة"), width: 140 },
                { key: "user_name", label: tr("الكاشير"), width: 140 },
                { key: "opened", label: tr("الفتح"), width: 150, value: (row: any) => when(row.opened_at) },
                { key: "closed", label: tr("الإغلاق/التسليم"), width: 150, value: (row: any) => when(row.closed_at) },
                { key: "status", label: tr("الحالة"), width: 110, value: (row: any) => STATUS_LABEL[row.status] || row.status, render: (row: any) => <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[row.status] || "bg-slate-100"}`}>{STATUS_LABEL[row.status] || row.status}</span> },
                { key: "opening_cash", label: tr("الافتتاحي"), type: "number", width: 120, total: true },
                { key: "net_sales", label: tr("صافي المبيعات"), type: "number", width: 130, total: true },
                { key: "expected_cash", label: tr("المتوقع"), type: "number", width: 120, total: true },
                { key: "counted_cash", label: tr("المسلَّم"), type: "number", width: 120, total: true },
                { key: "cash_difference", label: tr("الفرق"), type: "number", width: 110, total: true },
                { key: "tobacco_state", label: tr("الدخان"), width: 100, value: (row: any) => row.tobacco?.length ? (row.tobacco_handed_over ? tr("مُسلَّمة") : tr("مستلمة")) : "" },
              ]}/>
            <p className="px-2 pt-2 text-xs text-muted-foreground">{tr("انقر نقراً مزدوجاً على الوردية لعرض تفاصيل النقد والدفعات وعهدة الدخان")}</p>
            {rows.filter((row) => expanded.has(row.id)).map((row) => (
              <div key={row.id} className="mt-3 rounded-xl border bg-slate-50/60 p-3">
                <div className="mb-2 flex items-center justify-between"><b>{tr("الوردية")} #{row.id} — {row.point_name} · {row.user_name}</b><button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => toggle(row.id)}>{tr("إخفاء")}</button></div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                              <div className="space-y-2 rounded-xl border bg-white p-3 text-xs">
                                <b className="block text-sm">{tr("النقد والحركات")}</b>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  <span>{tr("عدد الفواتير: ")}<b>{row.invoices}</b></span><span>{tr("المرتجعات: ")}<b>{row.returns}</b></span>
                                  <span>{tr("إيداع نقدي: ")}<b dir="ltr">{money(row.cash_in)}</b></span><span>{tr("سحب نقدي: ")}<b dir="ltr">{money(row.cash_out)}</b></span>
                                  <span>{tr("استُلمت من: ")}<b>{row.received_from_user || tr("فتح جديد")}</b></span><span>{tr("سُلِّمت إلى: ")}<b>{row.handover_to_user || "—"}</b></span>
                                </div>
                                <b className="mt-2 block text-sm">{tr("الدفعات")}</b>
                                {row.payments?.length ? row.payments.map((payment) => (
                                  <div key={payment.method} className="flex justify-between border-t pt-1"><span>{METHOD_LABEL[payment.method] || payment.method} ({payment.count})</span><b dir="ltr">{money(payment.amount)} {row.currency_code}</b></div>
                                )) : <p className="text-muted-foreground">{tr("لا توجد دفعات")}</p>}
                              </div>
                              <div className="rounded-xl border bg-white p-3 text-xs">
                                <b className="mb-2 flex items-center gap-1.5 text-sm"><Cigarette className="h-4 w-4 text-amber-600" />{tr("عهدة الدخان")}</b>
                                {row.tobacco?.length ? (
                                  <table className="w-full">
                                    <thead className="text-slate-500"><tr><th className="p-1 text-start">{tr("الصنف")}</th><th className="p-1 text-center">{tr("الافتتاحي")}</th><th className="p-1 text-center">{tr("المباع")}</th><th className="p-1 text-center">{tr("المتوقع")}</th><th className="p-1 text-center">{tr("المسلَّم")}</th><th className="p-1 text-center">{tr("الفرق")}</th></tr></thead>
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
                                ) : <p className="text-muted-foreground">{tr("لا توجد عهدة دخان لهذه الوردية")}</p>}
                              </div>
                            </div>
              </div>
            ))}
          </section>
        </>
      )}
    </ReportPage>
  )
}
