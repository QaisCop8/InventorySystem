"use client"

import { tr, appDir } from "@/lib/i18n"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Activity, Cable, CheckCircle2, Clock3, Download, Pencil, Plus, RefreshCw, Save, Trash2, Wifi } from "lucide-react"
import { FilterBar, Grid, HrPage, ListActions, inputClass, selectClass, type Column } from "./hr-shared"

type DeviceSymbol = { symbol_key: "entry" | "exit" | "overtime_entry" | "overtime_exit"; symbol_value: string; label: string }
type Device = { id?: number; name: string; code: string; device_type: string; ip_address: string; port: number; serial_number: string; branch_id: number | null; branch_name?: string; is_active: boolean; last_sync_at?: string | null; adms_status?: string; adms_registry_error?: string; symbols: DeviceSymbol[] }
type AttendanceLog = { id?: number; device_id: number | null; device_name?: string; employee_id: number | null; employee_code: string; employee_name?: string; device_user_id: string; punch_time: string; punch_type: string; verification_type: string; sync_status: string; notes?: string }

const defaultSymbols: DeviceSymbol[] = [{ symbol_key: "entry", symbol_value: "I", label: tr("دخول") }, { symbol_key: "exit", symbol_value: "O", label: tr("خروج") }, { symbol_key: "overtime_entry", symbol_value: "OI", label: tr("دخول وقت إضافي") }, { symbol_key: "overtime_exit", symbol_value: "OO", label: tr("خروج وقت إضافي") }]
const emptyDevice: Device = { name: "", code: "", device_type: "zkteco", ip_address: "", port: 4370, serial_number: "", branch_id: null, is_active: true, symbols: defaultSymbols.map(symbol => ({ ...symbol })) }
const emptyLog: AttendanceLog = { device_id: null, employee_id: null, employee_code: "", device_user_id: "", punch_time: new Date().toISOString().slice(0, 16), punch_type: "in", verification_type: "fingerprint", sync_status: "manual", notes: "" }

const deviceColumns: Column[] = [
  { key: "code", label: tr("الرمز"), width: 120 },
  { key: "name", label: tr("اسم الجهاز") },
  { key: "device_type", label: tr("النوع"), width: 120 },
  { key: "serial_number", label: tr("الرقم التسلسلي"), width: 150 },
  { key: "ip_address", label: tr("العنوان"), width: 150 },
  { key: "port", label: tr("المنفذ"), width: 90, type: "number" },
  { key: "branch_name", label: tr("الفرع"), width: 150 },
  { key: "is_active", label: tr("فعال"), width: 80, type: "boolean" },
  { key: "adms_status", label: tr("ربط ADMS"), width: 140 },
  { key: "last_sync_at", label: tr("آخر قراءة"), width: 170 },
]

const logColumns: Column[] = [
  { key: "punch_time", label: tr("وقت الحركة"), width: 170 },
  { key: "employee_code", label: tr("رقم الموظف"), width: 120 },
  { key: "employee_name", label: tr("الموظف") },
  { key: "device_name", label: tr("الجهاز"), width: 150 },
  { key: "punch_type", label: tr("الحركة"), width: 100 },
  { key: "verification_type", label: tr("طريقة التحقق"), width: 120 },
  { key: "sync_status", label: tr("المصدر"), width: 100 },
]

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString("en-GB") : "-"

