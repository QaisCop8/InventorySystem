"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Activity, Cable, CheckCircle2, Clock3, Download, Pencil, Plus, RefreshCw, Save, Trash2, Wifi } from "lucide-react"
import { FilterBar, Grid, HrPage, ListActions, inputClass, selectClass, type Column } from "./hr-shared"

type Device = { id?: number; name: string; code: string; device_type: string; ip_address: string; port: number; branch_id: number | null; branch_name?: string; is_active: boolean; last_sync_at?: string | null }
type AttendanceLog = { id?: number; device_id: number | null; device_name?: string; employee_id: number | null; employee_code: string; employee_name?: string; device_user_id: string; punch_time: string; punch_type: string; verification_type: string; sync_status: string; notes?: string }

const emptyDevice: Device = { name: "", code: "", device_type: "zkteco", ip_address: "", port: 4370, branch_id: null, is_active: true }
const emptyLog: AttendanceLog = { device_id: null, employee_id: null, employee_code: "", device_user_id: "", punch_time: new Date().toISOString().slice(0, 16), punch_type: "in", verification_type: "fingerprint", sync_status: "manual", notes: "" }

const deviceColumns: Column[] = [
  { key: "code", label: "الرمز", width: 120 },
  { key: "name", label: "اسم الجهاز" },
  { key: "device_type", label: "النوع", width: 120 },
  { key: "ip_address", label: "العنوان", width: 150 },
  { key: "port", label: "المنفذ", width: 90, type: "number" },
  { key: "branch_name", label: "الفرع", width: 150 },
  { key: "is_active", label: "فعال", width: 80, type: "boolean" },
  { key: "last_sync_at", label: "آخر قراءة", width: 170 },
]

const logColumns: Column[] = [
  { key: "punch_time", label: "وقت الحركة", width: 170 },
  { key: "employee_code", label: "رقم الموظف", width: 120 },
  { key: "employee_name", label: "الموظف" },
  { key: "device_name", label: "الجهاز", width: 150 },
  { key: "punch_type", label: "الحركة", width: 100 },
  { key: "verification_type", label: "طريقة التحقق", width: 120 },
  { key: "sync_status", label: "المصدر", width: 100 },
]

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString("ar-EG") : "-"

export function AttendanceDevicesPage() {
  const [rows, setRows] = useState<Device[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [form, setForm] = useState<Device>(emptyDevice)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const [devicesResponse, lookupsResponse] = await Promise.all([fetch("/api/hr/attendance-devices"), fetch("/api/hr/lookups")])
    setRows(devicesResponse.ok ? await devicesResponse.json() : [])
    if (lookupsResponse.ok) setBranches((await lookupsResponse.json()).branches || [])
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.ip_address.trim()) return setMessage("اسم الجهاز والرمز والعنوان مطلوبون")
    setSaving(true); setMessage("")
    const response = await fetch("/api/hr/attendance-devices", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (response.ok) { await load(); setOpen(false); setForm(emptyDevice) } else setMessage((await response.json()).error || "تعذر حفظ الجهاز")
    setSaving(false)
  }
  const remove = async () => {
    if (!form.id || !window.confirm("هل تريد حذف الجهاز؟")) return
    const response = await fetch(`/api/hr/attendance-devices?id=${form.id}`, { method: "DELETE" })
    if (response.ok) { await load(); setOpen(false); setForm(emptyDevice) } else setMessage((await response.json()).error || "تعذر حذف الجهاز")
  }

  return <HrPage title="إعداد أجهزة الحضور" subtitle="تعريف أجهزة البصمة وربطها بالفروع">
    <ListActions onNew={() => { setForm(emptyDevice); setMessage(""); setOpen(true) }} onRefresh={() => void load()} />
    <Grid rows={rows.map(row => ({ ...row, last_sync_at: formatDate(row.last_sync_at) }))} columns={deviceColumns} onDoubleClick={row => { setForm(row); setOpen(true) }} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-2xl"><DialogHeader><DialogTitle>{form.id ? "تعديل جهاز" : "إضافة جهاز حضور"}</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>اسم الجهاز *</Label><Input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>الرمز *</Label><Input className={inputClass} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div><Label>نوع الجهاز</Label><select className={selectClass} value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}><option value="zkteco">ZKTeco / ZK</option><option value="generic_tcp">TCP عام</option><option value="generic_http">HTTP API</option></select></div>
        <div><Label>الفرع</Label><select className={selectClass} value={form.branch_id ?? ""} onChange={e => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : null })}><option value="">كل الفروع</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div>
        <div><Label>عنوان IP / المضيف *</Label><Input dir="ltr" className={inputClass} value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} /></div>
        <div><Label>المنفذ</Label><Input dir="ltr" type="number" className={inputClass} value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) || 0 })} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> جهاز فعال</label>
      </div>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <div className="flex justify-between gap-2"><Button variant="destructive" disabled={!form.id} onClick={() => void remove()}><Trash2 className="ml-2 h-4 w-4" />حذف</Button><Button disabled={saving} onClick={() => void save()}><Save className="ml-2 h-4 w-4" />حفظ</Button></div>
    </DialogContent></Dialog>
  </HrPage>
}

