"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, FileBarChart, MessageCircle, Printer, RefreshCw, Search } from "lucide-react"
import { ReportHeader, ReportPage } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Row = {
  id: number
  report_key: string | null
  report_title: string | null
  action: string
  filters: Array<{ label: string; value: string }> | null
  branch_name: string | null
  user_id: string | null
  user_name: string | null
  details: Record<string, any> | null
  created_at: string
}

const ACTION_LABELS: Record<string, string> = { open: "فتح التقرير", run: "عرض التقرير", print: "طباعة التقرير", pdf: "حفظ PDF", whatsapp: "إرسال واتساب" }
const ACTION_TONES: Record<string, string> = { open: "bg-slate-100 text-slate-700", run: "bg-indigo-100 text-indigo-800", print: "bg-sky-100 text-sky-800", pdf: "bg-amber-100 text-amber-800", whatsapp: "bg-green-100 text-green-800" }
const CHANNELS: Record<string, string> = { business_api: "إرسال مباشر", share: "مشاركة", wa_link: "رابط واتساب", download: "تنزيل" }
const today = (offset = 0) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }
const dateTime = (value?: string | null) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const part = (number: number) => String(number).padStart(2, "0")
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
}

export default function ReportAuditReport() {
  const [rows, setRows] = useState<Row[]>([])
  const [users, setUsers] = useState<Array<{ user_id: string; user_name: string | null }>>([])
  const [reports, setReports] = useState<Array<{ report_key: string; report_title: string | null }>>([])
  const [from, setFrom] = useState(today(-30))
  const [to, setTo] = useState(today())
  const [action, setAction] = useState("")
  const [report, setReport] = useState("")
  const [userId, setUserId] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ from, to, action, report, user_id: userId, q: search })
      const response = await fetch(`/api/report-audit?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setUsers(Array.isArray(data.users) ? data.users : [])
      setReports(Array.isArray(data.reports) ? data.reports : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => ({
    runs: rows.filter(row => row.action === "run" || row.action === "open").length,
    prints: rows.filter(row => row.action === "print").length,
    shared: rows.filter(row => row.action === "whatsapp" || row.action === "pdf").length,
    users: new Set(rows.map(row => row.user_id)).size,
  }), [rows])

  return <ReportPage loading={loading}>
    <ReportHeader title="تقرير ارشفة التقارير" icon={FileBarChart} category="الرقابة والتدقيق"
      description="من فتح أي تقرير ومتى، وبأي فلاتر عرضه، ومن طبعه أو حفظه PDF أو أرسله بواتساب ولمن."
      actions={<Button onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([["فتح/عرض", totals.runs, Eye], ["طباعة", totals.prints, Printer], ["PDF / واتساب", totals.shared, MessageCircle], ["مستخدمون", totals.users, FileBarChart]] as const).map(([label, value, Icon]) =>
        <Card key={label} className="report-summary-card"><CardContent className="flex items-center justify-between p-5"><div><p className="report-summary-label text-sm text-muted-foreground">{label}</p><p className="report-summary-value mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-7 w-7 text-teal-600" /></CardContent></Card>)}
    </div>

    <ReportFilters>
      <CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-[150px_150px_1.3fr_1fr_1fr_1.3fr_auto] xl:items-end">
        <div><Label htmlFor="ra-from">من تاريخ</Label><Input id="ra-from" className="mt-1" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
        <div><Label htmlFor="ra-to">إلى تاريخ</Label><Input id="ra-to" className="mt-1" type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
        <div><Label htmlFor="ra-report">التقرير</Label>
          <select id="ra-report" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={report} onChange={event => setReport(event.target.value)}>
            <option value="">الكل</option>
            {reports.map(item => <option key={item.report_key} value={item.report_key}>{item.report_title || item.report_key}</option>)}
          </select></div>
        <div><Label htmlFor="ra-action">العملية</Label>
          <select id="ra-action" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={action} onChange={event => setAction(event.target.value)}>
            <option value="">الكل</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div><Label htmlFor="ra-user">المستخدم</Label>
          <select id="ra-user" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={userId} onChange={event => setUserId(event.target.value)}>
            <option value="">الكل</option>
            {users.map(user => <option key={user.user_id} value={user.user_id}>{user.user_name || user.user_id}</option>)}
          </select></div>
        <div><Label htmlFor="ra-search">بحث بالفلاتر / العنوان</Label>
          <div className="relative mt-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="ra-search" data-report-apply-on-enter className="pr-9" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === "Enter" && void load()} placeholder="مثال: اسم عميل أو حساب" /></div></div>
        <Button data-report-apply onClick={() => void load()}>عرض</Button>
      </CardContent>
    </ReportFilters>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-teal-50 text-teal-950"><tr>
            <th className="p-3 text-right">الوقت</th><th className="p-3 text-right">المستخدم</th><th className="p-3 text-right">التقرير</th>
            <th className="p-3 text-right">العملية</th><th className="p-3 text-right">الفلاتر</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-right">إرسال إلى</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-t align-top hover:bg-teal-50/40">
            <td className="p-3 whitespace-nowrap font-mono" dir="ltr">{dateTime(row.created_at)}</td>
            <td className="p-3">{row.user_name || row.user_id || "-"}</td>
            <td className="p-3 font-semibold">{row.report_title || row.report_key || "-"}</td>
            <td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ACTION_TONES[row.action] || ""}`}>{ACTION_LABELS[row.action] || row.action}</span></td>
            <td className="p-3">{row.filters?.length
              ? <div className="flex max-w-[520px] flex-wrap gap-1">{row.filters.map((filter, index) => <span key={index} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs"><span className="text-muted-foreground">{filter.label}:</span> <b>{filter.value}</b></span>)}</div>
              : <span className="text-muted-foreground">-</span>}</td>
            <td className="p-3">{row.branch_name || "-"}</td>
            <td className="p-3 text-xs">{[row.details?.recipient, row.details?.phone && <span key="p" dir="ltr">{row.details.phone}</span>, row.details?.channel && CHANNELS[row.details.channel]].filter(Boolean).map((part, index) => <div key={index}>{part}</div>)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!loading && !rows.length && <div className="py-16 text-center text-muted-foreground">لا توجد عمليات مطابقة للفلاتر</div>}
    </div>
  </ReportPage>
}
