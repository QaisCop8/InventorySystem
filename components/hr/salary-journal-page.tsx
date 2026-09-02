"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw, Search } from "lucide-react"
import Messages from "@/components/common/Messages"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Grid, HrPage, inputClass, selectClass, type Column } from "./hr-shared"

const englishInteger = (value: any) => String(Number(value) || 0)
const englishMoney = (value: any) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isSalaryClosed = (value: any) => value === true || value === 1 || ["true", "1"].includes(String(value ?? "").trim().toLowerCase())

export function SalaryJournalPage() {
  const messages = useRef<any>(null)
  const [rows, setRows] = useState<any[]>([]), [periods, setPeriods] = useState<any[]>([]), [lookups, setLookups] = useState<any>({ currencies: [], departments: [], jobs: [] })
  const [period, setPeriod] = useState(""), [search, setSearch] = useState("")
  const [employee, setEmployee] = useState(""), [department, setDepartment] = useState(""), [job, setJob] = useState(""), [currency, setCurrency] = useState(""), [salaryType, setSalaryType] = useState("all"), [contractType, setContractType] = useState("all")
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState<"close" | "post" | null>(null)
  const notify = (severity: "success" | "error", detail: string) => { messages.current?.clear?.(); messages.current?.show?.([{ severity, summary: "", detail, life: 5000 }]) }
  const load = useCallback(async () => { setBusy(true); try { const response = await fetch("/api/hr/salary-journal"); if (response.ok) setRows(await response.json()); else notify("error","تعذر تحميل الرواتب") } finally { setBusy(false) } }, [])
  useEffect(() => { void Promise.all([fetch("/api/hr/lookups"),fetch("/api/hr/periods")]).then(async ([lookupsResponse,periodsResponse]) => { if (lookupsResponse.ok) { const data=await lookupsResponse.json(); setLookups(data); setCurrency(current => current || String(data.currencies?.[0]?.id || "")); setDepartment(current => current || String(data.departments?.[0]?.id || "")) } if (periodsResponse.ok) setPeriods(await periodsResponse.json()) }) }, [])
  useEffect(() => {
    document.querySelectorAll("select").forEach(select => {
      if (select.parentElement?.querySelector("label")?.textContent?.trim() === "العملة") select.querySelector('option[value=""]')?.remove()
    })
  }, [lookups.currencies])

  const shown = useMemo(() => rows.filter(row => {
    if (period && String(row.period_id) !== period) return false
    if (employee && String(row.employee_id)!==employee) return false
    if (department && String(row.department_id)!==department) return false
    if (job && String(row.job_id)!==job) return false
    if (currency && String(row.currency_id || row.salary_currency)!==currency) return false
    if (salaryType!=="all" && row.salary_type!==salaryType) return false
    if (contractType!=="all" && row.contract_type!==contractType) return false
    return `${row.employee_code} ${row.full_name} ${row.other_name||""} ${row.department_name||""} ${row.job_name||""}`.toLowerCase().includes(search.trim().toLowerCase())
  }), [rows,period,employee,department,job,currency,salaryType,contractType,search])
  const months = new Set(shown.map(row => `${row.year}-${row.month}`)), currencies = new Set(shown.map(row => String(row.currency_id || row.salary_currency)))
  const hasOpenSalary = shown.some(row => !isSalaryClosed(row.is_closed))
  const allDisplayedPosted = shown.length>0 && shown.every(row => Number(row.journal_id)>0)
  const selectedDepartment = (lookups.departments||[]).find((item:any) => String(item.id)===department)
  const selectedBranchId = Number(selectedDepartment?.branch_id) || 0
  const canClose = shown.length>0 && hasOpenSalary && months.size===1
  const canPost = shown.length>0 && shown.every(row => isSalaryClosed(row.is_closed)) && !allDisplayedPosted && months.size===1 && currencies.size===1 && selectedBranchId>0
  const execute = async (action: "close" | "post") => {
    setConfirm(null)
    if (action === "post" && !selectedBranchId) return notify("error", "يجب اختيار قسم مرتبط بفرع صحيح")
    const affectedIds = (action === "close" ? shown.filter(row => !isSalaryClosed(row.is_closed)) : shown.filter(row => !Number(row.journal_id))).map(row => Number(row.id)).filter(Boolean)
    if (!affectedIds.length) return notify("error", action === "close" ? "جميع الرواتب المعروضة مغلقة" : "لا توجد رواتب لتنفيذ العملية")
    if (action === "post") setRows(current => current.map(row => ({ ...row, journal_error: "" })))
    setBusy(true)
    try {
      const response = await fetch("/api/hr/salary-journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payroll_ids: affectedIds, branch_id: selectedBranchId }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (Array.isArray(data.row_errors)) {
          const errors = new Map(data.row_errors.map((item: any) => [Number(item.payroll_id), String(item.error || "")]))
          setRows(current => current.map(row => ({ ...row, journal_error: errors.get(Number(row.id)) || "" })))
        }
        return notify("error", data.error || `تعذر تنفيذ العملية (${response.status})`)
      }
      if (action === "close") setRows(current => current.map(row => affectedIds.includes(Number(row.id)) ? { ...row, is_closed: true, closed_at: data.closed_at || new Date().toISOString() } : row))
      notify("success", action === "close" ? "تم إغلاق الرواتب بنجاح" : `تم تنفيذ قيد الراتب بنجاح - رقم القيد ${data.journal_code}`)
      await load()
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "تعذر الاتصال بالخادم")
    } finally {
      setBusy(false)
    }
  }
  const options = (items:any[], name:(item:any)=>string) => items.map(item=><option key={item.id} value={item.id}>{name(item)}</option>)
  const currencyFilterOptions = options(lookups.currencies||[], item => `${item.currency_code} / ${item.currency_name}`)
  const hasRowErrors = rows.some(row => String(row.journal_error || "").trim())
  const columns=useMemo<Column[]>(()=>[
    {key:"year",label:"السنة",width:80,format:englishInteger},{key:"month",label:"الشهر",width:75,format:englishInteger},{key:"employee_code",label:"رقم الموظف",width:120},{key:"full_name",label:"اسم الموظف",width:"*"},
    {key:"job_name",label:"المسمى الوظيفي",width:150},{key:"department_name",label:"القسم",width:130},{key:"basic_salary",label:"الراتب الأساسي",width:130,format:englishMoney},{key:"total_salary",label:"إجمالي الراتب",width:130,format:englishMoney},{key:"income_tax",label:"الضريبة",width:100,format:englishMoney},{key:"net_salary",label:"الصافي",width:120,format:englishMoney},
    ...(hasRowErrors ? [{key:"journal_error",label:"الأخطاء",width:"*",render:(row:any)=><span className="font-semibold text-red-600">{row.journal_error}</span>} as Column] : [])
  ],[hasRowErrors])
  return <HrPage title="قيد الراتب" subtitle="إغلاق الرواتب وتنفيذ القيد المحاسبي">
    <Messages innerRef={messages}/>
    <Card><CardContent className="p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><div><Label>شهر الراتب</Label><select className={selectClass} value={period} onChange={e=>setPeriod(e.target.value)}><option value="">اختر الشهر...</option>{periods.map(item=><option key={item.id} value={item.id}>{item.month}/{item.year} - {item.status === "open" ? "مفتوح" : "مغلق"}</option>)}</select></div><div><Label>الموظف</Label><select className={selectClass} value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">الكل</option>{options(rows.map(row=>({id:row.employee_id,employee_code:row.employee_code,full_name:row.full_name})).filter((item,index,array)=>array.findIndex(x=>x.id===item.id)===index),item=>`${item.employee_code} / ${item.full_name}`)}</select></div><div><Label>القسم</Label><select className={selectClass} value={department} onChange={e=>setDepartment(e.target.value)}>{options(lookups.departments||[],item=>item.department_name||item.name)}</select></div><div><Label>المسمى الوظيفي</Label><select className={selectClass} value={job} onChange={e=>setJob(e.target.value)}><option value="">الكل</option>{options(lookups.jobs||[],item=>item.name)}</select></div><div><Label>العملة</Label><select className={selectClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">الكل</option>{options(lookups.currencies||[],item=>`${item.currency_code} / ${item.currency_name}`)}</select></div><div><Label>نوع الراتب</Label><select className={selectClass} value={salaryType} onChange={e=>setSalaryType(e.target.value)}><option value="all">الكل</option><option value="monthly">شهري</option><option value="daily">يومي</option><option value="hourly">بالساعة</option></select></div><div><Label>نوع العقد</Label><select className={selectClass} value={contractType} onChange={e=>setContractType(e.target.value)}><option value="all">الكل</option><option value="permanent">دائم</option><option value="temporary">مؤقت</option></select></div><div className="flex items-end"><Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={()=>void load()}><RefreshCw className={`ml-2 h-4 w-4 ${busy?"animate-spin":""}`}/>تحديث</Button></div></div></CardContent></Card>
    <Card><CardContent className="space-y-3 p-4"><div className="grid gap-3 sm:grid-cols-2"><Button className="border-orange-300 text-orange-700" variant="outline" disabled={!canClose||busy} onClick={()=>void execute("close")}>إغلاق الراتب</Button><Button className="border-orange-300 text-orange-700" variant="outline" disabled={!canPost||busy} onClick={()=>void execute("post")}>تنفيذ قيد الراتب</Button></div><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><Input className={`${inputClass} pr-9`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="البحث العام"/></div><Grid rows={shown} columns={columns} height="52vh"/></CardContent></Card>
    <ConfirmDialogYesNo visible={confirm==="close"} message="هل تريد إغلاق جميع الرواتب المعروضة؟" onConfirm={()=>void execute("close")} onCancel={()=>setConfirm(null)}/><ConfirmDialogYesNo visible={confirm==="post"} message="هل تريد تنفيذ قيد الرواتب المغلقة المعروضة؟" onConfirm={()=>void execute("post")} onCancel={()=>setConfirm(null)}/>
  </HrPage>
}
