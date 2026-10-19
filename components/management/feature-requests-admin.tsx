"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { formatStoredUtcDateTimeInHebron } from "@/lib/date-utils"
import { Loader2, Paperclip, RefreshCw } from "lucide-react"

type Attachment = { name: string }
type Row = { id: number; company_name: string; db_name: string; submitted_by_name: string; submitted_by: string; request_type: string; screen_name: string; details: string; attachments: Attachment[]; status: string; created_at: string; updated_at: string }
const statuses = ["جديد", "في انتظار الموافقة", "قيد التطوير", "تمت", "مرفوض", "تمت باصدار سابق"]

export function FeatureRequestsAdmin() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/management/admin/feature-requests", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الرسائل")
      setRows(Array.isArray(data) ? data : [])
    } catch (e: any) { setError(e.message || "تعذر تحميل الرسائل") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const updateStatus = async (id: number, status: string) => {
    setBusyId(id); setError("")
    try {
      const response = await fetch(`/api/management/admin/feature-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحديث الحالة")
      setRows((current) => current.map((row) => row.id === id ? { ...row, status: data.status, updated_at: data.updated_at } : row))
    } catch (e: any) { setError(e.message || "تعذر تحديث الحالة") }
    finally { setBusyId(null) }
  }
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-slate-800">بريد الرسائل والتحسينات</h2><p className="mt-1 text-sm text-slate-500">طلبات المشاكل والتعديلات والتطوير من جميع العملاء.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}/>تحديث</Button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-violet-600"/></div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">لا توجد رسائل حتى الآن.</div> : <div className="space-y-3">{rows.map((row) => <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold text-slate-800">{row.request_type} · {row.screen_name}</div><div className="mt-1 text-sm font-semibold text-violet-700">{row.company_name} <span className="font-normal text-slate-400">({row.db_name})</span></div><div className="mt-1 text-xs text-slate-500">{row.submitted_by_name} · {row.submitted_by} · {formatStoredUtcDateTimeInHebron(row.created_at)}</div></div><div className="flex items-center gap-2"><select aria-label="حالة الرسالة" value={row.status} onChange={(e) => void updateStatus(row.id, e.target.value)} disabled={busyId === row.id} className="h-9 rounded-md border bg-white px-2 text-sm">{statuses.map((status) => <option key={status}>{status}</option>)}</select>{busyId === row.id && <Loader2 className="h-4 w-4 animate-spin"/>}</div></div><p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{row.details}</p>{row.attachments?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{row.attachments.map((file, index) => <a key={`${file.name}-${index}`} href={`/api/management/admin/feature-requests/${row.id}/attachments/${index}`} download={file.name} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-indigo-700"><Paperclip className="h-3 w-3"/>{file.name}</a>)}</div>}</article>)}</div>}
  </section>
}
