"use client"

import { tr, appDir } from "@/lib/i18n"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ReportMultiChoice } from "@/components/reports/account-statement-report"
import { Cog, Loader2, Lock, Pencil, Plus, RefreshCw, Save, Trash2 } from "lucide-react"
import { HrPage, englishMoney, inputClass, selectClass } from "./hr-shared"
import { AccountCodeField } from "./attendance-workbench"

// السلف / القروض / الخصم النقدي — كل حركة تُخصم من راتب شهر (أو أقساط أشهر للقرض). الحفظ والتعديل والحذف ممنوعة إن
// وقع أحد أشهرها في راتب مغلق/مدفوع للموظف (يفحصها الخادم: /api/hr/salary-deductions، lib/salary-deductions.ts).

type DeductionType = "advance" | "loan" | "cash"
const META: Record<DeductionType, { title: string; single: string; subtitle: string; newLabel: string; accountLabel: string }> = {
  advance: { title: "السلف", single: "سلفة", subtitle: "سلف الموظفين — تُخصم من صافي راتب الشهر المحدد", newLabel: "سلفة جديدة", accountLabel: "حساب سلف الموظفين (دائن في قيد الراتب)" },
  loan: { title: "القروض", single: "قرض", subtitle: "قروض الموظفين — تُقسَّط على رواتب الأشهر بدءاً من الشهر المحدد", newLabel: "قرض جديد", accountLabel: "حساب قروض الموظفين (دائن في قيد الراتب)" },
  cash: { title: "خصم نقدي", single: "خصم نقدي", subtitle: "خصومات نقدية على الموظفين — تُخصم من صافي راتب الشهر المحدد", newLabel: "خصم نقدي جديد", accountLabel: "حساب الخصومات النقدية (دائن في قيد الراتب)" },
}
type ScheduleRow = { year: number; month: number; amount: number; paid: boolean }
const today = () => new Date().toISOString().slice(0, 10)
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
const monthLabel = (year: number, month: number) => `${String(month).padStart(2, "0")}/${year}`
const toMonthInput = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`

/** معاينة الأقساط بنفس قاعدة الخادم (القسط الأخير يأخذ فرق التقريب). */
function previewSchedule(amount: number, installments: number, monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number)
  const count = Math.max(1, Math.floor(installments) || 1)
  if (!(amount > 0) || !year || !month) return []
  const each = Math.round((amount / count) * 1000) / 1000
  return Array.from({ length: count }, (_, index) => {
    const absolute = year * 12 + (month - 1) + index
    return { year: Math.floor(absolute / 12), month: (absolute % 12) + 1, amount: index === count - 1 ? Math.round((amount - each * (count - 1)) * 1000) / 1000 : each }
  })
}

function Message({ text, tone }: { text: string; tone: "error" | "success" }) {
  if (!text) return null
  return <p className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{text}</p>
}

function SettingsDialog({ type, open, onOpenChange }: { type: DeductionType; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [accountId, setAccountId] = useState("")
  const [initial, setInitial] = useState<{ code: string; name: string } | undefined>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!open) return
    setError("")
    fetch(`/api/hr/salary-deductions?type=${type}&settings=1`, { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setAccountId(String(data.account_id || ""))
      setInitial(data.account ? { code: data.account.code, name: data.account.name } : undefined)
    }).catch(() => setError(tr("تعذر تحميل الإعدادات")))
  }, [open, type])
  const save = async () => {
    setSaving(true); setError("")
    try {
      const response = await fetch("/api/hr/salary-deductions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, action: "save-settings", account_id: accountId }) })
      if (!response.ok) throw new Error((await response.json()).error || tr("تعذر الحفظ"))
      onOpenChange(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("تعذر الحفظ")) } finally { setSaving(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle>{tr("إعدادات {0}", tr(META[type].title))}</DialogTitle>
          <DialogDescription>{tr("الحساب مطلوب لتنفيذ قيد الراتب عند وجود خصومات من هذا النوع في الرواتب.")}</DialogDescription>
        </DialogHeader>
        <AccountCodeField label={tr(META[type].accountLabel)} accountId={accountId} initial={initial} onChange={setAccountId} />
        {error && <Message text={error} tone="error" />}
        <DialogFooter><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{tr("حفظ")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SalaryDeductionsPage({ type }: { type: DeductionType }) {
  const meta = META[type]
  const isLoan = type === "loan"
  const now = new Date()
  const emptyForm = () => ({ id: 0, employee_id: "", doc_date: today(), amount: "", installments: isLoan ? "6" : "1", start_month: toMonthInput(now.getFullYear(), now.getMonth() + 1), notes: "" })
  const [employees, setEmployees] = useState<any[]>([])
  const [filters, setFilters] = useState({ year: String(now.getFullYear()), month: "", employeeIds: [] as number[] })
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" }>({ text: "", tone: "success" })
  const [dialogError, setDialogError] = useState("")

  useEffect(() => {
    fetch("/api/hr/lookups", { cache: "no-store" }).then((r) => r.json()).then((data) => setEmployees(data.employees || [])).catch(() => undefined)
  }, [])
  const employeeOptions = useMemo(() => employees.map((row) => ({ id: Number(row.id), code: row.employee_code, name: row.full_name })), [employees])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type })
      if (filters.year) params.set("year", filters.year)
      if (filters.year && filters.month) params.set("month", filters.month)
      if (filters.employeeIds.length) params.set("employee_ids", filters.employeeIds.join(","))
      const response = await fetch(`/api/hr/salary-deductions?${params}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) { setRows([]); setMessage({ text: data?.error || tr("تعذر تحميل البيانات"), tone: "error" }); return }
      setRows(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [type, filters])
  useEffect(() => { void load() }, [load])

  const openForm = (row?: any) => {
    setDialogError("")
    setForm(row ? { id: row.id, employee_id: String(row.employee_id), doc_date: row.doc_date, amount: String(row.amount), installments: String(row.installments), start_month: toMonthInput(row.start_year, row.start_month), notes: row.notes || "" } : emptyForm())
    setOpen(true)
  }
  const save = async () => {
    const [startYear, startMonth] = String(form.start_month || "").split("-").map(Number)
    setSaving(true); setDialogError("")
    try {
      const response = await fetch("/api/hr/salary-deductions", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: form.id || undefined, employee_id: Number(form.employee_id) || 0, doc_date: form.doc_date, amount: Number(form.amount) || 0, installments: Number(form.installments) || 1, start_year: startYear || 0, start_month: startMonth || 0, notes: form.notes }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذر الحفظ"))
      setOpen(false); await load(); setMessage({ text: tr("تم الحفظ"), tone: "success" })
    } catch (reason) { setDialogError(reason instanceof Error ? reason.message : tr("تعذر الحفظ")) } finally { setSaving(false) }
  }
  const remove = async (row: any) => {
    if (!(await confirmYesNo(tr("حذف {0} للموظف {1}؟", tr(meta.single), row.employee_name)))) return
    const response = await fetch(`/api/hr/salary-deductions?id=${row.id}`, { method: "DELETE" })
    if (response.ok) { await load(); setMessage({ text: tr("تم الحذف"), tone: "success" }) }
    else setMessage({ text: (await response.json().catch(() => ({}))).error || tr("تعذر الحذف"), tone: "error" })
  }

  const preview = previewSchedule(Number(form.amount) || 0, isLoan ? Number(form.installments) || 1 : 1, String(form.start_month || ""))
  const paidOf = (row: any) => (row.schedule as ScheduleRow[]).filter((item) => item.paid).reduce((sum, item) => sum + Number(item.amount), 0)
  const totals = rows.reduce((acc, row) => ({ amount: acc.amount + Number(row.amount), paid: acc.paid + paidOf(row) }), { amount: 0, paid: 0 })
  const years = Array.from({ length: 7 }, (_, index) => now.getFullYear() + 1 - index)

  return (
    <HrPage title={tr(meta.title)} subtitle={tr(meta.subtitle)}>
      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><Label>{tr("سنة الخصم")}</Label><select className={selectClass} value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}><option value="">{tr("الكل")}</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
          <div><Label>{tr("شهر الخصم")}</Label><select className={selectClass} value={filters.month} disabled={!filters.year} onChange={(e) => setFilters({ ...filters, month: e.target.value })}><option value="">{tr("كل الأشهر")}</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></div>
          <div className="lg:col-span-2"><ReportMultiChoice label={tr("الموظفون")} options={employeeOptions} selected={filters.employeeIds} onChange={(employeeIds) => setFilters({ ...filters, employeeIds })} placeholder={tr("كل الموظفين")} /></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => openForm()}><Plus className="me-2 h-4 w-4" />{tr(meta.newLabel)}</Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{tr("تحديث")}</Button>
          <Button variant="outline" className="ms-auto" onClick={() => setSettingsOpen(true)}><Cog className="me-2 h-4 w-4" />{tr("إعدادات الحساب")}</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{tr("تُخصم من صافي الراتب عند فتح راتب الشهر أو إعادة احتسابه، ويُحدَّث الراتب المفتوح فوراً. لا يمكن الحفظ أو التعديل أو الحذف إذا كان راتب الموظف لذلك الشهر مغلقاً/مدفوعاً.")}</p>
      </div>
      <Message text={message.text} tone={message.tone} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[[tr("عدد الحركات"), String(rows.length)], [tr("الإجمالي"), englishMoney(totals.amount)], [tr("المخصوم من رواتب مدفوعة"), englishMoney(totals.paid)], [tr("المتبقي"), englishMoney(totals.amount - totals.paid)]].map(([label, value]) => (
          <div key={label} className={`${card} p-3`}><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-black tabular-nums">{value}</p></div>
        ))}
      </div>
      <div className={`${card} max-h-[60vh] overflow-auto p-0`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-800 text-white">
            <tr>
              {[tr("التاريخ"), tr("الموظف"), tr("المبلغ"), ...(isLoan ? [tr("الأقساط"), tr("من شهر")] : [tr("شهر الخصم")]), tr("المخصوم"), tr("المتبقي"), tr("ملاحظات"), ""].map((label, index) => <th key={index} className="px-3 py-2.5 text-start text-xs font-bold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const schedule = row.schedule as ScheduleRow[]
              const paid = paidOf(row)
              const locked = schedule.some((item) => item.paid)
              return (
                <tr key={row.id} className="border-b hover:bg-teal-50/50" onDoubleClick={() => { if (!locked) openForm(row) }}>
                  <td className="px-3 py-2 font-mono text-xs">{row.doc_date}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs text-teal-700">{row.employee_code}</span> <b>{row.employee_name}</b></td>
                  <td className="px-3 py-2 font-mono" dir="ltr">{englishMoney(row.amount)}</td>
                  {isLoan
                    ? <><td className="px-3 py-2 text-xs" title={schedule.map((item) => `${monthLabel(item.year, item.month)}: ${englishMoney(item.amount)}${item.paid ? ` ✓` : ""}`).join("\n")}>{schedule.filter((item) => item.paid).length} / {row.installments}</td><td className="px-3 py-2 font-mono text-xs">{monthLabel(row.start_year, row.start_month)}</td></>
                    : <td className="px-3 py-2 font-mono text-xs">{monthLabel(row.start_year, row.start_month)}</td>}
                  <td className="px-3 py-2 font-mono text-emerald-700" dir="ltr">{englishMoney(paid)}</td>
                  <td className="px-3 py-2 font-mono text-rose-700" dir="ltr">{englishMoney(Number(row.amount) - paid)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-slate-500">{row.notes || ""}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {locked
                      ? <span className="inline-flex items-center gap-1 text-xs text-slate-400" title={tr("دخلت راتباً مغلقاً/مدفوعاً")}><Lock className="h-3.5 w-3.5" />{tr("مدفوع")}</span>
                      : <>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openForm(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-rose-600" onClick={() => void remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={isLoan ? 9 : 8} className="py-14 text-center text-slate-500">{loading ? tr("جاري التحميل...") : tr("لا توجد حركات")}</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value) }}>
        <DialogContent dir={appDir()} className="max-w-lg">
          <DialogHeader className="text-start"><DialogTitle>{form.id ? tr("تعديل {0}", tr(meta.single)) : tr(meta.newLabel)}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>{tr("الموظف *")}</Label><select className={selectClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}><option value="">{tr("اختر الموظف")}</option>{employees.map((row) => <option key={row.id} value={row.id}>{row.employee_code} — {row.full_name}</option>)}</select></div>
            <div><Label>{tr("التاريخ *")}</Label><Input type="date" dir="ltr" className={inputClass} value={form.doc_date} onChange={(e) => setForm({ ...form, doc_date: e.target.value })} /></div>
            <div><Label>{tr("المبلغ *")}</Label><Input type="number" step="0.01" min="0" dir="ltr" className={inputClass} value={form.amount} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            {isLoan && <div><Label>{tr("عدد الأقساط *")}</Label><Input type="number" step="1" min="1" max="120" dir="ltr" className={inputClass} value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} /></div>}
            <div><Label>{isLoan ? tr("أول شهر خصم *") : tr("شهر الخصم من الراتب *")}</Label><Input type="month" dir="ltr" className={inputClass} value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>{tr("ملاحظات")}</Label><Input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            {isLoan && preview.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-xl bg-slate-50 p-3 text-xs sm:col-span-2">
                <p className="mb-1 font-bold text-slate-700">{tr("جدول الأقساط")}</p>
                <div className="grid grid-cols-3 gap-1">
                  {preview.map((item) => <span key={`${item.year}-${item.month}`} className="font-mono" dir="ltr">{monthLabel(item.year, item.month)}: {englishMoney(item.amount)}</span>)}
                </div>
              </div>
            )}
          </div>
          {dialogError && <Message text={dialogError} tone="error" />}
          <DialogFooter><Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{tr("حفظ")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <SettingsDialog type={type} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </HrPage>
  )
}

export const SalaryAdvancesPage = () => <SalaryDeductionsPage type="advance" />
export const SalaryLoansPage = () => <SalaryDeductionsPage type="loan" />
export const CashDeductionsPage = () => <SalaryDeductionsPage type="cash" />