export function AttendanceDevicesPage() {
  const [rows, setRows] = useState<Device[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [form, setForm] = useState<Device>(emptyDevice)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    const [devicesResponse, lookupsResponse] = await Promise.all([fetch("/api/hr/attendance-devices"), fetch("/api/hr/lookups")])
    setRows(devicesResponse.ok ? (await devicesResponse.json()).map((row: Device) => ({ ...row, symbols: defaultSymbols.map(defaultSymbol => row.symbols?.find(symbol => symbol.symbol_key === defaultSymbol.symbol_key) || { ...defaultSymbol }) })) : [])
    if (lookupsResponse.ok) setBranches((await lookupsResponse.json()).branches || [])
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!form.name.trim() || !form.code.trim() || !form.serial_number.trim()) return setMessage(tr("اسم الجهاز والرمز والرقم التسلسلي مطلوبون"))
    setSaving(true); setMessage("")
    const response = await fetch("/api/hr/attendance-devices", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (response.ok) { await load(); setOpen(false); setForm(emptyDevice) } else setMessage((await response.json()).error || tr("تعذر حفظ الجهاز"))
    setSaving(false)
  }
  const remove = async () => {
    if (!form.id || !(await confirmYesNo(tr("هل تريد حذف الجهاز؟")))) return
    const response = await fetch(`/api/hr/attendance-devices?id=${form.id}`, { method: "DELETE" })
    if (response.ok) { await load(); setOpen(false); setForm(emptyDevice) } else setMessage((await response.json()).error || tr("تعذر حذف الجهاز"))
  }

  return <HrPage title={tr("إعداد أجهزة الحضور")} subtitle={tr("تعريف أجهزة البصمة وربطها بالفروع")}>
    <ListActions onNew={() => { setForm(emptyDevice); setMessage(""); setOpen(true) }} onRefresh={() => void load()} />
    <Grid rows={rows.map(row => ({ ...row, last_sync_at: formatDate(row.last_sync_at) }))} columns={deviceColumns} onDoubleClick={row => { setForm(row); setMessage(row.adms_registry_error || ""); setOpen(true) }} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir={appDir()} className="max-w-2xl"><DialogHeader><DialogTitle>{form.id ? tr("تعديل جهاز") : tr("إضافة جهاز حضور")}</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>{tr("اسم الجهاز *")}</Label><Input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>{tr("الرمز *")}</Label><Input className={inputClass} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div><Label>{tr("نوع الجهاز")}</Label><select className={selectClass} value={form.device_type} onChange={e => setForm({ ...form, device_type: e.target.value })}><option value="zkteco">ZKTeco / ZK</option><option value="generic_tcp">{tr("TCP عام")}</option><option value="generic_http">HTTP API</option></select></div>
        <div><Label>{tr("الرقم التسلسلي ADMS *")}</Label><Input dir="ltr" className={inputClass} value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value.trim().toUpperCase() })} placeholder={tr("SN من إعدادات الجهاز")} /></div>
        <div><Label>{tr("الفرع")}</Label><select className={selectClass} value={form.branch_id ?? ""} onChange={e => setForm({ ...form, branch_id: e.target.value ? Number(e.target.value) : null })}><option value="">{tr("كل الفروع")}</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div>
        <div><Label>{tr("عنوان IP / المضيف")}</Label><Input dir="ltr" className={inputClass} value={form.ip_address || ""} onChange={e => setForm({ ...form, ip_address: e.target.value })} /></div>
        <div><Label>{tr("المنفذ")}</Label><Input dir="ltr" type="number" className={inputClass} value={form.port} onChange={e => setForm({ ...form, port: Number(e.target.value) || 0 })} /></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />{tr(" جهاز فعال")}</label>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">{tr("رموز حركات الجهاز")}</div><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="p-2">{tr("الحركة")}</th><th className="p-2">{tr("الرمز في الجهاز")}</th><th className="p-2">{tr("الافتراضي")}</th></tr></thead><tbody>{form.symbols.map((symbol, index) => <tr key={symbol.symbol_key} className="border-b last:border-0"><td className="p-2">{symbol.label}</td><td className="p-2"><Input dir="ltr" className="h-8" value={symbol.symbol_value} onChange={e => setForm({ ...form, symbols: form.symbols.map((item, itemIndex) => itemIndex === index ? { ...item, symbol_value: e.target.value } : item) })} /></td><td className="p-2 text-slate-500" dir="ltr">{defaultSymbols.find(item => item.symbol_key === symbol.symbol_key)?.symbol_value}</td></tr>)}</tbody></table></div>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <div className="flex justify-between gap-2"><Button variant="destructive" disabled={!form.id} onClick={() => void remove()}><Trash2 className="me-2 h-4 w-4" />{tr("حذف")}</Button><Button disabled={saving} onClick={() => void save()}><Save className="me-2 h-4 w-4" />{tr("حفظ")}</Button></div>
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
    if (!form.employee_code.trim() || !form.punch_time) return setMessage(tr("رقم الموظف ووقت الحركة مطلوبان"))
    const response = await fetch("/api/hr/attendance-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
    if (response.ok) { await load(); setOpen(false); setForm({ ...emptyLog, punch_time: new Date().toISOString().slice(0, 16) }) } else setMessage((await response.json()).error || tr("تعذر حفظ سجل الحضور"))
  }
  const readFromMachine = async () => {
    if (!filters.device_id) return setMessage(tr("اختر الجهاز أولاً"))
    setReading(true); setMessage("")
    const response = await fetch("/api/hr/attendance-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", device_id: Number(filters.device_id), from: filters.from, to: filters.to }) })
    const data = await response.json()
    if (response.ok) { await load(); setMessage(tr("تمت قراءة {0} حركة", data.count || 0)) } else setMessage(data.error || tr("تعذر قراءة الجهاز"))
    setReading(false)
  }

  return <HrPage title={tr("الحضور والدوام")} subtitle={tr("قراءة وحفظ حركات الحضور والانصراف ومراجعتها قبل اعتمادها")}>
    <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-emerald-600" />{tr("قراءة الحركات")}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label>{tr("من تاريخ")}</Label><Input type="date" className={inputClass} value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></div><div><Label>{tr("إلى تاريخ")}</Label><Input type="date" className={inputClass} value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div><div><Label>{tr("الجهاز")}</Label><select className={selectClass} value={filters.device_id} onChange={e => setFilters({ ...filters, device_id: e.target.value })}><option value="">{tr("كل الأجهزة")}</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div><div className="lg:col-span-2 flex items-end gap-2"><Button onClick={() => void readFromMachine()} disabled={reading}><Wifi className="me-2 h-4 w-4" />{reading ? tr("جاري القراءة...") : tr("قراءة من الجهاز")}</Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="me-2 h-4 w-4" />{tr("تحديث")}</Button></div>
    </CardContent></Card>
    <ListActions onNew={() => { setForm({ ...emptyLog, device_id: filters.device_id ? Number(filters.device_id) : null }); setMessage(""); setOpen(true) }} />
    <FilterBar search={filters.search} onSearch={search => setFilters({ ...filters, search })} count={filteredRows.length} />
    <Grid rows={filteredRows.map(row => ({ ...row, punch_time: formatDate(row.punch_time), punch_type: row.punch_type === "in" ? "دخول" : row.punch_type === "out" ? "خروج" : row.punch_type }))} columns={logColumns} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir={appDir()} className="max-w-xl"><DialogHeader><DialogTitle>{tr("حفظ سجل حضور")}</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>{tr("الجهاز")}</Label><select className={selectClass} value={form.device_id ?? ""} onChange={e => setForm({ ...form, device_id: e.target.value ? Number(e.target.value) : null })}><option value="">{tr("غير محدد")}</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div><div><Label>{tr("الموظف")}</Label><select className={selectClass} value={form.employee_id ?? ""} onChange={e => { const employee = employees.find(item => Number(item.id) === Number(e.target.value)); setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : null, employee_code: employee?.employee_code || form.employee_code }) }}><option value="">{tr("اختر الموظف")}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>)}</select></div><div><Label>{tr("رقم الموظف في الجهاز *")}</Label><Input className={inputClass} value={form.device_user_id || form.employee_code} onChange={e => setForm({ ...form, device_user_id: e.target.value, employee_code: e.target.value })} /></div><div><Label>{tr("وقت الحركة *")}</Label><Input type="datetime-local" className={inputClass} value={form.punch_time} onChange={e => setForm({ ...form, punch_time: e.target.value })} /></div><div><Label>{tr("نوع الحركة")}</Label><select className={selectClass} value={form.punch_type} onChange={e => setForm({ ...form, punch_type: e.target.value })}><option value="in">{tr("دخول")}</option><option value="out">{tr("خروج")}</option><option value="break">{tr("استراحة")}</option><option value="unknown">{tr("غير محدد")}</option></select></div><div><Label>{tr("طريقة التحقق")}</Label><select className={selectClass} value={form.verification_type} onChange={e => setForm({ ...form, verification_type: e.target.value })}><option value="fingerprint">{tr("بصمة")}</option><option value="face">{tr("وجه")}</option><option value="card">{tr("بطاقة")}</option><option value="manual">{tr("يدوي")}</option></select></div></div>{message && <p className="text-sm text-red-600">{message}</p>}<div className="flex justify-end"><Button onClick={() => void save()}><Save className="me-2 h-4 w-4" />{tr("حفظ السجل")}</Button></div></DialogContent></Dialog>
  </HrPage>
}
