"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Eraser, Loader2, Moon, Pencil, Plus, Repeat, Save, Sun, Sunset, Trash2 } from "lucide-react"
import { HrPage, inputClass, selectClass } from "./hr-shared"
import { ShiftsPage } from "./shifts-page"

// الورديات وجدول المناوبات (نمط المستشفيات): لوحة موظفين × أيام بوردية لكل خلية، تدوير أنماط
// (مثل M,M,N,N,OFF,OFF) مع إزاحة بين الموظفين، قوالب الورديات بألوانها، والجداول الأسبوعية السابقة.

type Shift = { id: number; code: string; name: string; start_time: string; end_time: string; break_minutes: number; grace_minutes: number; is_overnight: boolean; color: string; shift_kind: string; overtime_after_minutes: number; is_active: boolean }
type Cell = { employee_id: number; roster_date: string; shift_id: number | null; is_day_off: boolean }

const KINDS: Record<string, { label: string; icon: any }> = {
  day: { label: "صباحية", icon: Sun }, evening: { label: "مسائية", icon: Sunset }, night: { label: "ليلية", icon: Moon },
  on_call: { label: "مناوبة / استدعاء", icon: Clock }, split: { label: "مجزأة", icon: Repeat },
}
const iso = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (value: string, days: number) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return iso(d) }
const weekStart = () => { const d = new Date(); const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7)); return iso(date) } // السبت
const shiftHours = (s: Shift) => {
  const [sh, sm] = s.start_time.split(":").map(Number); const [eh, em] = s.end_time.split(":").map(Number)
  let minutes = eh * 60 + em - (sh * 60 + sm); if (minutes <= 0) minutes += 1440
  return Math.max(0, minutes - (Number(s.break_minutes) || 0)) / 60
}
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"

