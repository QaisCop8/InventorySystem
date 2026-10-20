"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarCheck2, CheckCircle2, History, Loader2, Lock, RefreshCw, Undo2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useToast } from "@/hooks/use-toast"

// معالج إقفال السنة المالية: الإعداد ← الفحوصات ← معاينة قيد الإقفال ← التنفيذ.
// القيد يصفّر الإيرادات والمصروفات إلى حساب الأرباح المدورة (لكل فرع)، ثم تُقفل السنة في إقفال الفترات.

type Check = { key: string; level: "error" | "warning" | "ok"; title: string; detail?: string }
type BranchPreview = { branch_id: number; branch_name: string; net: number; lines: { account_id: number; code: string; name: string; balance: number }[] }
type Preview = {
  year: number; from: string; to: string; checks: Check[]; can_close: boolean
  revenue: number; expenses: number; net_result: number; branches: BranchPreview[]
  balance_sheet: { accounts: number; debit: number; credit: number }
}
type Closing = {
  id: number; fiscal_year: number; net_result: number; status: number; note: string | null; created_by: string | null; created_at: string
  reversed_at: string | null; retained_code: string | null; retained_name: string | null; journal_codes: string | null
}

const money = (value: unknown) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const STEPS = ["الإعداد", "الفحوصات", "قيد الإقفال", "التنفيذ"]

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

