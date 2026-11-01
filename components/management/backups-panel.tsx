"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Database, Download, HardDriveDownload, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

// النسخ الاحتياطي (lib/backups.ts): نسخ يومي مجدول + نسخ يدوي، تنزيل، واستعادة شركة مع نسخة أمان تلقائية قبلها.
type Backup = {
  id: number; company_id: number | null; company_name: string | null; db_name: string; kind: "scheduled" | "manual" | "pre_restore"
  status: "running" | "done" | "failed"; size_bytes: number | null; error: string | null; created_by: string | null; started_at: string; finished_at: string | null
}
type RestoreJob = { id: number; backup_id: number; safety_backup_id: number | null; db_name: string; company_name: string | null; status: string; error: string | null; requested_by: string | null; started_at: string; finished_at: string | null }
type Target = { db_name: string; company_id: number | null; company_name: string }
type Data = { backups: Backup[]; restores: RestoreJob[]; targets: Target[]; configured: boolean; retention_days: number; management_db: string }

const KIND_LABEL: Record<Backup["kind"], string> = { scheduled: "مجدول", manual: "يدوي", pre_restore: "أمان قبل الاستعادة" }
const STATUS: Record<string, { label: string; tone: string }> = {
  running: { label: "جارٍ", tone: "bg-amber-100 text-amber-700" },
  done: { label: "مكتمل", tone: "bg-emerald-100 text-emerald-700" },
  failed: { label: "فشل", tone: "bg-rose-100 text-rose-700" },
}
const size = (bytes: number | null) => {
  if (!bytes) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes, unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}
const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")

