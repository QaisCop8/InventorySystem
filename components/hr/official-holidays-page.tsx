"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarDays, Send, Plus, Save, Trash2, RefreshCw } from "lucide-react"
import { Grid, HrPage, inputClass, type Column } from "./hr-shared"

type Holiday = { id?: number; name: string; holiday_date: string; end_date: string; is_paid: boolean; notes: string; distributed_count?: number }
const emptyHoliday: Holiday = { name: "", holiday_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), is_paid: true, notes: "" }
const columns: Column[] = [
  { key: "name", label: "اسم العطلة" },
  { key: "holiday_date", label: "من تاريخ", width: 130 },
  { key: "end_date", label: "إلى تاريخ", width: 130 },
  { key: "is_paid", label: "مدفوعة", width: 90, type: "boolean" },
  { key: "distributed_count", label: "الموظفون الموزع عليهم", width: 160, type: "number" },
]

export function OfficialHolidaysPage() {
  const [rows, setRows] = useState<Holiday[]>([])
  const [form, setForm] = useState<Holiday>(emptyHoliday)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch("/api/hr/official-holidays")
    setRows(response.ok ? await response.json() : [])
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.name.trim() || !form.holiday_date || !form.end_date) return setMessage("اسم العطلة والتاريخ مطلوبان")
    if (form.end_date < form.holiday_date) return setMessage("تاريخ النهاية يجب أن يكون بعد تاريخ البداية")
    setBusy(true); setMessage("")
    const response = await fetch("/api/hr/official-holidays", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (response.ok) { await load(); setOpen(false); setForm(emptyHoliday) } else setMessage((await response.json()).error || "تعذر حفظ العطلة")
    setBusy(false)
  }
  const remove = async () => {
    if (!form.id || !window.confirm("هل تريد حذف العطلة؟")) return
    const response = await fetch(`/api/hr/official-holidays?id=${form.id}`, { method: "DELETE" })
    if (response.ok) { await load(); setOpen(false); setForm(emptyHoliday) } else setMessage((await response.json()).error || "تعذر حذف العطلة")
  }
  const distribute = async (holiday: Holiday) => {
    if (!holiday.id) return
    setBusy(true); setMessage("")
    const response = await fetch("/api/hr/official-holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "distribute", holiday_id: holiday.id }) })
    const data = await response.json()
    setMessage(response.ok ? `تم توزيع العطلة على ${data.count || 0} موظف` : data.error || "تعذر توزيع العطلة")
    await load(); setBusy(false)
  }

  return <HrPage title="العطل الرسمية" subtitle="تعريف العطل الرسمية وتوزيعها مؤقتاً على جداول الموظفين والورديات">
    <Card className="border-slate-200 shadow-sm"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-5 w-5 text-emerald-600" />مثل عيد الفطر السعيد وعيد الأضحى والعطل الوطنية</div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button><Button onClick={() => { setForm(emptyHoliday); setMessage(""); setOpen(true) }}><Plus className="ml-2 h-4 w-4" />عطلة جديدة</Button></div></CardContent></Card>
    <Grid rows={rows} columns={columns} onDoubleClick={row => { setForm(row); setMessage(""); setOpen(true) }} />
    {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    <div className="grid gap-3 md:grid-cols-2">{rows.map(holiday => <Card key={holiday.id} className="border-slate-200"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="font-bold">{holiday.name}</p><p className="text-sm text-slate-500">{holiday.holiday_date} إلى {holiday.end_date} · {holiday.distributed_count || 0} موظف</p></div><Button disabled={busy} onClick={() => void distribute(holiday)}><Send className="ml-2 h-4 w-4" />توزيع على الورديات</Button></CardContent></Card>)}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>{form.id ? "تعديل عطلة رسمية" : "تعريف عطلة رسمية"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>اسم العطلة *</Label><Input className={inputClass} placeholder="عيد الفطر السعيد" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div><div><Label>من تاريخ *</Label><Input type="date" className={inputClass} value={form.holiday_date} onChange={e => setForm({ ...form, holiday_date: e.target.value })} /></div><div><Label>إلى تاريخ *</Label><Input type="date" className={inputClass} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div><label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={form.is_paid} onChange={e => setForm({ ...form, is_paid: e.target.checked })} /> عطلة مدفوعة</label><div className="sm:col-span-2"><Label>ملاحظات</Label><textarea className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div></div>{message && <p className="text-sm text-red-600">{message}</p>}<div className="flex justify-between"><Button variant="destructive" disabled={!form.id} onClick={() => void remove()}><Trash2 className="ml-2 h-4 w-4" />حذف</Button><Button disabled={busy} onClick={() => void save()}><Save className="ml-2 h-4 w-4" />حفظ</Button></div></DialogContent></Dialog>
  </HrPage>
}