function RosterBoard() {
  const [from, setFrom] = useState(weekStart())
  const [span, setSpan] = useState(14)
  const [departmentId, setDepartmentId] = useState("")
  const [departments, setDepartments] = useState<any[]>([])
  const [data, setData] = useState<{ employees: any[]; shifts: Shift[]; cells: Cell[] }>({ employees: [], shifts: [], cells: [] })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [brush, setBrush] = useState<string>("") // رسم سريع: shift id أو OFF أو CLEAR
  const [patternOpen, setPatternOpen] = useState(false)
  const to = addDays(from, span - 1)
  const dates = useMemo(() => Array.from({ length: span }, (_, i) => addDays(from, i)), [from, span])

  useEffect(() => { fetch("/api/hr/lookups", { cache: "no-store" }).then((r) => r.json()).then((d) => setDepartments(d.departments || [])).catch(() => undefined) }, [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/hr/shift-roster?from=${from}&to=${to}&department_id=${departmentId || 0}`, { cache: "no-store" })
      if (response.ok) setData(await response.json())
    } finally { setLoading(false) }
  }, [from, to, departmentId])
  useEffect(() => { void load() }, [load])

  const shiftById = useMemo(() => new Map(data.shifts.map((s) => [Number(s.id), s])), [data.shifts])
  const cellMap = useMemo(() => new Map(data.cells.map((c) => [`${c.employee_id}|${c.roster_date}`, c])), [data.cells])

  const saveCells = async (cells: any[]) => {
    const response = await fetch("/api/hr/shift-roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cells }) })
    if (!response.ok) { setMessage((await response.json()).error || "تعذر الحفظ"); return }
    setData((current) => {
      const map = new Map(current.cells.map((c) => [`${c.employee_id}|${c.roster_date}`, c]))
      for (const cell of cells) {
        const key = `${cell.employee_id}|${cell.roster_date}`
        if (cell.clear) map.delete(key); else map.set(key, { employee_id: cell.employee_id, roster_date: cell.roster_date, shift_id: cell.is_day_off ? null : cell.shift_id, is_day_off: Boolean(cell.is_day_off) })
      }
      return { ...current, cells: [...map.values()] }
    })
  }
  const choiceToCell = (employeeId: number, date: string, choice: string) =>
    choice === "CLEAR" ? { employee_id: employeeId, roster_date: date, clear: true }
      : choice === "OFF" ? { employee_id: employeeId, roster_date: date, is_day_off: true }
      : { employee_id: employeeId, roster_date: date, shift_id: Number(choice), is_day_off: false }
  const fillRow = (employeeId: number, choice: string) => void saveCells(dates.map((date) => choiceToCell(employeeId, date, choice)))

  const coverage = (date: string, shiftId: number) => data.employees.filter((e) => cellMap.get(`${e.id}|${date}`)?.shift_id === shiftId).length
  const employeeHours = (employeeId: number) => dates.reduce((sum, date) => { const c = cellMap.get(`${employeeId}|${date}`); const s = c?.shift_id ? shiftById.get(Number(c.shift_id)) : null; return sum + (s ? shiftHours(s) : 0) }, 0)

  const CellChoices = ({ onPick }: { onPick: (choice: string) => void }) => (
    <div className="grid gap-1">
      {data.shifts.map((s) => (
        <button key={s.id} type="button" onClick={() => onPick(String(s.id))} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-right text-sm hover:bg-slate-100">
          <span className="inline-flex min-w-9 justify-center rounded px-1 text-xs font-bold text-white" style={{ background: s.color }}>{s.code}</span>
          <span className="flex-1">{s.name}</span><span className="font-mono text-xs text-slate-500" dir="ltr">{s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}</span>
        </button>
      ))}
      <button type="button" onClick={() => onPick("OFF")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100"><span className="inline-flex min-w-9 justify-center rounded bg-slate-200 px-1 text-xs font-bold text-slate-600">OFF</span>راحة</button>
      <button type="button" onClick={() => onPick("CLEAR")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-rose-700 hover:bg-rose-50"><Eraser className="h-4 w-4" />مسح (يرجع للجدول الأسبوعي)</button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <div className="flex items-end gap-1">
          <Button variant="outline" size="icon" onClick={() => setFrom(addDays(from, -span))} title="الفترة السابقة"><ChevronRight className="h-4 w-4" /></Button>
          <div><Label>من</Label><Input type="date" dir="ltr" className={`${inputClass} w-40`} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></div>
          <Button variant="outline" size="icon" onClick={() => setFrom(addDays(from, span))} title="الفترة التالية"><ChevronLeft className="h-4 w-4" /></Button>
        </div>
        <div><Label>المدة</Label><select className={`${selectClass} w-32`} value={span} onChange={(e) => setSpan(Number(e.target.value))}>{[7, 14, 28, 31].map((n) => <option key={n} value={n}>{n} يوم</option>)}</select></div>
        <div><Label>القسم</Label><select className={`${selectClass} w-48`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}><option value="">كل الأقسام</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.department_name || d.name}</option>)}</select></div>
        <Button variant="outline" onClick={() => setPatternOpen(true)}><Repeat className="ml-2 h-4 w-4" />تدوير نمط</Button>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-teal-600" />}
        <div className="mr-auto flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500">فرشاة سريعة:</span>
          {data.shifts.map((s) => (
            <button key={s.id} type="button" onClick={() => setBrush(brush === String(s.id) ? "" : String(s.id))} title={s.name} className={`rounded-md px-2 py-1 text-xs font-bold text-white ring-offset-1 ${brush === String(s.id) ? "ring-2 ring-slate-900" : ""}`} style={{ background: s.color }}>{s.code}</button>
          ))}
          <button type="button" onClick={() => setBrush(brush === "OFF" ? "" : "OFF")} className={`rounded-md bg-slate-200 px-2 py-1 text-xs font-bold text-slate-600 ring-offset-1 ${brush === "OFF" ? "ring-2 ring-slate-900" : ""}`}>OFF</button>
          <button type="button" onClick={() => setBrush(brush === "CLEAR" ? "" : "CLEAR")} className={`rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 ring-offset-1 ${brush === "CLEAR" ? "ring-2 ring-slate-900" : ""}`}><Eraser className="inline h-3.5 w-3.5" /></button>
        </div>
      </div>
      {brush && <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">وضع الفرشاة مفعّل: انقر على أي خلية لتعيين {brush === "OFF" ? "راحة" : brush === "CLEAR" ? "المسح" : shiftById.get(Number(brush))?.name}. انقر الزر مرة أخرى للإلغاء.</p>}
      {message && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{message}</p>}
      {!data.shifts.length && !loading && <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">لا توجد ورديات معرّفة — أضفها من تبويب "قوالب الورديات" (مثال: M صباحي 07:00-15:00، E مسائي 15:00-23:00، N ليلي 23:00-07:00).</p>}

      <div className={`${card} overflow-auto p-0`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-800 text-white">
              <th className="sticky right-0 z-30 min-w-[220px] bg-slate-800 px-3 py-2 text-right text-xs">الموظف</th>
              {dates.map((date) => {
                const d = new Date(`${date}T00:00:00Z`)
                const weekend = [5, 6].includes(d.getUTCDay())
                return <th key={date} className={`min-w-[52px] px-1 py-1.5 text-center text-[11px] font-bold ${weekend ? "bg-slate-700" : ""}`}><div>{d.toLocaleDateString("ar", { weekday: "short", timeZone: "UTC" })}</div><div className="font-mono">{date.slice(8)}/{date.slice(5, 7)}</div></th>
              })}
              <th className="min-w-[64px] px-2 text-center text-xs">الساعات</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((employee) => (
              <tr key={employee.id} className="group">
                <td className="sticky right-0 z-10 border-b bg-white px-3 py-1.5 group-hover:bg-teal-50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="truncate font-semibold">{employee.full_name}</div><div className="text-[11px] text-slate-500"><span className="font-mono">{employee.employee_code}</span> · {employee.department_name || "—"}</div></div>
                    <Popover>
                      <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-slate-500" title="تعبئة الصف كاملاً">تعبئة</Button></PopoverTrigger>
                      <PopoverContent dir="rtl" className="w-72 p-2"><CellChoices onPick={(choice) => fillRow(Number(employee.id), choice)} /></PopoverContent>
                    </Popover>
                  </div>
                </td>
                {dates.map((date) => {
                  const cell = cellMap.get(`${employee.id}|${date}`)
                  const shift = cell?.shift_id ? shiftById.get(Number(cell.shift_id)) : undefined
                  const content = cell?.is_day_off
                    ? <span className="flex h-9 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">OFF</span>
                    : shift ? <span className="flex h-9 items-center justify-center rounded-md text-xs font-black text-white shadow-sm" style={{ background: shift.color }} title={`${shift.name} ${shift.start_time.slice(0, 5)}-${shift.end_time.slice(0, 5)}`}>{shift.code}</span>
                    : <span className="flex h-9 items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-300 group-hover:border-teal-300">+</span>
                  if (brush) return <td key={date} className="border-b p-0.5"><button type="button" className="w-full" onClick={() => void saveCells([choiceToCell(Number(employee.id), date, brush)])}>{content}</button></td>
                  return (
                    <td key={date} className="border-b p-0.5">
                      <Popover>
                        <PopoverTrigger asChild><button type="button" className="w-full">{content}</button></PopoverTrigger>
                        <PopoverContent dir="rtl" className="w-72 p-2"><p className="mb-1 px-2 text-xs text-slate-500">{employee.full_name} · {date}</p><CellChoices onPick={(choice) => void saveCells([choiceToCell(Number(employee.id), date, choice)])} /></PopoverContent>
                      </Popover>
                    </td>
                  )
                })}
                <td className="border-b px-2 text-center font-mono text-xs font-bold text-slate-600">{employeeHours(Number(employee.id)).toFixed(0)}</td>
              </tr>
            ))}
            {data.employees.length > 0 && data.shifts.map((shift) => (
              <tr key={`cov-${shift.id}`} className="bg-slate-50">
                <td className="sticky right-0 z-10 border-b bg-slate-50 px-3 py-1 text-xs font-bold"><span className="ml-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: shift.color }} />تغطية {shift.name}</td>
                {dates.map((date) => { const n = coverage(date, Number(shift.id)); return <td key={date} className={`border-b text-center font-mono text-xs font-bold ${n ? "text-slate-700" : "text-rose-400"}`}>{n}</td> })}
                <td className="border-b" />
              </tr>
            ))}
            {!data.employees.length && <tr><td colSpan={dates.length + 2} className="py-12 text-center text-slate-500">لا يوجد موظفون نشطون</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">أولوية تحديد وردية الموظف عند معالجة الدوام: جدول المناوبات اليومي ← قواعد الجدول (الموظف ثم القسم) ← الجدول الأسبوعي. الخلية الفارغة تعني الرجوع للجدول الأسبوعي.</p>
      <PatternDialog open={patternOpen} onOpenChange={setPatternOpen} employees={data.employees} shifts={data.shifts} defaultFrom={from} defaultTo={to} onDone={() => void load()} />
    </div>
  )
}

function PatternDialog({ open, onOpenChange, employees, shifts, defaultFrom, defaultTo, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; employees: any[]; shifts: Shift[]; defaultFrom: string; defaultTo: string; onDone: () => void }) {
  const [form, setForm] = useState({ employeeIds: [] as number[], from: defaultFrom, to: defaultTo, pattern: "", offset: "0" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { if (open) { setForm((f) => ({ ...f, from: defaultFrom, to: defaultTo })); setError("") } }, [open, defaultFrom, defaultTo])
  const tokens = form.pattern.split(/[,،\s]+/).map((t) => t.trim().toUpperCase()).filter(Boolean)
  const presets = useMemo(() => {
    const codes = shifts.map((s) => s.code.toUpperCase())
    const list: [string, string][] = []
    if (codes.length >= 2) list.push(["2 نهار، 2 ليل، 2 راحة", `${codes[0]},${codes[0]},${codes[codes.length - 1]},${codes[codes.length - 1]},OFF,OFF`])
    if (codes.length >= 3) list.push(["تدوير 3 ورديات", `${codes[0]},${codes[0]},${codes[1]},${codes[1]},${codes[2]},${codes[2]},OFF,OFF`])
    if (codes.length >= 1) list.push(["5 عمل + 2 راحة", `${codes[0]},${codes[0]},${codes[0]},${codes[0]},${codes[0]},OFF,OFF`])
    if (codes.length >= 1) list.push(["24 ساعة / 48 راحة", `${codes[0]},OFF,OFF`])
    return list
  }, [shifts])
  const run = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/hr/shift-roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pattern", employee_ids: form.employeeIds, from: form.from, to: form.to, pattern: tokens, offset_per_employee: Number(form.offset) || 0 }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر التطبيق")
      onDone(); onOpenChange(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التطبيق") } finally { setSaving(false) }
  }
  const colorOf = (code: string) => shifts.find((s) => s.code.toUpperCase() === code)?.color
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader className="text-right">
          <DialogTitle>تدوير نمط ورديات</DialogTitle>
          <DialogDescription>اكتب رموز الورديات بالترتيب مفصولة بفواصل، و OFF لأيام الراحة. يتكرر النمط على الفترة، والإزاحة توزّع الموظفين على مراحل مختلفة لضمان التغطية.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ReportMultiChoice label="الموظفون *" options={employees.map((e) => ({ id: Number(e.id), code: e.employee_code, name: e.full_name }))} selected={form.employeeIds} onChange={(employeeIds) => setForm({ ...form, employeeIds })} placeholder="اختر الموظفين" />
          <div className="grid grid-cols-3 gap-3">
            <div><Label>من</Label><Input type="date" dir="ltr" className={inputClass} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
            <div><Label>إلى</Label><Input type="date" dir="ltr" className={inputClass} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
            <div><Label>إزاحة لكل موظف (يوم)</Label><Input type="number" min="0" dir="ltr" className={inputClass} value={form.offset} onChange={(e) => setForm({ ...form, offset: e.target.value })} /></div>
          </div>
          <div><Label>النمط *</Label><Input dir="ltr" className={`${inputClass} font-mono`} value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="M,M,N,N,OFF,OFF" /></div>
          {presets.length > 0 && <div className="flex flex-wrap gap-1.5">{presets.map(([label, value]) => <button key={label} type="button" onClick={() => setForm({ ...form, pattern: value })} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold hover:bg-teal-100">{label}</button>)}</div>}
          {tokens.length > 0 && <div className="flex flex-wrap gap-1">{tokens.map((t, i) => <span key={i} className="rounded px-2 py-0.5 font-mono text-xs font-bold" style={{ background: t === "OFF" ? "#e2e8f0" : colorOf(t) || "#fecaca", color: t === "OFF" ? "#475569" : "#fff" }}>{t}</span>)}<span className="text-xs text-slate-500">دورة {tokens.length} يوم</span></div>}
          <p className="text-xs text-slate-500">الرموز المتاحة: {shifts.map((s) => `${s.code} (${s.name})`).join("، ") || "—"}</p>
        </div>
        {error && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
        <DialogFooter><Button onClick={() => void run()} disabled={saving || !tokens.length || !form.employeeIds.length}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Repeat className="ml-2 h-4 w-4" />}تطبيق النمط</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const emptyShift = { id: 0, code: "", name: "", start_time: "07:00", end_time: "15:00", break_minutes: 30, grace_minutes: 10, is_overnight: false, color: "#0d9488", shift_kind: "day", overtime_after_minutes: 15, is_active: true }
const COLORS = ["#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#16a34a", "#334155", "#0891b2", "#dc2626"]

function ShiftTemplates() {
  const [rows, setRows] = useState<Shift[]>([])
  const [form, setForm] = useState<any>(emptyShift)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => { const r = await fetch("/api/hr/shift-templates", { cache: "no-store" }); setRows(r.ok ? await r.json() : []) }, [])
  useEffect(() => { void load() }, [load])
  const save = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/hr/shift-templates", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ")
      setOpen(false); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر الحفظ") } finally { setSaving(false) }
  }
  const remove = async (row: Shift) => {
    if (!window.confirm(`حذف الوردية ${row.name}؟`)) return
    const response = await fetch(`/api/hr/shift-templates?id=${row.id}`, { method: "DELETE" })
    const data = await response.json()
    if (data.message) window.alert(data.message)
    await load()
  }
  const overnight = form.end_time <= form.start_time
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => { setForm(emptyShift); setError(""); setOpen(true) }}><Plus className="ml-2 h-4 w-4" />وردية جديدة</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const Kind = KINDS[row.shift_kind]?.icon || Sun
          return (
            <div key={row.id} className={`${card} relative overflow-hidden ${row.is_active ? "" : "opacity-60"}`}>
              <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: row.color }} />
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: row.color }}>{row.code}</span>
                  <div><p className="font-bold">{row.name}</p><p className="flex items-center gap-1 text-xs text-slate-500"><Kind className="h-3.5 w-3.5" />{KINDS[row.shift_kind]?.label || row.shift_kind}{!row.is_active && " · موقوفة"}</p></div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setForm({ ...row, start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5) }); setError(""); setOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-rose-600" onClick={() => void remove(row)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">الوقت</p><p className="font-mono font-bold" dir="ltr">{row.start_time.slice(0, 5)}-{row.end_time.slice(0, 5)}{row.is_overnight ? " +1" : ""}</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">الساعات</p><p className="font-mono font-bold">{shiftHours(row).toFixed(1)}</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">سماح</p><p className="font-mono font-bold">{row.grace_minutes}د</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">إضافي بعد</p><p className="font-mono font-bold">{row.overtime_after_minutes}د</p></div>
              </div>
            </div>
          )
        })}
        {!rows.length && <div className={`${card} col-span-full py-12 text-center text-slate-500`}>لا توجد ورديات — أضف ورديات مثل صباحي (M) ومسائي (E) وليلي (N) ومناوبة 24 ساعة (D)</div>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-xl">
          <DialogHeader className="text-right"><DialogTitle>{form.id ? "تعديل وردية" : "وردية جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>الرمز *</Label><Input dir="ltr" maxLength={10} className={`${inputClass} font-mono uppercase`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="M" /></div>
            <div className="sm:col-span-2"><Label>الاسم *</Label><Input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="وردية صباحية" /></div>
            <div><Label>النوع</Label><select className={selectClass} value={form.shift_kind} onChange={(e) => setForm({ ...form, shift_kind: e.target.value })}>{Object.entries(KINDS).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div>
            <div><Label>البداية</Label><Input type="time" dir="ltr" className={inputClass} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><Label>النهاية {overnight && <span className="text-xs text-indigo-600">(اليوم التالي)</span>}</Label><Input type="time" dir="ltr" className={inputClass} value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
            <div><Label>الاستراحة (دقيقة)</Label><Input type="number" min="0" dir="ltr" className={inputClass} value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} /></div>
            <div><Label>فترة السماح للتأخير</Label><Input type="number" min="0" dir="ltr" className={inputClass} value={form.grace_minutes} onChange={(e) => setForm({ ...form, grace_minutes: e.target.value })} /></div>
            <div><Label>يُحتسب إضافي بعد (دقيقة)</Label><Input type="number" min="0" dir="ltr" className={inputClass} value={form.overtime_after_minutes} onChange={(e) => setForm({ ...form, overtime_after_minutes: e.target.value })} /></div>
            <div className="sm:col-span-3"><Label>اللون</Label><div className="mt-1 flex flex-wrap gap-2">{COLORS.map((color) => <button key={color} type="button" onClick={() => setForm({ ...form, color })} className={`h-8 w-8 rounded-full ring-offset-2 ${form.color === color ? "ring-2 ring-slate-900" : ""}`} style={{ background: color }} />)}<Input type="color" className="h-8 w-14 p-0.5" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v === true })} />وردية نشطة</label>
          </div>
          {error && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
          <DialogFooter><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ShiftRosterPage() {
  return (
    <HrPage title="الورديات وجدول المناوبات" subtitle="تخطيط مناوبات الموظفين يوماً بيوم كما في المستشفيات: ورديات صباحية/مسائية/ليلية ومناوبات 24 ساعة، أنماط تدوير، ومتابعة التغطية لكل وردية">
      <Tabs defaultValue="roster" dir="rtl">
        <TabsList>
          <TabsTrigger value="roster"><CalendarRange className="ml-1 h-4 w-4" />جدول المناوبات</TabsTrigger>
          <TabsTrigger value="templates"><Clock className="ml-1 h-4 w-4" />قوالب الورديات</TabsTrigger>
          <TabsTrigger value="weekly"><Repeat className="ml-1 h-4 w-4" />الجداول الأسبوعية</TabsTrigger>
        </TabsList>
        <TabsContent value="roster"><RosterBoard /></TabsContent>
        <TabsContent value="templates"><ShiftTemplates /></TabsContent>
        <TabsContent value="weekly"><ShiftsPage /></TabsContent>
      </Tabs>
    </HrPage>
  )
}