export function BackupsPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [dbName, setDbName] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [restoring, setRestoring] = useState<Backup | null>(null)
  const [confirm, setConfirm] = useState("")

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/management/admin/backups?db_name=${encodeURIComponent(dbName)}`, { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "تعذر تحميل النسخ")
      setData(body); setError("")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل النسخ")
    } finally { setLoading(false) }
  }, [dbName])

  useEffect(() => { void load() }, [load])
  // تحديث تلقائي ما دامت هناك عملية جارية
  const running = Boolean(data?.backups.some((row) => row.status === "running") || data?.restores.some((row) => row.status === "running"))
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [running, load])

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/management/admin/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "تعذر تنفيذ العملية")
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تنفيذ العملية")
      return false
    } finally {
      setBusy(false)
      setTimeout(() => void load(), 600)
    }
  }

  const lastByDb = useMemo(() => {
    const map = new Map<string, Backup>()
    for (const row of data?.backups || []) if (row.status === "done" && !map.has(row.db_name)) map.set(row.db_name, row)
    return map
  }, [data])

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Database className="h-5 w-5 text-violet-600" />النسخ الاحتياطي</h2>
          <p className="text-sm text-slate-500">نسخة يومية تلقائية لكل شركة وقاعدة الإدارة، محفوظة {data?.retention_days} يوماً في Neon Object Storage</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button>
          <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => void post({ action: "backup_all" })} disabled={busy || !data?.configured}>
            <HardDriveDownload className="ml-2 h-4 w-4" />نسخ الكل الآن
          </Button>
        </div>
      </div>

      {data && !data.configured && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          التخزين غير مُعدّ. أضف في Render المتغيرات: BACKUP_S3_ENDPOINT، BACKUP_S3_BUCKET، BACKUP_S3_ACCESS_KEY_ID، BACKUP_S3_SECRET_ACCESS_KEY (و BACKUP_S3_REGION).
        </p>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr><th className="p-2 text-right">الشركة</th><th className="p-2 text-right">القاعدة</th><th className="p-2 text-right">آخر نسخة ناجحة</th><th className="p-2 text-right">الحجم</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {data?.targets.map((target) => {
              const last = lastByDb.get(target.db_name)
              const stale = !last || Date.now() - new Date(last.started_at).getTime() > 36 * 3600 * 1000
              return (
                <tr key={target.db_name} className="border-t">
                  <td className="p-2 font-semibold">{target.company_name}</td>
                  <td className="p-2 font-mono text-xs">{target.db_name}</td>
                  <td className={`p-2 text-xs ${stale ? "font-bold text-rose-600" : ""}`}>{last ? when(last.started_at) : "لا توجد"}</td>
                  <td className="p-2 text-xs">{size(last?.size_bytes ?? null)}</td>
                  <td className="p-2 text-left">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDbName(target.db_name)}>النسخ</Button>
                      <Button size="sm" variant="outline" onClick={() => void post({ action: "backup", db_name: target.db_name })} disabled={busy || !data.configured}>نسخ الآن</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <h3 className="font-bold text-slate-700">سجل النسخ {dbName && <span className="font-mono text-xs text-violet-700">({dbName})</span>}</h3>
          <select value={dbName} onChange={(event) => setDbName(event.target.value)} className="rounded-lg border px-2 py-1 text-sm">
            <option value="">كل القواعد</option>
            {data?.targets.map((target) => <option key={target.db_name} value={target.db_name}>{target.company_name}</option>)}
          </select>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>{["#", "الشركة", "النوع", "الحالة", "الوقت", "الحجم", "بواسطة", ""].map((label) => <th key={label} className="p-2 text-right">{label}</th>)}</tr>
            </thead>
            <tbody>
              {!data?.backups.length && <tr><td colSpan={8} className="p-6 text-center text-slate-400">لا توجد نسخ بعد</td></tr>}
              {data?.backups.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="p-2 font-mono text-xs text-slate-400">{row.id}</td>
                  <td className="p-2">{row.company_name || row.db_name}</td>
                  <td className="p-2 text-xs">{KIND_LABEL[row.kind] || row.kind}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[row.status]?.tone}`}>{STATUS[row.status]?.label || row.status}</span>
                    {row.error && <p className="mt-1 max-w-[320px] break-words text-xs text-rose-600">{row.error}</p>}
                  </td>
                  <td className="whitespace-nowrap p-2 text-xs">{when(row.started_at)}</td>
                  <td className="p-2 text-xs">{size(row.size_bytes)}</td>
                  <td className="p-2 text-xs">{row.created_by || "—"}</td>
                  <td className="p-2">
                    {row.status === "done" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" asChild><a href={`/api/management/admin/backups/${row.id}/download`}><Download className="h-4 w-4" /></a></Button>
                        {row.db_name !== data.management_db && (
                          <Button size="sm" variant="outline" className="text-amber-700" title="استعادة" onClick={() => { setRestoring(row); setConfirm("") }}><RotateCcw className="h-4 w-4" /></Button>
                        )}
                        <Button size="sm" variant="outline" className="text-rose-600" title="حذف" disabled={busy}
                          onClick={() => { if (window.confirm(`حذف النسخة #${row.id} نهائياً؟`)) void post({ action: "delete", backup_id: row.id }) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {Boolean(data?.restores.length) && (
        <div className="rounded-2xl border bg-white p-3">
          <h3 className="mb-2 font-bold text-slate-700">عمليات الاستعادة</h3>
          <div className="space-y-1 text-sm">
            {data?.restores.map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 border-t pt-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[job.status]?.tone || "bg-slate-100"}`}>{STATUS[job.status]?.label || job.status}</span>
                <span>{job.company_name || job.db_name}</span>
                <span className="text-xs text-slate-500">من النسخة #{job.backup_id}{job.safety_backup_id ? ` · نسخة الأمان #${job.safety_backup_id}` : ""} · {when(job.started_at)} · {job.requested_by}</span>
                {job.error && <span className="w-full break-words text-xs text-rose-600">{job.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {restoring && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRestoring(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="flex items-center gap-2 text-lg font-bold text-rose-700"><AlertTriangle className="h-5 w-5" />استعادة نسخة</h3>
            <p className="text-sm text-slate-600">
              ستُستبدل كل بيانات <b>{restoring.company_name}</b> ببيانات النسخة #{restoring.id} ({when(restoring.started_at)}).
              كل ما أُدخل بعد ذلك الوقت سيُفقد. تؤخذ نسخة أمان تلقائياً قبل الاستعادة، ثم يُعاد تشغيل الخادم (دقيقة تقريباً).
            </p>
            <label className="block text-sm">اكتب اسم القاعدة <b className="font-mono">{restoring.db_name}</b> للتأكيد
              <input dir="ltr" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-1 w-full rounded-lg border px-2 py-1.5 font-mono" />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRestoring(null)}>إلغاء</Button>
              <Button className="bg-rose-600 hover:bg-rose-700" disabled={busy || confirm.trim() !== restoring.db_name}
                onClick={async () => { if (await post({ action: "restore", backup_id: restoring.id, confirm })) setRestoring(null) }}>
                <RotateCcw className="ml-2 h-4 w-4" />استعادة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
