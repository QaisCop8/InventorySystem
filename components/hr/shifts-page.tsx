"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Clock3, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react"
import { Grid, HrPage, ListActions, inputClass, selectClass, type Column } from "./hr-shared"

type Shift = { id?: number; code: string; name: string; start_time: string; end_time: string; break_minutes: number; grace_minutes: number; is_overnight: boolean; is_active: boolean }
type Schedule = { id?: number; employee_id?: number | null; department_id?: number | null; employee_code?: string; employee_name?: string; department_name?: string; date_from: string; date_to: string; work_date?: string; weekday: number; weekday_name?: string; shift_id: number | null; shift_name?: string; start_time?: string; end_time?: string; is_day_off: boolean; apply_weekday?: boolean; apply_employees?: boolean }

const weekdays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const emptyShift: Shift = { code: "", name: "", start_time: "08:00", end_time: "17:00", break_minutes: 60, grace_minutes: 15, is_overnight: false, is_active: true }
const emptySchedule: Schedule = { employee_id: null, department_id: null, date_from: new Date().toISOString().slice(0, 10), date_to: new Date().toISOString().slice(0, 10), weekday: 0, shift_id: null, is_day_off: false }
const shiftColumns: Column[] = [{ key: "code", label: "الرمز", width: 110 }, { key: "name", label: "اسم الوردية" }, { key: "start_time", label: "من", width: 90 }, { key: "end_time", label: "إلى", width: 90 }, { key: "break_minutes", label: "الاستراحة بالدقائق", width: 140, type: "number" }, { key: "grace_minutes", label: "السماح بالدقائق", width: 130, type: "number" }]
const scheduleColumns: Column[] = [{ key: "employee_code", label: "رقم الموظف", width: 120 }, { key: "employee_name", label: "اسم الموظف" }, { key: "weekday_name", label: "اليوم", width: 100, format: (_: any, row: Schedule) => row.weekday_name || weekdays[row.weekday] }, { key: "work_date", label: "التاريخ", width: 115 }, { key: "start_time", label: "من", width: 90 }, { key: "end_time", label: "إلى", width: 90 }, { key: "shift_name", label: "فترة الدوام", width: 150 }, { key: "is_day_off", label: "عطلة", width: 75, type: "boolean" }]