export function AttendanceRecordsPage() {
  const [rows, setRows] = useState<AttendanceLog[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [filters, setFilters] = useState({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), device_id: "", search: "" })
  const [form, setForm] = useState<AttendanceLog>(emptyLog)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [reading, setReading] = useState(false)

  const load = useCallback(async () => {
    const query = new URLSearchParams({ from: filters.from, to: filters.to })
    if (filters.device_id) query.set("device_id", filters.device_id)
    const [logsResponse, devicesResponse, employeesResponse] = await Promise.all([fetch(`/api/hr/attendance-records?${query}`), fetch("/api/hr/attendance-devices"), fetch("/api/hr/employees")])
    setRows(logsResponse.ok ? await logsResponse.json() : [])
    setDevices(devicesResponse.ok ? await devicesResponse.json() : [])
    setEmployees(employeesResponse.ok ? await employeesResponse.json() : [])
  }, [filters.from, filters.to, filters.device_id])
  useEffect(() => { void load() }, [load])

  const filteredRows = useMemo(() => rows.filter(row => !filters.search || `${row.employee_code} ${row.employee_name || ""} ${row.device_name || ""}`.toLowerCase().includes(filters.search.toLowerCase())), [rows, filters.search])
  const save = async () => {
    if (!form.employee_code.trim() || !form.punch_time) return setMessage("رقم الموظف ووقت الحركة مطلوبان")
    const response = await fetch("/api/hr/attendance-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (response.ok) { await load(); setOpen(false); setForm({ ...emptyLog, punch_time: new Date().toISOString().slice(0, 16) }) } else setMessage((await response.json()).error || "تعذر حفظ سجل الحضور")
  }
  const readFromMachine = async () => {
    if (!filters.device_id) return setMessage("اختر الجهاز أولاً")
    setReading(true); setMessage("")
    const response = await fetch("/api/hr/attendance-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", device_id: Number(filters.device_id), from: filters.from, to: filters.to }) })
    const data = await response.json()
    if (response.ok) { await load(); setMessage(`تمت قراءة ${data.count || 0} حركة`) } else setMessage(data.error || "تعذر قراءة الجهاز")
    setReading(false)
  }

  return <HrPage title="الحضور والدوام" subtitle="قراءة وحفظ حركات الحضور والانصراف ومراجعتها قبل اعتمادها">
    <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-emerald-600" />قراءة الحركات</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label>من تاريخ</Label><Input type="date" className={inputClass} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></div><div><Label>إلى تاريخ</Label><Input type="date" className={inputClass} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div><div><Label>الجهاز</Label><select className={selectClass} value={filters.device_id} onChange={e => setFilters({ ...filters, device_id: e.target.value })}><option value="">كل الأجهزة</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div><div className="lg:col-span-2 flex items-end gap-2"><Button onClick={() => void readFromMachine()} disabled={reading}><Wifi className="ml-2 h-4 w-4" />{reading ? "جاري القراءة..." : "قراءة من الجهاز"}</Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button></div>
    </CardContent></Card>
    <ListActions onNew={() => { setForm({ ...emptyLog, device_id: filters.device_id ? Number(filters.device_id) : null }); setMessage(""); setOpen(true) }} />
    <FilterBar search={filters.search} onSearch={search => setFilters({ ...filters, search })} count={filteredRows.length} />
    <Grid rows={filteredRows.map(row => ({ ...row, punch_time: formatDate(row.punch_time), punch_type: row.punch_type === "in" ? "دخول" : row.punch_type === "out" ? "خروج" : row.punch_type }))} columns={logColumns} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl" className="max-w-xl"><DialogHeader><DialogTitle>حفظ سجل حضور</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>الجهاز</Label><select className={selectClass} value={form.device_id ?? ""} onChange={e => setForm({ ...form, device_id: e.target.value ? Number(e.target.value) : null })}><option value="">غير محدد</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div><div><Label>الموظف</Label><select className={selectClass} value={form.employee_id ?? ""} onChange={e => { const employee = employees.find(item => Number(item.id) === Number(e.target.value)); setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : null, employee_code: employee?.employee_code || form.employee_code }) }}><option value="">اختر الموظف</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>)}</select></div><div><Label>رقم الموظف في الجهاز *</Label><Input className={inputClass} value={form.device_user_id || form.employee_code} onChange={e => setForm({ ...form, device_user_id: e.target.value, employee_code: e.target.value })} /></div><div><Label>وقت الحركة *</Label><Input type="datetime-local" className={inputClass} value={form.punch_time} onChange={e => setForm({ ...form, punch_time: e.target.value })} /></div><div><Label>نوع الحركة</Label><select className={selectClass} value={form.punch_type} onChange={e => setForm({ ...form, punch_type: e.target.value })}><option value="in">دخول</option><option value="out">خروج</option><option value="break">استراحة</option><option value="unknown">غير محدد</option></select></div><div><Label>طريقة التحقق</Label><select className={selectClass} value={form.verification_type} onChange={e => setForm({ ...form, verification_type: e.target.value })}><option value="fingerprint">بصمة</option><option value="face">وجه</option><option value="card">بطاقة</option><option value="manual">يدوي</option></select></div></div>{message && <p className="text-sm text-red-600">{message}</p>}<div className="flex justify-end"><Button onClick={() => void save()}><Save className="ml-2 h-4 w-4" />حفظ السجل</Button></div></DialogContent></Dialog>
  </HrPage>
}
