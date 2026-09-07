"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BarChart3, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Grid, HrPage, inputClass, selectClass, type Column } from "./hr-shared"

type ReportFilters = { from: string; to: string; employee_ids: string[]; department_id: string; branch_id: string }
type LookupData = { employees: any[]; departments: any[]; branches: any[] }

const initialFilters = (): ReportFilters => ({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), employee_ids: [], department_id: "", branch_id: "" })
const minutes = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
const summaryColumns: Column[] = [{ key: "employee_code", label: "رقم الموظف", width: 125 }, { key: "employee_name", label: "اسم الموظف", width: 180 }, { key: "department_name", label: "القسم", width: 150 }, { key: "branch_name", label: "الفرع", width: 150 }, { key: "days", label: "الأيام", width: 80, type: "number" }, { key: "worked_display", label: "إجمالي المدة", width: 110 }, { key: "required_display", label: "إجمالي المطلوب", width: 120 }, { key: "difference_display", label: "إجمالي الفرق", width: 110 }, { key: "late_days", label: "أيام النقص", width: 100, type: "number" }]
const signedMinutes = (value: number) => `${value >= 0 ? "+" : "-"}${minutes(Math.abs(value))}`
const timeOnly = (value?: string | null) => value ? new Date(value).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "-"
const dailyColumns: Column[] = [
  { key: "employee_code", label: "رقم الموظف", width: 115 },
  { key: "full_name", label: "اسم الموظف", width: 155 },
  { key: "department_name", label: "القسم", width: 140 },
  { key: "branch_name", label: "الفرع", width: 140 },
  { key: "work_date", label: "التاريخ", width: 105 },
  { key: "entry_time", label: "وقت الدخول", width: 115 },
  { key: "exit_time", label: "وقت الخروج", width: 115 },
  { key: "worked_display", label: "إجمالي المدة", width: 110 },
  { key: "required_display", label: "إجمالي المطلوب", width: 120 },
  { key: "difference_display", label: "إجمالي الفرق", width: 110 },
]
const detailColumns = (pairCount: number): Column[] => {
  const columns: Column[] = [{ key: "employee_code", label: "رقم الموظف", width: 115 }, { key: "full_name", label: "اسم الموظف", width: 155 }, { key: "work_date", label: "التاريخ", width: 105 }]
  for (let index = 0; index < pairCount; index++) columns.push(
    { key: `session_${index}_entry_type`, label: `دخول ${index + 1} - النوع`, width: 115 }, { key: `session_${index}_entry_time`, label: `دخول ${index + 1} - الوقت`, width: 130 },
    { key: `session_${index}_exit_type`, label: `خروج ${index + 1} - النوع`, width: 115 }, { key: `session_${index}_exit_time`, label: `خروج ${index + 1} - الوقت`, width: 130 },
    { key: `session_${index}_worked_display`, label: `المدة ${index + 1}`, width: 90 }, { key: `session_${index}_difference_display`, label: `الفرق ${index + 1}`, width: 95 }, { key: `session_${index}_required_display`, label: `المطلوب ${index + 1}`, width: 100 },
  )
  return columns.concat([{ key: "total_worked_display", label: "مجموع المدة", width: 110 }, { key: "total_required_display", label: "مجموع المطلوب", width: 120 }, { key: "total_difference_display", label: "مجموع الفرق", width: 110 }])
}

