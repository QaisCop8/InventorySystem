"use client"
import { tr } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eraser, RefreshCw, Save, Search } from "lucide-react"
import Messages from "@/components/common/Messages"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Grid, HrPage, inputClass, selectClass, type Column } from "./hr-shared"

const monthNames = [tr("كانون الثاني"), tr("شباط"), tr("آذار"), tr("نيسان"), tr("أيار"), tr("حزيران"), tr("تموز"), tr("آب"), tr("أيلول"), tr("تشرين الأول"), tr("تشرين الثاني"), tr("كانون الأول")]
type Filters = { currency: string; salaryType: string; employee: string; department: string; job: string; contractType: string }
const emptyFilters: Filters = { currency: "", salaryType: "all", employee: "", department: "", job: "", contractType: "all" }
const englishMoney = (value: any) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())

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
  const load = useCallback(async () => { setLoading(true); const response = await fetch(`/api/hr/salary-opening?year=${year}&month=${month}`); if (response.ok) setRows((await response.json()).map((row: any) => ({ ...row, selected: row.payroll_state !== "closed" }))); else message("error", (await response.json()).error || "تعذر تحميل الموظفين"); setLoading(false) }, [year, month])
  useEffect(() => { void loadLookups() }, [loadLookups])
  useEffect(() => { void load() }, [load])

  // راتب مغلق لا يُفتح ولا يُعاد احتسابه
  const setAll = (mode: "all" | "none" | "reverse") => setRows(current => current.map(row => row.payroll_state === "closed" ? row : ({ ...row, selected: mode === "all" ? true : mode === "none" ? false : !row.selected })))
  const toggle = (id: number) => setRows(current => current.map(row => Number(row.id) === Number(id) && row.payroll_state !== "closed" ? { ...row, selected: !row.selected } : row))
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
    if (response.ok) { message("success", `تم فتح / إعادة احتساب راتب الشهر لـ ${result.count} موظف بنجاح (شاملاً حركات الدوام المعتمدة)`); await load() } else message("error", result.error || "تعذر فتح راتب الشهر")
    setSaving(false)
  }

  const columns = useMemo<Column[]>(() => [
    { key: "selected", label: tr("اختر"), width: 70, render: row => <div className="flex justify-center" onClick={event => event.stopPropagation()}><Checkbox checked={!!row.selected} disabled={row.payroll_state === "closed"} onCheckedChange={() => toggle(row.id)} /></div> },
    { key: "payroll_state", label: tr("حالة الراتب"), width: 120, render: row => row.payroll_state === "closed" ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{tr("مغلق")}</span> : row.payroll_state === "open" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800" title={tr("الحفظ يعيد احتسابه")}>{tr("مفتوح مسبقاً")}</span> : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{tr("جديد")}</span> },
    { key: "employee_code", label: tr("رقم الموظف"), width: 125 }, { key: "full_name", label: tr("اسم الموظف"), width: "*" },
    { key: "job_name", label: tr("المسمى الوظيفي"), width: 145 }, { key: "department_name", label: tr("القسم"), width: 135 }, { key: "currency_name", label: tr("عملة الحساب"), width: 125 },
    { key: "basic_salary", label: tr("الراتب الأساسي"), width: 135, format: englishMoney }, { key: "attendance_earnings", label: tr("إضافي الدوام"), width: 120, render: row => <span className={Number(row.attendance_earnings) ? "font-bold text-emerald-700" : "text-slate-300"} title={(row.attendance_details || []).filter((line: any) => line.kind === "earning").map((line: any) => `${line.label}: ${englishMoney(line.amount)}`).join("\n")}>{englishMoney(row.attendance_earnings)}</span> }, { key: "attendance_deductions", label: tr("خصومات الدوام"), width: 125, render: row => <span className={Number(row.attendance_deductions) ? "font-bold text-rose-700" : "text-slate-300"} title={(row.attendance_details || []).filter((line: any) => line.kind === "deduction").map((line: any) => `${line.label}: ${englishMoney(line.amount)}`).join("\n")}>{englishMoney(row.attendance_deductions)}</span> }, { key: "advance_deductions", label: tr("السلف"), width: 120, render: row => <span className={Number(row.advance_deductions) ? "font-bold text-rose-700" : "text-slate-300"}>{englishMoney(row.advance_deductions)}</span> }, { key: "loan_deductions", label: tr("القروض"), width: 120, render: row => <span className={Number(row.loan_deductions) ? "font-bold text-rose-700" : "text-slate-300"}>{englishMoney(row.loan_deductions)}</span> }, { key: "cash_deductions", label: tr("خصم نقدي"), width: 120, render: row => <span className={Number(row.cash_deductions) ? "font-bold text-rose-700" : "text-slate-300"}>{englishMoney(row.cash_deductions)}</span> }, { key: "total_salary", label: tr("إجمالي الراتب"), width: 135, format: englishMoney }, { key: "income_tax", label: tr("الضريبة"), width: 115, format: englishMoney }, { key: "net_salary", label: tr("الصافي"), width: 130, format: englishMoney },
  ], [])
  const field = (label: string, value: string, onChange: (value: string) => void, options: Array<{ value: string; label: string }>) => <div><Label className="mb-2 block font-semibold">{label}</Label><select className={selectClass} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>

  return <HrPage title={tr("فتح راتب شهر")} subtitle="">
    <Messages innerRef={messagesRef} />
    <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="mb-4 flex items-center justify-between border-b pb-3"><h2 className="font-bold text-sky-700">{tr("آليات الفرز")}</h2><div className="flex gap-2"><Button size="sm" onClick={() => void save()} disabled={saving || loading || shown.length === 0 || !shown.some(row => row.selected)}><Save className="me-2 h-4 w-4" />{saving ? tr("جاري الحفظ...") : tr("حفظ")}</Button><Button size="sm" variant="outline" disabled={loading || saving} onClick={() => void load()}><RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}</Button></div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div><Label className="mb-2 block font-semibold">{tr("السنة")}</Label><Input className={inputClass} type="number" min={2000} max={2200} value={year} onChange={event => setYear(Number(event.target.value))} /></div>
      {field(tr("الشهر"), String(month), value => setMonth(Number(value)), monthNames.map((name, index) => ({ value: String(index + 1), label: `${index + 1} - ${name}` })))}
      {field(tr("عملة الحساب"), filters.currency, value => setFilters(current => ({ ...current, currency: value })), [{ value: "", label: tr("الكل") }, ...(lookups.currencies || []).map((item: any) => ({ value: String(item.id), label: `${item.currency_code} / ${item.currency_name}` }))])}
      {field(tr("نوع الراتب"), filters.salaryType, value => setFilters(current => ({ ...current, salaryType: value })), [{ value: "all", label: tr("الكل") }, { value: "monthly", label: tr("شهري") }, { value: "daily", label: tr("يومي") }, { value: "hourly", label: tr("بالساعة") }])}
      {field(tr("الموظف"), filters.employee, value => setFilters(current => ({ ...current, employee: value })), [{ value: "", label: tr("الكل") }, ...(lookups.employees || []).map((item: any) => ({ value: String(item.id), label: `${item.employee_code} / ${item.full_name}` }))])}
      {field(tr("القسم"), filters.department, value => setFilters(current => ({ ...current, department: value })), [{ value: "", label: tr("الكل") }, ...(lookups.departments || []).map((item: any) => ({ value: String(item.id), label: item.department_name || item.name }))])}
      {field(tr("المسمى الوظيفي"), filters.job, value => setFilters(current => ({ ...current, job: value })), [{ value: "", label: tr("الكل") }, ...(lookups.jobs || []).map((item: any) => ({ value: String(item.id), label: item.name }))])}
      {field(tr("نوع العقد"), filters.contractType, value => setFilters(current => ({ ...current, contractType: value })), [{ value: "all", label: tr("الكل") }, { value: "permanent", label: tr("دائم") }, { value: "temporary", label: tr("مؤقت") }])}
    </div></CardContent></Card>
    <Card className="border-slate-200 shadow-sm"><CardContent className="space-y-3 p-4"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setAll("all")}>{tr("اختيار الكل")}</Button><Button size="sm" variant="outline" className="border-orange-300 text-orange-700" onClick={() => setAll("reverse")}>{tr("عكس الاختيار")}</Button><Button size="sm" variant="outline" onClick={() => setAll("none")}>{tr("إلغاء اختيار الكل")}</Button><Button size="sm" variant={selectedOnly ? "default" : "outline"} onClick={() => setSelectedOnly(value => !value)}>{tr("فلترة حسب المحدد")}</Button><Button size="sm" variant="ghost" onClick={() => { setFilters({ ...emptyFilters, currency: String(lookups.currencies?.[0]?.id || "") }); setSearch(""); setSelectedOnly(false) }}><Eraser className="me-2 h-4 w-4" />{tr("مسح الفرز")}</Button></div><div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-slate-400" /><Input className={`${inputClass} ps-9`} value={search} onChange={event => setSearch(event.target.value)} placeholder={tr("البحث العام")} /></div><Grid rows={shown} columns={columns} height="48vh" /></CardContent></Card>
  </HrPage>
}
