"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarX2, Lock, LockOpen, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

// إقفال الفترات: فترة مقفلة لفرع أو لكل الفروع — يمنع إضافة/تعديل/ترحيل/إلغاء/حذف أي سند بتاريخ داخلها
// (فرض في Trigger السندات — lib/working-period.ts). الطباعة مسموحة.

type LockRow = {
  id: number; branch_id: number | null; branch_name: string | null; from_date: string; to_date: string; note: string | null
  is_active: boolean; voucher_count: number; created_by: string | null; updated_at: string
}
type Branch = { id: number; name: string }

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const monthRange = (offset: number) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { from: iso(start), to: iso(end) }
}

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

export default function PeriodLocks() {
  const { toast } = useToast()
  const [rows, setRows] = useState<LockRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const lastMonth = monthRange(-1)
  const [form, setForm] = useState({ branch_id: "", from_date: lastMonth.from, to_date: lastMonth.to, note: "" })
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ rows: LockRow[]; branches: Branch[] }>("/api/period-locks")
      setRows(data.rows || [])
      setBranches(data.branches || [])
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const run = async (action: () => Promise<unknown>, message: string) => {
    setSaving(true)
    try { await action(); toast({ title: message }); await load() }
    catch (error) { toast({ title: "تعذر التنفيذ", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
    finally { setSaving(false) }
  }

  const lockPeriod = (payload = form) => run(() => api("/api/period-locks", { method: "POST", body: JSON.stringify({ ...payload, branch_id: Number(payload.branch_id) || null }) }), "تم إقفال الفترة")
  const setActive = (row: LockRow, active: boolean) => {
    if (!active && !window.confirm(`فتح الفترة ${row.from_date} ← ${row.to_date}؟ سيصبح تعديل سنداتها ممكناً.`)) return
    void run(() => api("/api/period-locks", { method: "PATCH", body: JSON.stringify({ id: row.id, is_active: active }) }), active ? "أُعيد إقفال الفترة" : "فُتحت الفترة")
  }
  const remove = (row: LockRow) => {
    if (!window.confirm("حذف سجل هذه الفترة نهائياً؟")) return
    void run(() => api(`/api/period-locks?id=${row.id}`, { method: "DELETE" }), "حُذف السجل")
  }

  const visible = useMemo(() => rows.filter((row) => showInactive || row.is_active), [rows, showInactive])
  const lockedUntil = useMemo(() => {
    const allBranches = rows.filter((row) => row.is_active && row.branch_id == null).map((row) => row.to_date).sort()
    return allBranches[allBranches.length - 1] || null
  }, [rows])

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarX2 className="h-6 w-6 text-rose-600" />إقفال الفترات</h1>
          <p className="mt-1 text-sm text-muted-foreground">بعد إقفال فترة لا يمكن إضافة أو تعديل أو ترحيل أو إلغاء أو حذف أي سند بتاريخ داخلها — لفرع محدد أو لكل الفروع.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
      </div>

      {lockedUntil && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          <Lock className="h-4 w-4" />آخر فترة مقفلة لكل الفروع تنتهي في <b className="font-mono">{lockedUntil}</b>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">إقفال سريع (كل الفروع):</span>
            {[{ label: "الشهر السابق", offset: -1 }, { label: "الشهر الحالي", offset: 0 }].map((option) => {
              const range = monthRange(option.offset)
              return <Button key={option.label} size="sm" variant="outline" disabled={saving}
                onClick={() => { if (window.confirm(`إقفال ${range.from} ← ${range.to} لكل الفروع؟`)) void lockPeriod({ branch_id: "", from_date: range.from, to_date: range.to, note: option.label }) }}>
                <Lock className="ml-1.5 h-3.5 w-3.5" />{option.label}</Button>
            })}
          </div>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.5fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>
                <option value="">كل الفروع</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>من تاريخ</Label><Input type="date" value={form.from_date} onChange={(event) => setForm({ ...form, from_date: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>إلى تاريخ</Label><Input type="date" value={form.to_date} onChange={(event) => setForm({ ...form, to_date: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>ملاحظة</Label><Input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="مثلاً: إقفال بعد التدقيق" /></div>
            <Button disabled={saving || !form.from_date || !form.to_date} onClick={() => void lockPeriod()}><Plus className="ml-1.5 h-4 w-4" />إقفال الفترة</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-bold">الفترات</span>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />إظهار الفترات المفتوحة</label>
          </div>
          {loading ? <div className="p-10 text-center text-muted-foreground">جاري التحميل...</div> : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">لا توجد فترات مقفلة</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="p-3 text-right">الفترة</th><th className="p-3 text-right">الفرع</th><th className="p-3 text-center">السندات</th><th className="p-3 text-right">ملاحظة</th><th className="p-3 text-center">الحالة</th><th className="p-3" /></tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className={`border-t ${row.is_active ? "" : "bg-slate-50/60 text-slate-500"}`}>
                      <td className="p-3 font-mono">{row.from_date} ← {row.to_date}</td>
                      <td className="p-3">{row.branch_id ? row.branch_name : <b>كل الفروع</b>}</td>
                      <td className="p-3 text-center font-mono">{row.voucher_count}</td>
                      <td className="p-3">{row.note || "—"}</td>
                      <td className="p-3 text-center">{row.is_active
                        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">مقفلة</span>
                        : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">مفتوحة</span>}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          {row.is_active
                            ? <Button size="sm" variant="outline" disabled={saving} onClick={() => setActive(row, false)}><LockOpen className="ml-1 h-3.5 w-3.5" />فتح</Button>
                            : <>
                                <Button size="sm" variant="outline" disabled={saving} onClick={() => setActive(row, true)}><Lock className="ml-1 h-3.5 w-3.5" />إقفال</Button>
                                <Button size="sm" variant="outline" className="text-rose-600" disabled={saving} onClick={() => remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