function ReportFiltersBar({ value, lookups, onChange, onLoad }: { value: ReportFilters; lookups: LookupData; onChange: (value: ReportFilters) => void; onLoad: () => void }) {
  return <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
    <div><Label>من تاريخ</Label><Input type="date" className={inputClass} value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} /></div>
    <div><Label>إلى تاريخ</Label><Input type="date" className={inputClass} value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} /></div>
    <div><Label>الموظفون</Label><select multiple className={`${selectClass} h-24`} value={value.employee_ids} onChange={e => onChange({ ...value, employee_ids: Array.from(e.target.selectedOptions, option => option.value) })}>{lookups.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employee_code} - {employee.full_name}</option>)}</select></div>
    <div><Label>القسم</Label><select className={selectClass} value={value.department_id} onChange={e => onChange({ ...value, department_id: e.target.value })}><option value="">كل الأقسام</option>{lookups.departments.map(item => <option key={item.id} value={item.id}>{item.department_name}</option>)}</select></div>
    <div><Label>الفرع</Label><select className={selectClass} value={value.branch_id} onChange={e => onChange({ ...value, branch_id: e.target.value })}><option value="">كل الفروع</option>{lookups.branches.map(item => <option key={item.id} value={item.id}>{item.branch_name}</option>)}</select></div>
    <div className="flex items-end"><Button onClick={onLoad}><RefreshCw className="ml-2 h-4 w-4" />تحديث التقرير</Button></div>
  </div>
}

function useReportData() {
  const [filters, setFilters] = useState(initialFilters)
  const [lookups, setLookups] = useState<LookupData>({ employees: [], departments: [], branches: [] })
  const [data, setData] = useState<{ detail: any[]; summary: any[] }>({ detail: [], summary: [] })
  const [loading, setLoading] = useState(false)
  const loadLookups = useCallback(async () => { const response = await fetch("/api/hr/lookups"); if (response.ok) { const value = await response.json(); setLookups({ employees: value.employees || [], departments: value.departments || [], branches: value.branches || [] }) } }, [])
  const load = useCallback(async () => { setLoading(true); const query = new URLSearchParams({ from: filters.from, to: filters.to, employee_ids: filters.employee_ids.join(","), department_id: filters.department_id, branch_id: filters.branch_id }); const response = await fetch(`/api/hr/attendance-reports?${query}`); setData(response.ok ? await response.json() : { detail: [], summary: [] }); setLoading(false) }, [filters])
  useEffect(() => { void loadLookups(); void load() }, [loadLookups, load])
  return { filters, setFilters, lookups, data, loading, load }
}