export default function YearEndClosing() {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [closings, setClosings] = useState<Closing[]>([])
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [retainedId, setRetainedId] = useState("")
  const [lockYear, setLockYear] = useState(true)
  const [advanceYear, setAdvanceYear] = useState(false)
  const [note, setNote] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ journals: { code: string; branch_name: string }[]; net_result: number } | null>(null)

  const loadHistory = useCallback(async (initial = false) => {
    try {
      const data = await api<{ closings: Closing[]; years: number[]; suggested_year: number; default_retained_account_id: number | null }>("/api/year-end-closing")
      setClosings(data.closings || []); setYears(data.years || [])
      if (initial) {
        if (data.suggested_year) setYear(data.suggested_year)
        if (data.default_retained_account_id) setRetainedId(String(data.default_retained_account_id))
      }
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" })
    }
  }, [toast])
  useEffect(() => { void loadHistory(true) }, [loadHistory])

  const runPreview = async () => {
    setLoading(true)
    try {
      const data = await api<Preview>(`/api/year-end-closing?year=${year}&retained_account_id=${Number(retainedId) || ""}`)
      setPreview(data); setStep(1)
    } catch (error) {
      toast({ title: "تعذر الفحص", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally { setLoading(false) }
  }

  const execute = async () => {
    if (!preview) return
    if (!(await confirmYesNo(`إقفال السنة المالية ${year}؟ سيُنشأ قيد الإقفال${lockYear ? " وتُقفل كل سندات السنة" : ""}.`))) return
    setRunning(true)
    try {
      const data = await api<{ journals: { code: string; branch_name: string }[]; net_result: number }>("/api/year-end-closing", {
        method: "POST", body: JSON.stringify({ year, retained_account_id: Number(retainedId), lock_year: lockYear, advance_working_year: advanceYear, note }),
      })
      setResult(data); setStep(3)
      toast({ title: `تم إقفال السنة ${year}` })
      void loadHistory()
    } catch (error) {
      toast({ title: "تعذر الإقفال", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally { setRunning(false) }
  }

  const reverse = async (row: Closing) => {
    if (!(await confirmYesNo(`التراجع عن إقفال السنة ${row.fiscal_year}؟ ستُلغى قيود الإقفال (${row.journal_codes || ""}) ويُفتح قفل السنة.`))) return
    try {
      await api("/api/year-end-closing", { method: "PATCH", body: JSON.stringify({ id: row.id, action: "reverse" }) })
      toast({ title: `تم التراجع عن إقفال ${row.fiscal_year}` })
      void loadHistory()
    } catch (error) {
      toast({ title: "تعذر التراجع", description: error instanceof Error ? error.message : "", variant: "destructive" })
    }
  }

  const restart = () => { setStep(0); setPreview(null); setResult(null) }
  const yearOptions = [...new Set([...years, new Date().getFullYear(), new Date().getFullYear() - 1])].sort((a, b) => b - a)
  const errors = preview?.checks.filter((check) => check.level === "error").length || 0
  const warnings = preview?.checks.filter((check) => check.level === "warning").length || 0

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarCheck2 className="h-6 w-6 text-indigo-600" />إقفال السنة المالية</h1>
          <p className="mt-1 text-sm text-muted-foreground">يرحّل صافي الإيرادات والمصروفات إلى حساب الأرباح المدورة، ويقفل سندات السنة، وتنتقل أرصدة الميزانية للسنة الجديدة.</p>
        </div>
        <Button variant="outline" onClick={() => void loadHistory()}><RefreshCw className="ml-2 h-4 w-4" />تحديث</Button>
      </div>

      {/* شريط الخطوات */}
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((label, index) => (
          <div key={label} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${index === step ? "border-indigo-300 bg-indigo-50 font-bold text-indigo-700" : index < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-slate-400"}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${index < step ? "bg-emerald-500 text-white" : index === step ? "bg-indigo-600 text-white" : "bg-slate-200"}`}>{index < step ? "✓" : index + 1}</span>
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>السنة المالية</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((value) => <option key={value} value={value}>{value}{closings.some((row) => row.fiscal_year === value && Number(row.status) !== 3) ? " (مقفلة)" : ""}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">الفترة: {year}-01-01 ← {year}-12-31 — قيد الإقفال بتاريخ {year}-12-31</p>
            </div>
            <div className="space-y-1.5">
              <AutoCompleteAccount label="حساب الأرباح المدورة (حقوق الملكية)" value={retainedId} valueMode="id" onValueChange={setRetainedId} showCostCenterButton={false} placeholder="كود الحساب" />
            </div>
            <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={lockYear} onChange={(event) => setLockYear(event.target.checked)} />
              <span><b>إقفال سندات السنة</b><span className="block text-xs text-muted-foreground">يمنع إضافة/تعديل/ترحيل/حذف أي سند بتاريخ داخل السنة لكل الفروع (يظهر في إقفال الفترات)</span></span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={advanceYear} onChange={(event) => setAdvanceYear(event.target.checked)} />
              <span><b>فتح السنة الجديدة {year + 1}</b><span className="block text-xs text-muted-foreground">تحويل سنة العمل في الإعدادات العامة إلى {year + 1} (كل الأشهر مفتوحة)</span></span>
            </label>
            <div className="space-y-1.5 md:col-span-2"><Label>ملاحظة</Label><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="اختياري" /></div>
            <div className="flex justify-end md:col-span-2">
              <Button onClick={() => void runPreview()} disabled={loading || !retainedId}>
                {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}فحص السنة<ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && preview && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="الإيرادات" value={money(preview.revenue)} tone="emerald" />
              <Stat label="المصروفات" value={money(preview.expenses)} tone="rose" />
              <Stat label={preview.net_result >= 0 ? "صافي الربح" : "صافي الخسارة"} value={money(Math.abs(preview.net_result))} tone={preview.net_result >= 0 ? "indigo" : "amber"} />
            </div>
            <div className="space-y-2">
              {preview.checks.map((check) => (
                <div key={check.key} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${check.level === "error" ? "border-rose-200 bg-rose-50" : check.level === "warning" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50/60"}`}>
                  {check.level === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : check.level === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                  <div><div className="font-semibold">{check.title}</div>{check.detail && <div className="text-xs text-slate-600">{check.detail}</div>}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              أرصدة الميزانية المنقولة للسنة الجديدة: <b>{preview.balance_sheet.accounts}</b> حساب — مدين <b className="font-mono">{money(preview.balance_sheet.debit)}</b> / دائن <b className="font-mono">{money(preview.balance_sheet.credit)}</b> (تنتقل تلقائياً؛ لا حاجة لقيد افتتاحي)
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
              <Button onClick={() => setStep(2)} disabled={!preview.can_close}>
                {errors ? `${errors} مانع` : warnings ? `متابعة رغم ${warnings} تنبيه` : "متابعة"}<ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && preview && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-muted-foreground">قيد إقفال لكل فرع بتاريخ <b className="font-mono">{preview.to}</b> بعملة الأساس: الحسابات المدينة (مصروفات) تُقفل دائناً والدائنة (إيرادات) مديناً، والفرق لحساب الأرباح المدورة.</p>
            {preview.branches.map((bucket) => (
              <div key={bucket.branch_id} className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-sm">
                  <b>{bucket.branch_name}</b>
                  <span>{bucket.net <= 0 ? "ربح" : "خسارة"}: <b className="font-mono">{money(Math.abs(bucket.net))}</b></span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white text-xs text-slate-500"><tr><th className="p-2 text-right">الحساب</th><th className="p-2 text-left">مدين</th><th className="p-2 text-left">دائن</th></tr></thead>
                    <tbody>
                      {bucket.lines.map((line) => (
                        <tr key={line.account_id} className="border-t">
                          <td className="p-2"><span className="font-mono text-xs text-muted-foreground">{line.code}</span> {line.name}</td>
                          <td className="p-2 text-left font-mono">{line.balance < 0 ? money(-line.balance) : ""}</td>
                          <td className="p-2 text-left font-mono">{line.balance > 0 ? money(line.balance) : ""}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-indigo-50/60 font-semibold">
                        <td className="p-2">الأرباح المدورة</td>
                        <td className="p-2 text-left font-mono">{bucket.net > 0 ? money(bucket.net) : ""}</td>
                        <td className="p-2 text-left font-mono">{bucket.net < 0 ? money(-bucket.net) : ""}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
              <Button onClick={() => void execute()} disabled={running} className="bg-indigo-600 hover:bg-indigo-700">
                {running ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Lock className="ml-2 h-4 w-4" />}إقفال السنة {year}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <div className="text-lg font-bold">تم إقفال السنة المالية {year}</div>
            <div className="text-sm text-muted-foreground">
              {result.net_result >= 0 ? "صافي الربح" : "صافي الخسارة"} <b className="font-mono">{money(Math.abs(result.net_result))}</b> رُحّل لحساب الأرباح المدورة —
              القيود: {result.journals.map((journal) => `${journal.code} (${journal.branch_name})`).join("، ")}
            </div>
            <Button variant="outline" onClick={restart}>إقفال سنة أخرى</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b px-4 py-2.5 font-bold"><History className="h-4 w-4" />سجل الإقفالات</div>
          {closings.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لم تُقفل أي سنة بعد</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-right">السنة</th><th className="p-3 text-left">النتيجة</th><th className="p-3 text-right">الأرباح المدورة</th><th className="p-3 text-right">القيود</th><th className="p-3 text-right">بواسطة</th><th className="p-3 text-center">الحالة</th><th className="p-3" /></tr></thead>
                <tbody>
                  {closings.map((row) => {
                    const active = Number(row.status) !== 3
                    return (
                      <tr key={row.id} className={`border-t ${active ? "" : "text-slate-400"}`}>
                        <td className="p-3 font-mono font-bold">{row.fiscal_year}</td>
                        <td className={`p-3 text-left font-mono ${Number(row.net_result) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{Number(row.net_result) >= 0 ? "ربح " : "خسارة "}{money(Math.abs(Number(row.net_result)))}</td>
                        <td className="p-3">{row.retained_code} - {row.retained_name}</td>
                        <td className="p-3 font-mono text-xs">{row.journal_codes || "—"}</td>
                        <td className="p-3 text-xs">{row.created_by || "—"}<div className="text-muted-foreground">{String(row.created_at || "").slice(0, 10)}</div></td>
                        <td className="p-3 text-center">{active
                          ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">مقفلة</span>
                          : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">تم التراجع</span>}</td>
                        <td className="p-3 text-left">{active && <Button size="sm" variant="outline" className="text-rose-600" onClick={() => void reverse(row)}><Undo2 className="ml-1 h-3.5 w-3.5" />تراجع</Button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" | "indigo" | "amber" }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-50 text-amber-700" }
  return <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}><div className="text-xs">{label}</div><div className="font-mono text-xl font-bold">{value}</div></div>
}
