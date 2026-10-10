"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { AlarmClock, CalendarCheck, CalendarDays, CheckCircle2, Clock3, Cog, History, Loader2, Pencil, Play, Plus, RefreshCw, Save, ShieldCheck, Trash2, UserX, Wand2, XCircle } from "lucide-react"
import { HrPage, inputClass, selectClass } from "./hr-shared"

// صفحات الدوام الجديدة: معالجة حركات الدخول والخروج، حركات الدوام (إضافي/خصومات/إجازات...)، وتعديل سجلات
// الدوام لموظف — الحساب في lib/attendance-engine.ts وواجهات /api/hr/attendance-days و/attendance-transactions.

type Lookups = { employees: any[]; departments: any[]; branches: any[] }
type Day = {
  id: number; employee_id: number; employee_code: string; employee_name: string; department_name?: string; work_date: string
  shift_id: number | null; shift_code?: string; shift_name?: string; shift_color?: string
  scheduled_start: string | null; scheduled_end: string | null; check_in: string | null; check_out: string | null
  required_minutes: number; worked_minutes: number; late_minutes: number; early_leave_minutes: number; overtime_minutes: number
  punches_count: number; status: string; is_manual: boolean; notes?: string | null
}

export const STATUS: Record<string, { label: string; tone: string }> = {
  present: { label: "حاضر", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  late: { label: "متأخر", tone: "bg-amber-100 text-amber-800 ring-amber-200" },
  incomplete: { label: "بصمة ناقصة", tone: "bg-orange-100 text-orange-800 ring-orange-200" },
  absent: { label: "غائب", tone: "bg-rose-100 text-rose-800 ring-rose-200" },
  holiday: { label: "عطلة رسمية", tone: "bg-sky-100 text-sky-800 ring-sky-200" },
  day_off: { label: "يوم راحة", tone: "bg-slate-100 text-slate-600 ring-slate-200" },
  unscheduled: { label: "عمل بلا وردية", tone: "bg-violet-100 text-violet-800 ring-violet-200" },
  holiday_work: { label: "عمل في عطلة", tone: "bg-indigo-100 text-indigo-800 ring-indigo-200" },
  leave: { label: "إجازة", tone: "bg-teal-100 text-teal-800 ring-teal-200" },
  sick: { label: "إجازة مرضية", tone: "bg-cyan-100 text-cyan-800 ring-cyan-200" },
  mission: { label: "مهمة عمل", tone: "bg-blue-100 text-blue-800 ring-blue-200" },
}
export const TRANSACTION_TYPES: Record<string, { label: string; unit: "hours" | "days" | "amount"; kind: "earning" | "deduction" | "info" }> = {
  overtime: { label: "عمل إضافي", unit: "hours", kind: "earning" },
  holiday_overtime: { label: "عمل إضافي في عطلة", unit: "hours", kind: "earning" },
  late_deduction: { label: "خصم تأخير", unit: "hours", kind: "deduction" },
  early_leave_deduction: { label: "خصم خروج مبكر", unit: "hours", kind: "deduction" },
  absence_deduction: { label: "خصم غياب", unit: "days", kind: "deduction" },
  permission: { label: "مغادرة / إذن", unit: "hours", kind: "info" },
  paid_leave: { label: "إجازة مدفوعة", unit: "days", kind: "info" },
  unpaid_leave: { label: "إجازة بدون راتب", unit: "days", kind: "deduction" },
  sick_leave: { label: "إجازة مرضية", unit: "days", kind: "info" },
  bonus: { label: "مكافأة", unit: "amount", kind: "earning" },
  penalty: { label: "جزاء / خصم إداري", unit: "amount", kind: "deduction" },
  night_allowance: { label: "بدل مناوبة ليلية", unit: "days", kind: "earning" },
}
const UNIT_LABEL = { hours: "ساعة", days: "يوم", amount: "مبلغ" }
const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 7)}-01`
export const hm = (minutes: number) => {
  const value = Math.max(0, Math.round(Number(minutes) || 0))
  return value ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}` : "—"
}
const timeOnly = (value: string | null) => (value ? value.slice(11, 16) : "—")
const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("ar", { weekday: "short", timeZone: "UTC" })
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS[status] || { label: status, tone: "bg-slate-100 text-slate-600 ring-slate-200" }
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${meta.tone}`}>{meta.label}</span>
}
function ShiftChip({ code, name, color }: { code?: string | null; name?: string | null; color?: string | null }) {
  if (!code && !name) return <span className="text-xs text-slate-400">—</span>
  return <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: color || "#0d9488" }} title={name || ""}>{code || name}</span>
}

function useLookups() {
  const [lookups, setLookups] = useState<Lookups>({ employees: [], departments: [], branches: [] })
  useEffect(() => {
    fetch("/api/hr/lookups", { cache: "no-store" }).then((response) => response.json()).then((data) => setLookups({ employees: data.employees || [], departments: data.departments || [], branches: data.branches || [] })).catch(() => undefined)
  }, [])
  const employeeOptions = useMemo(() => lookups.employees.map((row) => ({ id: Number(row.id), code: row.employee_code, name: row.full_name })), [lookups.employees])
  return { ...lookups, employeeOptions }
}
function useShifts() {
  const [shifts, setShifts] = useState<any[]>([])
  useEffect(() => { fetch("/api/hr/shift-templates", { cache: "no-store" }).then((r) => r.json()).then((data) => setShifts(Array.isArray(data) ? data : [])).catch(() => undefined) }, [])
  return shifts
}

function Message({ text, tone = "error" }: { text: string; tone?: "error" | "success" }) {
  if (!text) return null
  return <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{text}</p>
}

// ═════════════════════════ نافذة تعديل يوم دوام (مشتركة) ═════════════════════════
export function DayEditDialog({ open, onOpenChange, day, employeeId, date, employeeName, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; day: Day | null; employeeId: number; date: string; employeeName?: string; onSaved: () => void
}) {
  const shifts = useShifts()
  const [form, setForm] = useState({ shift_id: "", check_in: "", check_out: "", status: "", notes: "", reason: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    setForm({
      shift_id: day?.shift_id ? String(day.shift_id) : "",
      check_in: day?.check_in ? day.check_in.replace(" ", "T") : "",
      check_out: day?.check_out ? day.check_out.replace(" ", "T") : "",
      status: ["leave", "mission", "sick", "absent", "day_off"].includes(String(day?.status)) && day?.is_manual ? String(day?.status) : "",
      notes: day?.notes || "",
      reason: "",
    })
    setError("")
  }, [open, day])
  const save = async () => {
    if (!form.reason.trim()) { setError("سبب التعديل مطلوب (يُسجَّل في سجل التعديلات)"); return }
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/hr/attendance-days", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, work_date: date, ...form, shift_id: form.shift_id ? Number(form.shift_id) : null }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ")
      onSaved(); onOpenChange(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر الحفظ") } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!day?.id) return
    const reason = window.prompt("سبب حذف سجل اليوم؟")
    if (!reason?.trim()) return
    const response = await fetch(`/api/hr/attendance-days?id=${day.id}&reason=${encodeURIComponent(reason)}`, { method: "DELETE" })
    if (response.ok) { onSaved(); onOpenChange(false) } else setError((await response.json()).error || "تعذر الحذف")
  }
  const defaultIn = `${date}T08:00`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader className="text-right">
          <DialogTitle>{day ? "تعديل سجل دوام" : "إضافة سجل دوام"}</DialogTitle>
          <DialogDescription>{employeeName} · {dayName(date)} {date}{day?.punches_count ? ` · ${day.punches_count} حركة بصمة` : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>الوردية</Label>
            <select className={selectClass} value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })}>
              <option value="">بلا وردية / راحة</option>
              {shifts.filter((s) => s.is_active || String(s.id) === form.shift_id).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name} ({String(s.start_time).slice(0, 5)} - {String(s.end_time).slice(0, 5)})</option>)}
            </select>
          </div>
          <div><Label>وقت الدخول</Label><Input type="datetime-local" dir="ltr" className={inputClass} value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} onFocus={() => { if (!form.check_in) setForm((f) => ({ ...f, check_in: defaultIn })) }} /></div>
          <div><Label>وقت الخروج</Label><Input type="datetime-local" dir="ltr" className={inputClass} value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} onFocus={() => { if (!form.check_out) setForm((f) => ({ ...f, check_out: `${date}T16:00` })) }} /></div>
          <div>
            <Label>الحالة</Label>
            <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">تلقائية حسب الأوقات</option>
              <option value="leave">إجازة</option><option value="sick">إجازة مرضية</option><option value="mission">مهمة عمل</option>
              <option value="absent">غائب</option><option value="day_off">يوم راحة</option>
            </select>
          </div>
          <div><Label>ملاحظات</Label><Input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>سبب التعديل *</Label><Input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="مثال: نسي البصمة عند الخروج — تأكيد المسؤول" /></div>
        </div>
        <p className="text-xs text-slate-500">التأخير والخروج المبكر والعمل الإضافي تُحتسب تلقائياً من الوردية والأوقات. السجل المعدّل يدوياً لا يُستبدل عند إعادة المعالجة إلا بطلب.</p>
        <Message text={error} />
        <DialogFooter className="flex-row-reverse justify-between gap-2 sm:justify-between">
          <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}حفظ</Button>
          {day?.id ? <Button variant="outline" className="text-rose-700" onClick={() => void remove()}><Trash2 className="ml-2 h-4 w-4" />حذف السجل</Button> : <span />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═════════════════════════ معالجة حركات الدخول والخروج ═════════════════════════
export function AttendanceProcessingPage() {
  const lookups = useLookups()
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), departmentId: "", branchId: "", employeeIds: [] as number[], overwrite: false })
  const [rows, setRows] = useState<Day[]>([])
  const [statusFilter, setStatusFilter] = useState("")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" }>({ text: "", tone: "success" })
  const [editing, setEditing] = useState<Day | null>(null)

  const query = () => {
    const params = new URLSearchParams({ from: filters.from, to: filters.to })
    if (filters.departmentId) params.set("department_id", filters.departmentId)
    if (filters.branchId) params.set("branch_id", filters.branchId)
    if (filters.employeeIds.length) params.set("employee_ids", filters.employeeIds.join(","))
    return params
  }
  const load = useCallback(async () => {
    const response = await fetch(`/api/hr/attendance-days?${query()}`, { cache: "no-store" })
    setRows(response.ok ? await response.json() : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.departmentId, filters.branchId, filters.employeeIds])
  useEffect(() => { void load() }, [load])

  const process = async () => {
    if (filters.from > filters.to) { setMessage({ text: "تاريخ البداية بعد تاريخ النهاية", tone: "error" }); return }
    setBusy(true); setMessage({ text: "", tone: "success" })
    try {
      const response = await fetch("/api/hr/attendance-days", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "process", from: filters.from, to: filters.to, employee_ids: filters.employeeIds, department_id: Number(filters.departmentId) || 0, branch_id: Number(filters.branchId) || 0, overwrite_manual: filters.overwrite }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذرت المعالجة")
      setMessage({ text: `تمت معالجة ${data.processed} يوم لـ ${data.employees} موظف${data.skippedManual ? ` — تُرك ${data.skippedManual} سجل معدّل يدوياً دون تغيير` : ""}`, tone: "success" })
      await load()
    } catch (reason) { setMessage({ text: reason instanceof Error ? reason.message : "تعذرت المعالجة", tone: "error" }) } finally { setBusy(false) }
  }

  const visible = rows.filter((row) => (!statusFilter || row.status === statusFilter) && (!search || `${row.employee_code} ${row.employee_name} ${row.department_name || ""}`.toLowerCase().includes(search.toLowerCase())))
  const count = (status: string) => rows.filter((row) => row.status === status).length
  const sum = (key: keyof Day) => rows.reduce((total, row) => total + Number(row[key] || 0), 0)
  const cards: [string, string | number, any, string][] = [
    ["حاضر", count("present"), CheckCircle2, "text-emerald-600"], ["متأخر", count("late"), AlarmClock, "text-amber-600"],
    ["غائب", count("absent"), UserX, "text-rose-600"], ["بصمة ناقصة", count("incomplete"), XCircle, "text-orange-600"],
    ["ساعات إضافية", hm(sum("overtime_minutes")), Clock3, "text-indigo-600"], ["ساعات تأخير", hm(sum("late_minutes")), AlarmClock, "text-amber-700"],
  ]

  return (
    <HrPage title="معالجة حركات الدخول والخروج" subtitle="تحويل حركات البصمة إلى سجل دوام يومي لكل موظف حسب ورديته: الدخول والخروج، التأخير، الخروج المبكر، العمل الإضافي والغياب">
      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div><Label>من تاريخ</Label><Input type="date" dir="ltr" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" dir="ltr" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div><Label>القسم</Label><select className={selectClass} value={filters.departmentId} onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}><option value="">كل الأقسام</option>{lookups.departments.map((d) => <option key={d.id} value={d.id}>{d.department_name || d.name}</option>)}</select></div>
          <div><Label>الفرع</Label><select className={selectClass} value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}><option value="">كل الفروع</option>{lookups.branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}</select></div>
          <div className="lg:col-span-2"><ReportMultiChoice label="الموظفون" options={lookups.employeeOptions} selected={filters.employeeIds} onChange={(employeeIds) => setFilters({ ...filters, employeeIds })} placeholder="كل الموظفين" /></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={filters.overwrite} onCheckedChange={(v) => setFilters({ ...filters, overwrite: v === true })} />إعادة معالجة السجلات المعدّلة يدوياً أيضاً</label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />تحديث العرض</Button>
            <Button onClick={() => void process()} disabled={busy} className="bg-gradient-to-l from-teal-600 to-emerald-600">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Play className="ml-2 h-4 w-4" />}معالجة الحركات</Button>
          </div>
        </div>
      </div>
      <Message text={message.text} tone={message.tone} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, Icon, tone]) => (
          <div key={label} className={`${card} flex items-center gap-3 p-3`}>
            <span className={`rounded-xl bg-slate-50 p-2 ${tone}`}><Icon className="h-5 w-5" /></span>
            <div><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-black tabular-nums">{value}</p></div>
          </div>
        ))}
      </div>
      <div className={`${card} p-0`}>
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <button type="button" onClick={() => setStatusFilter("")} className={`rounded-full px-3 py-1 text-xs font-bold ${!statusFilter ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>الكل ({rows.length})</button>
          {Object.entries(STATUS).filter(([key]) => count(key)).map(([key, meta]) => (
            <button key={key} type="button" onClick={() => setStatusFilter(key)} className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${statusFilter === key ? "bg-slate-800 text-white ring-slate-800" : meta.tone}`}>{meta.label} ({count(key)})</button>
          ))}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالموظف أو القسم..." className="mr-auto h-9 w-full rounded-xl sm:w-64" />
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-800 text-white">
              <tr>{["التاريخ", "الموظف", "القسم", "الوردية", "المجدول", "الدخول", "الخروج", "ساعات العمل", "التأخير", "خروج مبكر", "إضافي", "الحالة", ""].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold">{label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b hover:bg-teal-50/60" onDoubleClick={() => setEditing(row)}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs"><span className="text-slate-400">{dayName(row.work_date)}</span> <span className="font-mono">{row.work_date}</span></td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-teal-700">{row.employee_code}</span> <b>{row.employee_name}</b></td>
                  <td className="px-3 py-2 text-xs">{row.department_name || "—"}</td>
                  <td className="px-3 py-2"><ShiftChip code={row.shift_code} name={row.shift_name} color={row.shift_color} /></td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500" dir="ltr">{row.scheduled_start ? `${timeOnly(row.scheduled_start)}-${timeOnly(row.scheduled_end)}` : "—"}</td>
                  <td className="px-3 py-2 font-mono font-bold" dir="ltr">{timeOnly(row.check_in)}</td>
                  <td className="px-3 py-2 font-mono font-bold" dir="ltr">{timeOnly(row.check_out)}</td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{hm(row.worked_minutes)}</td>
                  <td className={`px-3 py-2 font-mono ${row.late_minutes ? "font-bold text-amber-700" : "text-slate-300"}`} dir="ltr">{hm(row.late_minutes)}</td>
                  <td className={`px-3 py-2 font-mono ${row.early_leave_minutes ? "font-bold text-orange-700" : "text-slate-300"}`} dir="ltr">{hm(row.early_leave_minutes)}</td>
                  <td className={`px-3 py-2 font-mono ${row.overtime_minutes ? "font-bold text-indigo-700" : "text-slate-300"}`} dir="ltr">{hm(row.overtime_minutes)}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.status} />{row.is_manual && <span className="mr-1 text-[10px] font-bold text-violet-600" title="معدّل يدوياً">✎</span>}</td>
                  <td className="px-2 py-2"><Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></Button></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={13} className="py-14 text-center text-slate-500"><CalendarCheck className="mx-auto mb-2 h-9 w-9 text-slate-300" />لا توجد سجلات — اختر الفترة واضغط "معالجة الحركات"</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <DayEditDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} day={editing} employeeId={editing.employee_id} date={editing.work_date} employeeName={`${editing.employee_code} — ${editing.employee_name}`} onSaved={() => void load()} />}
    </HrPage>
  )
}

// ═════════════════════════ تعديل سجلات الدوام لموظف ═════════════════════════
export function AttendanceEditorPage() {
  const lookups = useLookups()
  const [employeeId, setEmployeeId] = useState("")
  const [month, setMonth] = useState(today().slice(0, 7))
  const [days, setDays] = useState<Day[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [editing, setEditing] = useState<{ date: string; day: Day | null } | null>(null)
  const employee = lookups.employees.find((row) => String(row.id) === employeeId)
  const from = `${month}-01`
  const to = useMemo(() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }, [month])

  const load = useCallback(async () => {
    if (!employeeId) { setDays([]); setAudit([]); return }
    const [daysResponse, auditResponse] = await Promise.all([
      fetch(`/api/hr/attendance-days?from=${from}&to=${to}&employee_ids=${employeeId}`, { cache: "no-store" }),
      fetch(`/api/hr/attendance-days?audit=1&employee_id=${employeeId}&from=${from}&to=${to}`, { cache: "no-store" }),
    ])
    setDays(daysResponse.ok ? await daysResponse.json() : [])
    setAudit(auditResponse.ok ? await auditResponse.json() : [])
  }, [employeeId, from, to])
  useEffect(() => { void load() }, [load])

  const dates = useMemo(() => { const list: string[] = []; for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) list.push(d.toISOString().slice(0, 10)); return list }, [from, to])
  const dayByDate = new Map(days.map((row) => [row.work_date, row]))
  const totals = { worked: days.reduce((s, r) => s + r.worked_minutes, 0), late: days.reduce((s, r) => s + r.late_minutes, 0), overtime: days.reduce((s, r) => s + r.overtime_minutes, 0), absent: days.filter((r) => r.status === "absent").length }

  return (
    <HrPage title="تعديل سجلات الدوام" subtitle="مراجعة وتصحيح سجل الدوام الشهري لموظف: إضافة يوم، تعديل الدخول والخروج أو الوردية، تسجيل إجازة أو مهمة — مع سجل كامل للتعديلات">
      <div className={`${card} grid gap-3 sm:grid-cols-3`}>
        <div className="sm:col-span-2"><Label>الموظف</Label><select className={selectClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">اختر الموظف</option>{lookups.employees.map((row) => <option key={row.id} value={row.id}>{row.employee_code} — {row.full_name}</option>)}</select></div>
        <div><Label>الشهر</Label><Input type="month" dir="ltr" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
      </div>
      {employeeId && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["ساعات العمل", hm(totals.worked)], ["التأخير", hm(totals.late)], ["العمل الإضافي", hm(totals.overtime)], ["أيام الغياب", totals.absent]].map(([label, value]) => (
              <div key={String(label)} className={`${card} p-3`}><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-black tabular-nums">{value}</p></div>
            ))}
          </div>
          <Tabs defaultValue="days" dir="rtl">
            <TabsList><TabsTrigger value="days"><CalendarDays className="ml-1 h-4 w-4" />أيام الشهر</TabsTrigger><TabsTrigger value="audit"><History className="ml-1 h-4 w-4" />سجل التعديلات ({audit.length})</TabsTrigger></TabsList>
            <TabsContent value="days">
              <div className={`${card} overflow-auto p-0`}>
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="sticky top-0 bg-slate-800 text-white"><tr>{["اليوم", "الوردية", "الدخول", "الخروج", "ساعات العمل", "التأخير", "خروج مبكر", "إضافي", "الحالة", "ملاحظات", ""].map((label) => <th key={label} className="px-3 py-2.5 text-right text-xs font-bold">{label}</th>)}</tr></thead>
                  <tbody>
                    {dates.map((date) => {
                      const row = dayByDate.get(date)
                      const weekend = [5, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())
                      return (
                        <tr key={date} className={`border-b hover:bg-teal-50/50 ${weekend ? "bg-slate-50/70" : ""}`} onDoubleClick={() => setEditing({ date, day: row || null })}>
                          <td className="whitespace-nowrap px-3 py-2 text-xs"><b className="text-slate-600">{dayName(date)}</b> <span className="font-mono">{date}</span></td>
                          <td className="px-3 py-2"><ShiftChip code={row?.shift_code} name={row?.shift_name} color={row?.shift_color} /></td>
                          <td className="px-3 py-2 font-mono font-bold" dir="ltr">{timeOnly(row?.check_in ?? null)}</td>
                          <td className="px-3 py-2 font-mono font-bold" dir="ltr">{timeOnly(row?.check_out ?? null)}</td>
                          <td className="px-3 py-2 font-mono" dir="ltr">{row ? hm(row.worked_minutes) : "—"}</td>
                          <td className="px-3 py-2 font-mono text-amber-700" dir="ltr">{row ? hm(row.late_minutes) : "—"}</td>
                          <td className="px-3 py-2 font-mono text-orange-700" dir="ltr">{row ? hm(row.early_leave_minutes) : "—"}</td>
                          <td className="px-3 py-2 font-mono text-indigo-700" dir="ltr">{row ? hm(row.overtime_minutes) : "—"}</td>
                          <td className="px-3 py-2">{row ? <><StatusBadge status={row.status} />{row.is_manual && <span className="mr-1 text-[10px] font-bold text-violet-600" title="معدّل يدوياً">✎</span>}</> : <span className="text-xs text-slate-400">لا سجل</span>}</td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500">{row?.notes || ""}</td>
                          <td className="px-2 py-2"><Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing({ date, day: row || null })}>{row ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</Button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="audit">
              <div className={`${card} space-y-2`}>
                {audit.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${entry.action === "delete" ? "bg-rose-100 text-rose-700" : entry.action === "create" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>{entry.action === "delete" ? "حذف" : entry.action === "create" ? "إضافة" : "تعديل"}</span>
                      <b className="font-mono">{entry.work_date}</b>
                      <span className="text-xs text-slate-500">{entry.changed_by_name || "—"} · {entry.changed_at}</span>
                    </div>
                    <p className="mt-1 text-slate-700">السبب: {entry.reason || "—"}</p>
                    {entry.before_data && entry.after_data && (
                      <p className="mt-1 font-mono text-xs text-slate-500" dir="ltr">
                        {String(entry.before_data.check_in || "—").slice(11, 16)}→{String(entry.after_data.check_in || "—").slice(11, 16)} · {String(entry.before_data.check_out || "—").slice(11, 16)}→{String(entry.after_data.check_out || "—").slice(11, 16)} · {entry.before_data.status}→{entry.after_data.status}
                      </p>
                    )}
                  </div>
                ))}
                {!audit.length && <p className="py-8 text-center text-sm text-slate-500">لا توجد تعديلات في هذا الشهر</p>}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      {!employeeId && <div className={`${card} py-14 text-center text-slate-500`}><Cog className="mx-auto mb-2 h-9 w-9 text-slate-300" />اختر الموظف والشهر لعرض سجل دوامه</div>}
      {editing && <DayEditDialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null) }} day={editing.day} employeeId={Number(employeeId)} date={editing.date} employeeName={employee ? `${employee.employee_code} — ${employee.full_name}` : ""} onSaved={() => void load()} />}
    </HrPage>
  )
}

// ═════════════════════════ حركات الدوام ═════════════════════════
const emptyTransaction = { id: 0, employee_id: "", trans_date: today(), trans_type: "overtime", quantity: "", amount: "", notes: "" }

export function AttendanceTransactionsPage() {
  const lookups = useLookups()
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), employeeIds: [] as number[], type: "", status: "" })
  const [rows, setRows] = useState<any[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [form, setForm] = useState<any>(emptyTransaction)
  const [open, setOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generate, setGenerate] = useState({ types: ["overtime", "late_deduction", "early_leave_deduction", "absence_deduction"], minLate: "0" })
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" }>({ text: "", tone: "success" })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ from: filters.from, to: filters.to })
    if (filters.employeeIds.length) params.set("employee_ids", filters.employeeIds.join(","))
    if (filters.type) params.set("type", filters.type)
    if (filters.status) params.set("status", filters.status)
    const response = await fetch(`/api/hr/attendance-transactions?${params}`, { cache: "no-store" })
    setRows(response.ok ? await response.json() : [])
    setSelected([])
  }, [filters])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/hr/attendance-transactions", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ")
      setOpen(false); await load(); setMessage({ text: "تم حفظ الحركة", tone: "success" })
    } catch (reason) { setMessage({ text: reason instanceof Error ? reason.message : "تعذر الحفظ", tone: "error" }) } finally { setSaving(false) }
  }
  const setStatus = async (status: string) => {
    if (!selected.length) return
    const response = await fetch("/api/hr/attendance-transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-status", ids: selected, status }) })
    if (response.ok) { await load(); setMessage({ text: status === "approved" ? "تم اعتماد الحركات المحددة" : status === "rejected" ? "تم رفض الحركات المحددة" : "أُعيدت لقيد الاعتماد", tone: "success" }) } else setMessage({ text: (await response.json()).error || "تعذر التحديث", tone: "error" })
  }
  const remove = async (row: any) => {
    if (!window.confirm("حذف الحركة؟")) return
    const response = await fetch(`/api/hr/attendance-transactions?id=${row.id}`, { method: "DELETE" })
    if (response.ok) await load(); else setMessage({ text: (await response.json()).error || "تعذر الحذف", tone: "error" })
  }
  const runGenerate = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/hr/attendance-transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", from: filters.from, to: filters.to, employee_ids: filters.employeeIds, types: generate.types, min_late_minutes: Number(generate.minLate) || 0 }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر التوليد")
      setGenerateOpen(false); await load(); setMessage({ text: `تم توليد ${data.created} حركة (قيد الاعتماد) من سجلات الدوام المعالَجة`, tone: "success" })
    } catch (reason) { setMessage({ text: reason instanceof Error ? reason.message : "تعذر التوليد", tone: "error" }) } finally { setSaving(false) }
  }

  const typeMeta = TRANSACTION_TYPES[form.trans_type] || TRANSACTION_TYPES.overtime
  const statusTone: Record<string, string> = { pending: "bg-amber-100 text-amber-800", approved: "bg-emerald-100 text-emerald-800", rejected: "bg-rose-100 text-rose-700" }
  const statusLabel: Record<string, string> = { pending: "قيد الاعتماد", approved: "معتمدة", rejected: "مرفوضة" }
  const totalBy = (kind: string, unit: string) => rows.filter((r) => r.status !== "rejected" && TRANSACTION_TYPES[r.trans_type]?.kind === kind && r.unit === unit).reduce((s, r) => s + Number(unit === "amount" ? r.amount : r.quantity), 0)

  return (
    <HrPage title="حركات الدوام" subtitle="العمل الإضافي، خصومات التأخير والغياب، المغادرات والإجازات، المكافآت والجزاءات وبدل المناوبات — يدوياً أو تلقائياً من سجلات الدوام، مع دورة اعتماد">
      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div><Label>من تاريخ</Label><Input type="date" dir="ltr" className={inputClass} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" dir="ltr" className={inputClass} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div className="lg:col-span-2"><ReportMultiChoice label="الموظفون" options={lookups.employeeOptions} selected={filters.employeeIds} onChange={(employeeIds) => setFilters({ ...filters, employeeIds })} placeholder="كل الموظفين" /></div>
          <div><Label>نوع الحركة</Label><select className={selectClass} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">كل الأنواع</option>{Object.entries(TRANSACTION_TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
          <div><Label>الحالة</Label><select className={selectClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">الكل</option><option value="pending">قيد الاعتماد</option><option value="approved">معتمدة</option><option value="rejected">مرفوضة</option></select></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => { setForm({ ...emptyTransaction, trans_date: today() }); setOpen(true) }}><Plus className="ml-2 h-4 w-4" />حركة جديدة</Button>
          <Button variant="outline" onClick={() => setGenerateOpen(true)}><Wand2 className="ml-2 h-4 w-4" />توليد من سجلات الدوام</Button>
          <Button variant="outline" className="border-emerald-200 text-emerald-700" disabled={!selected.length} onClick={() => void setStatus("approved")}><ShieldCheck className="ml-2 h-4 w-4" />اعتماد المحدد ({selected.length})</Button>
          <Button variant="outline" className="border-rose-200 text-rose-700" disabled={!selected.length} onClick={() => void setStatus("rejected")}><XCircle className="ml-2 h-4 w-4" />رفض المحدد</Button>
          <Button variant="ghost" disabled={!selected.length} onClick={() => void setStatus("pending")}>إعادة لقيد الاعتماد</Button>
        </div>
      </div>
      <Message text={message.text} tone={message.tone} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["ساعات إضافية", totalBy("earning", "hours").toFixed(2)], ["ساعات خصم", totalBy("deduction", "hours").toFixed(2)], ["أيام خصم/بدون راتب", totalBy("deduction", "days").toFixed(1)], ["مكافآت − جزاءات", (totalBy("earning", "amount") - totalBy("deduction", "amount")).toFixed(2)]].map(([label, value]) => (
          <div key={String(label)} className={`${card} p-3`}><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-black tabular-nums">{value}</p></div>
        ))}
      </div>
      <div className={`${card} max-h-[60vh] overflow-auto p-0`}>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-800 text-white">
            <tr>
              <th className="w-10 px-3 py-2.5"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={(v) => setSelected(v === true ? rows.map((r) => r.id) : [])} className="border-white" /></th>
              {["التاريخ", "الموظف", "نوع الحركة", "الكمية", "المبلغ", "المصدر", "الحالة", "ملاحظات", ""].map((label) => <th key={label} className="px-3 py-2.5 text-right text-xs font-bold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = TRANSACTION_TYPES[row.trans_type]
              return (
                <tr key={row.id} className="border-b hover:bg-teal-50/50" onDoubleClick={() => { if (row.status !== "approved") { setForm({ ...row, employee_id: String(row.employee_id) }); setOpen(true) } }}>
                  <td className="px-3 py-2"><Checkbox checked={selected.includes(row.id)} onCheckedChange={(v) => setSelected((list) => v === true ? [...list, row.id] : list.filter((id) => id !== row.id))} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{row.trans_date}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-teal-700">{row.employee_code}</span> <b>{row.employee_name}</b></td>
                  <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${meta?.kind === "earning" ? "bg-emerald-50 text-emerald-700" : meta?.kind === "deduction" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{meta?.label || row.trans_type}</span></td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{row.unit === "amount" ? "—" : `${Number(row.quantity).toFixed(2)} ${UNIT_LABEL[row.unit as keyof typeof UNIT_LABEL]}`}</td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{Number(row.amount) ? Number(row.amount).toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-xs">{row.source === "auto" ? "تلقائي" : "يدوي"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusTone[row.status]}`}>{statusLabel[row.status] || row.status}</span></td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-500">{row.notes || ""}</td>
                  <td className="px-2 py-2">{row.status !== "approved" && <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={() => void remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={10} className="py-14 text-center text-slate-500">لا توجد حركات في هذه الفترة</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader className="text-right"><DialogTitle>{form.id ? "تعديل حركة دوام" : "حركة دوام جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>الموظف *</Label><select className={selectClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}><option value="">اختر الموظف</option>{lookups.employees.map((row) => <option key={row.id} value={row.id}>{row.employee_code} — {row.full_name}</option>)}</select></div>
            <div><Label>التاريخ *</Label><Input type="date" dir="ltr" className={inputClass} value={form.trans_date} onChange={(e) => setForm({ ...form, trans_date: e.target.value })} /></div>
            <div><Label>نوع الحركة *</Label><select className={selectClass} value={form.trans_type} onChange={(e) => setForm({ ...form, trans_type: e.target.value })}>{Object.entries(TRANSACTION_TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
            {typeMeta.unit !== "amount" && <div><Label>{typeMeta.unit === "days" ? "عدد الأيام *" : "عدد الساعات *"}</Label><Input type="number" step="0.25" min="0" dir="ltr" className={inputClass} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>}
            <div><Label>{typeMeta.unit === "amount" ? "المبلغ *" : "المبلغ (اختياري)"}</Label><Input type="number" step="0.01" min="0" dir="ltr" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>ملاحظات</Label><Input className={inputClass} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>توليد حركات من سجلات الدوام</DialogTitle>
            <DialogDescription>من {filters.from} إلى {filters.to}{filters.employeeIds.length ? ` · ${filters.employeeIds.length} موظف` : " · كل الموظفين"} — الحركات تُنشأ "قيد الاعتماد" ولا تتكرر لنفس اليوم.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {["overtime", "late_deduction", "early_leave_deduction", "absence_deduction", "holiday_overtime"].map((type) => (
              <label key={type} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={generate.types.includes(type)} onCheckedChange={(v) => setGenerate((g) => ({ ...g, types: v === true ? [...g.types, type] : g.types.filter((t) => t !== type) }))} />{TRANSACTION_TYPES[type].label}</label>
            ))}
            <div className="pt-2"><Label>تجاهل التأخير الأقل من (دقيقة)</Label><Input type="number" min="0" dir="ltr" className={inputClass} value={generate.minLate} onChange={(e) => setGenerate({ ...generate, minLate: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => void runGenerate()} disabled={saving || !generate.types.length}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Wand2 className="ml-2 h-4 w-4" />}توليد</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </HrPage>
  )
}