export function AttendanceDetailedReportPage() {
  const { filters, setFilters, lookups, data, loading, load } = useReportData()
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null)
  const employees = useMemo(() => data.summary.map(row => ({ ...row, worked_display: minutes(row.worked_minutes), required_display: minutes(row.required_minutes), difference_display: signedMinutes(row.difference_minutes) })), [data.summary])
  const details = useMemo(() => {
    const source = data.detail.filter(row => selectedEmployee == null || Number(row.employee_id) === selectedEmployee)
    const pairCount = Math.max(1, ...source.map(row => row.sessions?.length || 0))
    const sessionTotals = Array.from({ length: pairCount }, () => ({ worked: 0, required: 0, difference: 0 }))
    const rows = source.map(row => {
      const flattened: any = { employee_id: row.employee_id, employee_code: row.employee_code, full_name: row.full_name, work_date: row.work_date, total_worked_display: minutes(0), total_required_display: minutes(0), total_difference_display: signedMinutes(0) }
      let worked = 0; let required = 0; let difference = 0
      for (let index = 0; index < pairCount; index++) { const session = row.sessions?.[index]; const prefix = `session_${index}_`; const sessionWorked = Number(session?.worked_minutes) || 0; const sessionRequired = Number(session?.required_minutes) || 0; const sessionDifference = Number(session?.difference_minutes) || 0; flattened[`${prefix}entry_type`] = session?.entry_type || "-"; flattened[`${prefix}entry_time`] = session?.entry_time ? new Date(session.entry_time).toLocaleString("ar-EG") : "-"; flattened[`${prefix}exit_type`] = session?.exit_type || "-"; flattened[`${prefix}exit_time`] = session?.exit_time ? new Date(session.exit_time).toLocaleString("ar-EG") : "-"; flattened[`${prefix}worked_display`] = session ? minutes(sessionWorked) : "-"; flattened[`${prefix}difference_display`] = session ? signedMinutes(sessionDifference) : "-"; flattened[`${prefix}required_display`] = session ? minutes(sessionRequired) : "-"; sessionTotals[index].worked += sessionWorked; sessionTotals[index].required += sessionRequired; sessionTotals[index].difference += sessionDifference; worked += sessionWorked; required += sessionRequired; difference += sessionDifference }
      flattened.total_worked_display = minutes(worked); flattened.total_required_display = minutes(required); flattened.total_difference_display = signedMinutes(difference); return flattened
    })
    const totals = source.reduce((total, row) => { row.sessions.forEach((session: any) => { total.totalWorked += Number(session.worked_minutes) || 0; total.totalRequired += Number(session.required_minutes) || 0; total.totalDifference += Number(session.difference_minutes) || 0 }); return total }, { totalWorked: 0, totalRequired: 0, totalDifference: 0 })
    const totalRow: any = { employee_code: "", full_name: "الإجمالي", work_date: "", total_worked_display: minutes(totals.totalWorked), total_required_display: minutes(totals.totalRequired), total_difference_display: signedMinutes(totals.totalDifference) }
    sessionTotals.forEach((total, index) => { totalRow[`session_${index}_entry_type`] = ""; totalRow[`session_${index}_entry_time`] = ""; totalRow[`session_${index}_exit_type`] = ""; totalRow[`session_${index}_exit_time`] = ""; totalRow[`session_${index}_worked_display`] = minutes(total.worked); totalRow[`session_${index}_difference_display`] = signedMinutes(total.difference); totalRow[`session_${index}_required_display`] = minutes(total.required) })
    return { rows: [...rows, totalRow], pairCount }
  }, [data.detail, selectedEmployee])
  return <HrPage title="دخول الموظفين تفصيلي" subtitle="تفاصيل جميع أزواج الدخول والخروج والمدة والفرق مقارنة بالساعات المطلوبة"><ReportFiltersBar value={filters} lookups={lookups} onChange={setFilters} onLoad={() => void load()} /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="order-2 xl:order-1"><h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><BarChart3 className="h-5 w-5 text-emerald-600" />تفاصيل الموظف</h2><Grid rows={details.rows} columns={detailColumns(details.pairCount)} height="58vh" /></section><section className="order-1 xl:order-2"><h2 className="mb-2 text-lg font-bold">الموظفون</h2><Grid rows={employees} columns={summaryColumns} height="58vh" onSelect={row => setSelectedEmployee(Number(row.employee_id))} /></section></div>{loading && <p className="text-sm text-slate-500">جاري تحميل التقرير...</p>}</HrPage>
}

export function AttendanceSummaryReportPage() {
  const { filters, setFilters, lookups, data, loading, load } = useReportData()
  const rows = useMemo(() => data.detail.map(row => {
    const sessions = row.sessions || []
    const totals = sessions.reduce((total: { worked: number; required: number; difference: number }, session: any) => ({
      worked: total.worked + (Number(session.worked_minutes) || 0),
      required: total.required + (Number(session.required_minutes) || 0),
      difference: total.difference + (Number(session.difference_minutes) || 0),
    }), { worked: 0, required: 0, difference: 0 })
    return {
      ...row,
      entry_time: timeOnly(sessions[0]?.entry_time),
      exit_time: timeOnly(sessions[sessions.length - 1]?.exit_time),
      worked_display: minutes(totals.worked),
      required_display: minutes(totals.required),
      difference_display: signedMinutes(totals.difference),
    }
  }), [data.detail])
  return <HrPage title="دخول الموظفين إجمالي" subtitle="سجل الحضور اليومي للموظفين"><ReportFiltersBar value={filters} lookups={lookups} onChange={setFilters} onLoad={() => void load()} /><Grid rows={rows} columns={dailyColumns} height="65vh" />{loading && <p className="text-sm text-slate-500">جاري تحميل التقرير...</p>}</HrPage>
}
