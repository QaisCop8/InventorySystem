"use client"
import { tr } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Eye, Printer, RefreshCcw, Search } from "lucide-react"
import { printReportFrom } from "@/lib/voucher-print/report-print"
import { ReportPage, ReportHeader } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { ReportMultiChoice, type ReportOption } from "@/components/reports/account-statement-report"
import { ReportSummaryCard } from "@/components/reports/report-summary-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RESTAURANT_MONITOR_ACTIONS, RESTAURANT_MONITOR_LABEL, RESTAURANT_MONITOR_TONE } from "@/lib/restaurant-monitor"

// مراقبة المطعم (app/api/reports/restaurant-monitor): كل حركات المستخدمين في شاشة المطعم — العهدة والطلبات والأصناف.
type Row = {
  row_id: string; occurred_at: string; user_name: string; action: string; location_name: string | null; branch_name: string | null
  order_no: string | null; place: string; item_name: string | null; quantity: number | null; amount: number | null; shift_name: string | null; description: string
}

const ACTION_OPTIONS = RESTAURANT_MONITOR_ACTIONS.map((action) => ({ id: action.key, name: action.label })) as unknown as ReportOption[]
const TONE_CLASS: Record<string, string> = {
  custody: "bg-sky-100 text-sky-700",
  danger: "bg-rose-100 text-rose-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-violet-100 text-violet-700",
  success: "bg-emerald-100 text-emerald-700",
  neutral: "bg-slate-100 text-slate-700",
}
const DELETE_ACTIONS = new Set(["remove_item", "reduce_item"])
const CUSTODY_ACTIONS = new Set(RESTAURANT_MONITOR_ACTIONS.filter((action) => action.tone === "custody").map((action) => action.key as string))

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: unknown) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const dateTime = (value: unknown) => (value ? new Date(String(value)).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—")
const today = () => new Date().toISOString().slice(0, 10)
const emptyFilters = () => ({ from: today(), to: today(), locationIds: [] as number[], branchIds: [] as number[], userIds: [] as string[], actions: [] as string[], orderNo: "" })

export default function RestaurantMonitorReport() {
  const [meta, setMeta] = useState<{ locations: ReportOption[]; branches: ReportOption[]; users: ReportOption[] }>({ locations: [], branches: [], users: [] })
  const [filters, setFilters] = useState(emptyFilters)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/reports/restaurant-monitor?meta=1", { cache: "no-store" }).then((response) => response.json())
      .then((data) => setMeta({ locations: data.locations || [], branches: data.branches || [], users: data.users || [] })).catch(() => undefined)
  }, [])

  const run = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({
        from_date: filters.from, to_date: filters.to, location_ids: filters.locationIds.join(","), branch_ids: filters.branchIds.join(","),
        user_ids: filters.userIds.join(","), actions: filters.actions.join(","), order_no: filters.orderNo.trim(),
      })
      const response = await fetch(`/api/reports/restaurant-monitor?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr("تعذر تحميل التقرير"))
      setRows(data.rows || [])
      setTruncated(Boolean(data.truncated))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr("تعذر تحميل التقرير"))
    } finally { setLoading(false) }
  }, [filters])

  const summary = useMemo(() => {
    const list = rows || []
    return {
      deleted: list.filter((row) => DELETE_ACTIONS.has(row.action)).length,
      deletedValue: list.filter((row) => DELETE_ACTIONS.has(row.action)).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      cancelled: list.filter((row) => row.action === "cancel").length,
      custody: list.filter((row) => CUSTODY_ACTIONS.has(row.action)).length,
    }
  }, [rows])

  return (
    <ReportPage loading={loading}>
      <ReportHeader
        icon={Eye}
        category={tr("تقارير المطاعم")}
        title={tr("مراقبة المطعم")}
        description={tr("كل ما يقوم به المستخدمون في شاشة المطعم: فتح واستلام وتسليم العهدة، فتح الطاولات، إضافة وحذف الأصناف، الخصومات، النقل والدمج، الدفع والإلغاء")}
        actions={<Button className="bg-white text-emerald-800 hover:bg-emerald-50" onClick={(event) => void printReportFrom(event.currentTarget)} disabled={!rows?.length}><Printer className="me-2 h-4 w-4" />{tr("طباعة")}</Button>}
      />

      <ReportFilters>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label>{tr("من تاريخ")}</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-xl" /></div>
          <div className="space-y-2"><Label>{tr("إلى تاريخ")}</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-xl" /></div>
          <ReportMultiChoice label={tr("الموقع")} options={meta.locations} selected={filters.locationIds} onChange={(locationIds) => setFilters({ ...filters, locationIds })} placeholder={tr("كل المواقع")} />
          <ReportMultiChoice label={tr("الفرع")} options={meta.branches} selected={filters.branchIds} onChange={(branchIds) => setFilters({ ...filters, branchIds })} placeholder={tr("كل الفروع")} />
          <ReportMultiChoice label={tr("المستخدم")} options={meta.users} selected={filters.userIds as any} onChange={(userIds: any) => setFilters({ ...filters, userIds })} placeholder={tr("كل المستخدمين")} />
          <ReportMultiChoice label={tr("نوع الحركة")} options={ACTION_OPTIONS} selected={filters.actions as any} onChange={(actions: any) => setFilters({ ...filters, actions })} placeholder={tr("كل الحركات")} />
          <div className="space-y-2"><Label>{tr("رقم الطلب")}</Label><Input value={filters.orderNo} onChange={(event) => setFilters({ ...filters, orderNo: event.target.value })} placeholder={tr("الكل")} className="rounded-xl" /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="outline" onClick={() => setFilters(emptyFilters())} disabled={loading} className="min-w-32 rounded-xl"><RefreshCcw className="me-2 h-4 w-4" />{tr("مسح الفلاتر")}</Button>
          <Button data-report-apply onClick={() => void run()} disabled={loading} className="min-w-36 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-600"><Search className="me-2 h-4 w-4" />{tr("عرض النتائج")}</Button>
        </div>
      </ReportFilters>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {truncated && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{tr("النتائج كثيرة وتم عرض أحدث الحركات فقط؛ ضيّق الفترة أو الفلاتر")}</p>}

      {rows && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ReportSummaryCard label={tr("عدد الحركات")}>{String(rows.length)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("حذف/تخفيض أصناف")}>{`${summary.deleted} · ${money(summary.deletedValue)}`}</ReportSummaryCard>
            <ReportSummaryCard label={tr("طلبات ملغاة")}>{String(summary.cancelled)}</ReportSummaryCard>
            <ReportSummaryCard label={tr("حركات العهدة")}>{String(summary.custody)}</ReportSummaryCard>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["#", "التاريخ والوقت", "المستخدم", "الحركة", "الموقع", "رقم الطلب", "الطاولة", "الصنف", "الكمية", "المبلغ", "الوردية", "التفاصيل"].map((label) => (
                    <th key={label} className={`whitespace-nowrap p-2 ${label === "الكمية" || label === "المبلغ" ? "text-end" : "text-start"}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0
                  ? <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">{tr("لا توجد حركات للفترة والفلاتر المحددة")}</td></tr>
                  : rows.map((row, index) => (
                    <tr key={row.row_id} className={`border-t hover:bg-emerald-50/40 ${DELETE_ACTIONS.has(row.action) || row.action === "cancel" ? "bg-rose-50/40" : ""}`}>
                      <td className="p-2 font-mono text-xs text-slate-400">{index + 1}</td>
                      <td className="whitespace-nowrap p-2"><span dir="ltr" className="font-mono text-xs">{dateTime(row.occurred_at)}</span></td>
                      <td className="whitespace-nowrap p-2 font-semibold">{row.user_name || "—"}</td>
                      <td className="p-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${TONE_CLASS[RESTAURANT_MONITOR_TONE[row.action]] || TONE_CLASS.neutral}`}>{RESTAURANT_MONITOR_LABEL[row.action] || row.action}</span></td>
                      <td className="whitespace-nowrap p-2">{row.location_name || "—"}</td>
                      <td className="whitespace-nowrap p-2 font-mono">{row.order_no || "—"}</td>
                      <td className="p-2">{row.place || "—"}</td>
                      <td className="p-2">{row.item_name || "—"}</td>
                      <td className="p-2 text-end">{row.quantity === null ? "—" : <span dir="ltr" className="font-mono">{qty(row.quantity)}</span>}</td>
                      <td className="p-2 text-end">{row.amount === null ? "—" : <span dir="ltr" className="font-mono">{money(row.amount)}</span>}</td>
                      <td className="whitespace-nowrap p-2 text-xs text-slate-500">{row.shift_name || "—"}</td>
                      <td className="min-w-[220px] p-2 text-xs text-slate-600">{row.description || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ReportPage>
  )
}