export function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [shiftForm, setShiftForm] = useState<Shift>(emptyShift)
  const [scheduleForm, setScheduleForm] = useState<Schedule>(emptySchedule)
  const [employeeFilter, setEmployeeFilter] = useState("")
  const [shiftOpen, setShiftOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const [shiftsResponse, employeesResponse, departmentsResponse, schedulesResponse] = await Promise.all([fetch("/api/hr/shifts"), fetch("/api/hr/employees"), fetch("/api/departments"), fetch("/api/hr/shift-schedules")])
    setShifts(shiftsResponse.ok ? await shiftsResponse.json() : [])
    setEmployees(employeesResponse.ok ? await employeesResponse.json() : [])
    setDepartments(departmentsResponse.ok ? await departmentsResponse.json() : [])
    setSchedules(schedulesResponse.ok ? await schedulesResponse.json() : [])
  }, [])
  useEffect(() => { void load() }, [load])

  const saveShift = async () => {
    if (!shiftForm.code.trim() || !shiftForm.name.trim()) return setMessage("رمز الوردية واسمها مطلوبان")
    const response = await fetch("/api/hr/shifts", { method: shiftForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(shiftForm) })
    if (response.ok) { await load(); setShiftOpen(false); setShiftForm(emptyShift) } else setMessage((await response.json()).error || "تعذر حفظ الوردية")
  }
  const deleteShift = async () => {
    if (!shiftForm.id || !window.confirm("هل تريد حذف الوردية؟")) return
    const response = await fetch(`/api/hr/shifts?id=${shiftForm.id}`, { method: "DELETE" })
    if (response.ok) { await load(); setShiftOpen(false); setShiftForm(emptyShift) } else setMessage((await response.json()).error || "تعذر حذف الوردية")
  }
  const saveSchedule = async () => {
    if ((!scheduleForm.employee_id && !scheduleForm.department_id) || !scheduleForm.date_from || !scheduleForm.date_to) return setMessage("اختر موظفاً أو قسماً وحدد الفترة")
    if (!scheduleForm.is_day_off && !scheduleForm.shift_id) return setMessage("اختر الوردية أو حدد اليوم عطلة")
    const response = await fetch("/api/hr/shift-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scheduleForm) })
    if (response.ok) { await load(); setScheduleOpen(false); setScheduleForm(emptySchedule) } else setMessage((await response.json()).error || "تعذر حفظ جدول الدوام")
  }
  const openNewSchedule = () => { setScheduleForm({ ...emptySchedule, shift_id: shifts[0]?.id || null }); setMessage(""); setScheduleOpen(true) }
  const openScheduleEdit = (row: Schedule) => { setScheduleForm({ ...row, date_from: row.work_date || row.date_from, date_to: row.work_date || row.date_to, apply_weekday: false, apply_employees: false }); setMessage(""); setScheduleOpen(true) }
  const saveScheduleEdit = async () => {
    if (!scheduleForm.id || (!scheduleForm.is_day_off && !scheduleForm.shift_id)) return setMessage("اختر الوردية أو حدد اليوم عطلة")
    const response = await fetch("/api/hr/shift-schedules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scheduleForm) })
    if (response.ok) { await load(); setScheduleOpen(false); setScheduleForm(emptySchedule) } else setMessage((await response.json()).error || "تعذر تعديل جدول الدوام")
  }
  const filteredSchedules = employeeFilter ? schedules.filter(row => String(row.employee_id || "") === employeeFilter) : schedules

  return <HrPage title="الورديات والجداول الأسبوعية" subtitle="تعريف أوقات الدوام وربط كل موظف بوردية لكل يوم من أيام الأسبوع">
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="order-1 space-y-3 xl:order-1"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><Clock3 className="h-5 w-5 text-emerald-600" />تعريف الورديات</h2><Button onClick={() => { setShiftForm(emptyShift); setMessage(""); setShiftOpen(true) }}><Plus className="ml-2 h-4 w-4" />وردية جديدة</Button></div><Grid rows={shifts} columns={shiftColumns} height="58vh" onDoubleClick={row => { setShiftForm(row); setMessage(""); setShiftOpen(true) }} /></section>
      <section className="order-2 space-y-3 xl:order-2"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">جدول الدوام اليومي</h2><div className="flex items-end gap-2" dir="ltr"><div dir="rtl"><Label className="mb-1 block text-right">الموظف</Label><select className={selectClass} value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}><option value="">كل الموظفين</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>)}</select></div><Button variant="outline" onClick={() => void load()} dir="rtl"><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button><Button onClick={openNewSchedule} dir="rtl"><Plus className="ml-2 h-4 w-4" />جدول فترة جديد</Button></div></div><Grid rows={filteredSchedules} columns={scheduleColumns} height="58vh" onDoubleClick={openScheduleEdit} /></section>
    </div>
    <Card className="border-emerald-200 bg-emerald-50/50"><CardHeader><CardTitle className="text-base">فكرة التشغيل</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">يتم استخدام جدول الموظف الأسبوعي لاحقاً لمقارنة حركات الجهاز مع وقت الوردية وحساب التأخير والانصراف المبكر والساعات الإضافية.</CardContent></Card>
    <Dialog open={shiftOpen} onOpenChange={setShiftOpen}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>{shiftForm.id ? "تعديل وردية" : "تعريف وردية"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>الرمز *</Label><Input className={inputClass} value={shiftForm.code} onChange={e => setShiftForm({ ...shiftForm, code: e.target.value.toUpperCase() })} /></div><div><Label>اسم الوردية *</Label><Input className={inputClass} value={shiftForm.name} onChange={e => setShiftForm({ ...shiftForm, name: e.target.value })} /></div><div><Label>وقت البداية</Label><Input type="time" className={inputClass} value={shiftForm.start_time} onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></div><div><Label>وقت النهاية</Label><Input type="time" className={inputClass} value={shiftForm.end_time} onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></div><div><Label>دقائق الاستراحة</Label><Input type="number" className={inputClass} value={shiftForm.break_minutes} onChange={e => setShiftForm({ ...shiftForm, break_minutes: Number(e.target.value) || 0 })} /></div><div><Label>دقائق السماح</Label><Input type="number" className={inputClass} value={shiftForm.grace_minutes} onChange={e => setShiftForm({ ...shiftForm, grace_minutes: Number(e.target.value) || 0 })} /></div><label className="flex items-center gap-2"><input type="checkbox" checked={shiftForm.is_overnight} onChange={e => setShiftForm({ ...shiftForm, is_overnight: e.target.checked })} /> تمتد لليوم التالي</label><label className="flex items-center gap-2"><input type="checkbox" checked={shiftForm.is_active} onChange={e => setShiftForm({ ...shiftForm, is_active: e.target.checked })} /> فعالة</label></div>{message && <p className="text-sm text-red-600">{message}</p>}<div className="flex justify-between"><Button variant="destructive" disabled={!shiftForm.id} onClick={() => void deleteShift()}><Trash2 className="ml-2 h-4 w-4" />حذف</Button><Button onClick={() => void saveShift()}><Save className="ml-2 h-4 w-4" />حفظ</Button></div></DialogContent></Dialog>
    <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>{scheduleForm.id ? "تعديل جدول الدوام" : "إعداد دوام من تاريخ إلى تاريخ"}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>تطبيق على</Label><select disabled={!!scheduleForm.id} className={selectClass} value={scheduleForm.department_id ? `department:${scheduleForm.department_id}` : scheduleForm.employee_id ? `employee:${scheduleForm.employee_id}` : ""} onChange={e => { const [kind, value] = e.target.value.split(":"); setScheduleForm({ ...scheduleForm, employee_id: kind === "employee" ? Number(value) : null, department_id: kind === "department" ? Number(value) : null }) }}><option value="">اختر الموظف أو القسم</option><optgroup label="الأقسام">{departments.map(department => <option key={`d-${department.id}`} value={`department:${department.id}`}>{department.department_name}</option>)}</optgroup><optgroup label="الموظفون">{employees.map(employee => <option key={`e-${employee.id}`} value={`employee:${employee.id}`}>{employee.employee_code} - {employee.full_name}</option>)}</optgroup></select></div><div><Label>اليوم</Label><select disabled={!!scheduleForm.id} className={selectClass} value={scheduleForm.weekday} onChange={e => setScheduleForm({ ...scheduleForm, weekday: Number(e.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div><div><Label>من تاريخ</Label><Input disabled={!!scheduleForm.id} type="date" className={inputClass} value={scheduleForm.date_from} onChange={e => setScheduleForm({ ...scheduleForm, date_from: e.target.value })} /></div><div><Label>إلى تاريخ</Label><Input disabled={!!scheduleForm.id} type="date" className={inputClass} value={scheduleForm.date_to} onChange={e => setScheduleForm({ ...scheduleForm, date_to: e.target.value })} /></div><div><Label>الوردية</Label><select className={selectClass} disabled={scheduleForm.is_day_off} value={scheduleForm.shift_id || ""} onChange={e => setScheduleForm({ ...scheduleForm, shift_id: Number(e.target.value) || null })}><option value="">اختر الوردية</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></div><label className="flex items-center gap-2 self-end"><input type="checkbox" checked={scheduleForm.is_day_off} onChange={e => setScheduleForm({ ...scheduleForm, is_day_off: e.target.checked, shift_id: e.target.checked ? null : scheduleForm.shift_id })} /> عطلة في هذا اليوم</label>{scheduleForm.id && <div className="sm:col-span-2 space-y-2"><Label>نطاق التطبيق</Label><label className="flex items-center gap-2"><input type="checkbox" checked={!!scheduleForm.apply_weekday} onChange={e => setScheduleForm({ ...scheduleForm, apply_weekday: e.target.checked })} /> تطبيق على كل الأيام المشابهة</label><label className="flex items-center gap-2"><input type="checkbox" checked={!!scheduleForm.apply_employees} onChange={e => setScheduleForm({ ...scheduleForm, apply_employees: e.target.checked })} /> تطبيق على كل الموظفين</label></div>}</div>{message && <p className="text-sm text-red-600">{message}</p>}<div className="flex justify-end"><Button onClick={() => void (scheduleForm.id ? saveScheduleEdit() : saveSchedule())}><Save className="ml-2 h-4 w-4" />حفظ</Button></div></DialogContent></Dialog>
  </HrPage>
}
