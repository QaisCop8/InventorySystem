"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eraser, RefreshCw, Save, Search } from "lucide-react"
import Messages from "@/components/common/Messages"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Grid, HrPage, inputClass, selectClass, type Column } from "./hr-shared"

const monthNames = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"]
type Filters = { currency: string; salaryType: string; employee: string; department: string; job: string; contractType: string }
const emptyFilters: Filters = { currency: "", salaryType: "all", employee: "", department: "", job: "", contractType: "all" }
const englishMoney = (value: any) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SalaryPeriodsPage() {
  const today = new Date()
  const messagesRef = useRef<any>(null)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [rows, setRows] = useState<any[]>([])
  const [lookups, setLookups] = useState<any>({ currencies: [], departments: [], jobs: [] })
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [search, setSearch] = useState("")
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const message = (severity: "success" | "error" | "info", detail: string) => { messagesRef.current?.clear?.(); messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000 }]) }
  const loadLookups = useCallback(async () => { const response = await fetch("/api/hr/lookups"); if (!response.ok) return; const data = await response.json(); setLookups(data); setFilters(current => ({ ...current, currency: current.currency || String(data.currencies?.[0]?.id || "") })) }, [])
  const load = useCallback(async () => { setLoading(true); const response = await fetch(`/api/hr/salary-opening?year=${year}&month=${month}`); if (response.ok) setRows((await response.json()).map((row: any) => ({ ...row, selected: true }))); else message("error", (await response.json()).error || "تعذر تحميل الموظفين"); setLoading(false) }, [year, month])
  useEffect(() => { void loadLookups() }, [loadLookups])
  useEffect(() => { void load() }, [load])

  const setAll = (mode: "all" | "none" | "reverse") => setRows(current => current.map(row => ({ ...row, selected: mode === "all" ? true : mode === "none" ? false : !row.selected })))
  const toggle = (id: number) => setRows(current => current.map(row => Number(row.id) === Number(id) ? { ...row, selected: !row.selected } : row))
  const shown = useMemo(() => rows.filter(row => {
    if (selectedOnly && !row.selected) return false
    if (filters.currency && ![String(row.salary_currency), String(row.currency_id)].includes(filters.currency)) return false
    if (filters.salaryType !== "all" && row.salary_type !== filters.salaryType) return false
    if (filters.employee && String(row.id) !== filters.employee) return false
    if (filters.department && String(row.department_id) !== filters.department) return false
    if (filters.job && String(row.job_id) !== filters.job) return false
    if (filters.contractType !== "all" && row.contract_type !== filters.contractType) return false
    return `${row.employee_code} ${row.full_name} ${row.other_name || ""} ${row.department_name} ${row.job_name}`.toLowerCase().includes(search.trim().toLowerCase())
  }), [rows, filters, search, selectedOnly])

  const save = async () => {
    const employeeIds = rows.filter(row => row.selected).map(row => Number(row.id))
    if (!employeeIds.length) return message("error", "يجب اختيار موظف واحد على الأقل")
    setSaving(true)
    const response = await fetch("/api/hr/salary-opening", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, month, employee_ids: employeeIds }) })
    const result = await response.json()
    if (response.ok) { message("success", `تم فتح راتب الشهر لـ ${result.count} موظف بنجاح`); await load() } else message("error", result.error || "تعذر فتح راتب الشهر")
    setSaving(false)
  }

  const columns = useMemo<Column[]>(() => [
    { key: "selected", label: "اختر", width: 70, render: row => <div className="flex justify-center" onClick={event => event.stopPropagation()}><Checkbox checked={!!row.selected} onCheckedChange={() => toggle(row.id)} /></div> },
    { key: "employee_code", label: "رقم الموظف", width: 125 }, { key: "full_name", label: "اسم الموظف", width: "*" },
    { key: "job_name", label: "المسمى الوظيفي", width: 145 }, { key: "department_name", label: "القسم", width: 135 }, { key: "currency_name", label: "عملة الحساب", width: 125 },
    { key: "basic_salary", label: "الراتب الأساسي", width: 135, format: englishMoney }, { key: "total_salary", label: "إجمالي الراتب", width: 135, format: englishMoney }, { key: "income_tax", label: "الضريبة", width: 115, format: englishMoney }, { key: "net_salary", label: "الصافي", width: 130, format: englishMoney },
  ], [])
  const field = (label: string, value: string, onChange: (value: string) => void, options: Array<{ value: string; label: string }>) => <div><Label className="mb-2 block font-semibold">{label}</Label><select className={selectClass} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>

  return <HrPage title="فتح راتب شهر" subtitle="">
    <Messages innerRef={messagesRef} />
    <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="mb-4 flex items-center justify-between border-b pb-3"><h2 className="font-bold text-sky-700">آليات الفرز</h2><div className="flex gap-2"><Button size="sm" onClick={() => void save()} disabled={saving || loading || shown.length === 0 || !shown.some(row => row.selected)}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ"}</Button><Button size="sm" variant="outline" disabled={loading || saving} onClick={() => void load()}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div><Label className="mb-2 block font-semibold">السنة</Label><Input className={inputClass} type="number" min={2000} max={2200} value={year} onChange={event => setYear(Number(event.target.value))} /></div>
      {field("الشهر", String(month), value => setMonth(Number(value)), monthNames.map((name, index) => ({ value: String(index + 1), label: `${index + 1} - ${name}` })))}
      {field("عملة الحساب", filters.currency, value => setFilters(current => ({ ...current, currency: value })), [{ value: "", label: "الكل" }, ...(lookups.currencies || []).map((item: any) => ({ value: String(item.id), label: `${item.currency_code} / ${item.currency_name}` }))])}
      {field("نوع الراتب", filters.salaryType, value => setFilters(current => ({ ...current, salaryType: value })), [{ value: "all", label: "الكل" }, { value: "monthly", label: "شهري" }, { value: "daily", label: "يومي" }, { value: "hourly", label: "بالساعة" }])}
      {field("الموظف", filters.employee, value => setFilters(current => ({ ...current, employee: value })), [{ value: "", label: "الكل" }, ...rows.map(item => ({ value: String(item.id), label: `${item.employee_code} / ${item.full_name}` }))])}
      {field("القسم", filters.department, value => setFilters(current => ({ ...current, department: value })), [{ value: "", label: "الكل" }, ...(lookups.departments || []).map((item: any) => ({ value: String(item.id), label: item.department_name || item.name }))])}
      {field("المسمى الوظيفي", filters.job, value => setFilters(current => ({ ...current, job: value })), [{ value: "", label: "الكل" }, ...(lookups.jobs || []).map((item: any) => ({ value: String(item.id), label: item.name }))])}
      {field("نوع العقد", filters.contractType, value => setFilters(current => ({ ...current, contractType: value })), [{ value: "all", label: "الكل" }, { value: "permanent", label: "دائم" }, { value: "temporary", label: "مؤقت" }])}
    </div></CardContent></Card>
    <Card className="border-slate-200 shadow-sm"><CardContent className="space-y-3 p-4"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAll("all")}>اختيار الكل</Button><Button size="sm" variant="outline" className="border-orange-300 text-orange-700" onClick={() => setAll("reverse")}>عكس الاختيار</Button><Button size="sm" variant="outline" onClick={() => setAll("none")}>إلغاء اختيار الكل</Button><Button size="sm" variant={selectedOnly ? "default" : "outline"} onClick={() => setSelectedOnly(value => !value)}>فلترة حسب المحدد</Button><Button size="sm" variant="ghost" onClick={() => { setFilters({ ...emptyFilters, currency: String(lookups.currencies?.[0]?.id || "") }); setSearch(""); setSelectedOnly(false) }}><Eraser className="ml-2 h-4 w-4" />مسح الفرز</Button></div><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" /><Input className={`${inputClass} pr-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder="البحث العام" /></div><Grid rows={shown} columns={columns} height="48vh" /></CardContent></Card>
  </HrPage>
}
