"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Copy, DatabaseZap, Download, KeyRound, Loader2, RefreshCw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { confirmYesNo } from "@/components/ui/confirm-host"

// أدوات ⇐ ترحيل من الشامل: إنشاء رمز تشغيل لمعالج الترحيل (برنامج ويندوز يقرأ قاعدة الشامل Pervasive عبر ODBC)
// ومتابعة تقدمه وسجل أخطائه. المنطق بالخادم: lib/shamel-migration/*، والبرنامج: launchers/shamel-migration.

type StepProgress = { received: number; created: number; updated: number; skipped: number; failed: number; done: boolean }
type Run = {
  id: number; mode: "definitions" | "full"; voucher_types: string[]; balance_date: string; status: string; current_step: string | null
  progress: Record<string, StepProgress>; message: string | null; created_at: string; last_seen_at: string | null; finished_at: string | null
  errors: number; warnings: number
}
type VoucherType = { prefix: string; title: string; kind: "sales" | "stock" | "finance" }
type LogRow = { id: number; step: string; level: string; ref: string | null; message: string; created_at: string }
type SummaryRow = { step: string; level: string; message: string; count: number; sample_ref: string | null }

const WIZARD_URL = "/downloads/NoonERP-ShamelMigration.exe"
const STEP_TITLES: Record<string, string> = {
  lookups: "القوائم المساعدة", currencies: "العملات", rates: "أسعار الصرف", stores: "المستودعات", cost_centers: "مراكز التكلفة",
  accounts: "دليل الحسابات", salesmen: "المندوبون", customers: "العملاء والموردون", banks: "البنوك", bank_branches: "فروع البنوك",
  bank_accounts: "الحسابات البنكية", item_groups: "مجموعات الأصناف", items: "الأصناف", item_barcodes: "باركودات الوحدات",
  account_balances: "الأرصدة الافتتاحية", stock_balances: "كميات أول المدة", voucher_items: "أسطر أصناف السندات", vouchers: "السندات",
}
const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "بانتظار تشغيل المعالج", className: "bg-amber-100 text-amber-800" },
  running: { label: "قيد الترحيل", className: "bg-sky-100 text-sky-800" },
  done: { label: "انتهى", className: "bg-emerald-100 text-emerald-800" },
  failed: { label: "توقف", className: "bg-red-100 text-red-800" },
  cancelled: { label: "ملغى", className: "bg-muted text-muted-foreground" },
}
const KIND_TITLES: Record<VoucherType["kind"], string> = { sales: "المبيعات والمشتريات", stock: "حركات المخزون", finance: "السندات المالية والقيود" }
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)
const formatTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—")

export default function DataMigration() {
  const [runs, setRuns] = useState<Run[]>([])
  const [voucherTypes, setVoucherTypes] = useState<VoucherType[]>([])
  const [mode, setMode] = useState<"definitions" | "full">("definitions")
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [balanceDate, setBalanceDate] = useState(today())
  const [token, setToken] = useState("")
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [log, setLog] = useState<LogRow[]>([])
  const [logLevel, setLogLevel] = useState<"error" | "warn" | "">("error")
  const [logStep, setLogStep] = useState("")
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [logTotal, setLogTotal] = useState(0)

  const current = runs[0] || null
  const active = current && (current.status === "pending" || current.status === "running") ? current : null

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/shamel-migration")
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || tr("تعذر تحميل بيانات الترحيل"))
      setRuns(data.runs || [])
      setVoucherTypes(data.voucherTypes || [])
      setError("")
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLog = useCallback(async (runId: number, level: string, step: string) => {
    const response = await fetch(`/api/shamel-migration?run_id=${runId}&level=${level}&step=${encodeURIComponent(step)}`)
    if (!response.ok) return
    const data = await response.json()
    setLog(data.log || [])
    setSummary(data.summary || [])
    setLogTotal(Number(data.total || 0))
  }, [])

  useEffect(() => { void load() }, [load])
  // التقدم يُحدَّث كل 5 ثوانٍ أثناء التشغيل
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [active, load])
  useEffect(() => { if (current) void loadLog(current.id, logLevel, logStep) }, [current?.id, current?.progress, logLevel, logStep, loadLog])
  useEffect(() => { setBalanceDate(mode === "full" ? firstOfYear() : today()) }, [mode])

  const create = async () => {
    if (mode === "full" && selectedTypes.size === 0) { setError(tr("اختر نوع سند واحداً على الأقل")); return }
    if (active && !(await confirmYesNo(tr("يوجد ترحيل غير مكتمل — إنشاء رمز جديد يلغي الرمز السابق. هل تريد المتابعة؟")))) return
    setCreating(true)
    setError("")
    try {
      const response = await fetch("/api/shamel-migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, voucher_types: [...selectedTypes], balance_date: balanceDate }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || tr("تعذر إنشاء رمز الترحيل"))
      setToken(data.token)
      setCopied(false)
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setCreating(false)
    }
  }

  const cancel = async () => {
    if (!active || !(await confirmYesNo(tr("إلغاء رمز الترحيل الحالي؟ المعالج سيتوقف عند الدفعة التالية، والسجلات المرحّلة تبقى.")))) return
    await fetch(`/api/shamel-migration?id=${active.id}`, { method: "DELETE" })
    setToken("")
    await load()
  }

  const copyToken = async () => {
    try { await navigator.clipboard.writeText(token); setCopied(true) } catch { setCopied(false) }
  }

  const toggleType = (prefix: string, checked: boolean) => setSelectedTypes((previous) => {
    const next = new Set(previous)
    if (checked) next.add(prefix); else next.delete(prefix)
    return next
  })

  const totals = useMemo(() => {
    const steps = Object.values(current?.progress || {})
    return {
      received: steps.reduce((sum, step) => sum + (step.received || 0), 0),
      created: steps.reduce((sum, step) => sum + (step.created || 0) + (step.updated || 0), 0),
      failed: steps.reduce((sum, step) => sum + (step.failed || 0), 0),
    }
  }, [current])

  const kinds = (["finance", "sales", "stock"] as const).map((kind) => ({ kind, types: voucherTypes.filter((type) => type.kind === kind) }))

  return (
    <div className="space-y-5 p-4" dir={appDir()}>
      <VoucherListHero
        title={tr("ترحيل البيانات من الشامل")}
        subtitle={tr("نقل التعريفات والأرصدة والسندات من قاعدة الشامل (Pervasive) إلى نون عبر معالج الترحيل")}
        icon={DatabaseZap}
        category={tr("أدوات")}
        actions={<Button variant="outline" onClick={() => void load()}><RefreshCw className="me-2 h-4 w-4" />{tr("تحديث")}</Button>}
      />

      <VoucherStats stats={[
        { label: tr("حالة آخر ترحيل"), value: current ? tr(STATUS[current.status]?.label || current.status) : "—" },
        { label: tr("سجلات مقروءة"), value: totals.received.toLocaleString("en-US") },
        { label: tr("سجلات أُنشئت/رُبطت"), value: totals.created.toLocaleString("en-US") },
        { label: tr("أخطاء"), value: (current?.errors || 0).toLocaleString("en-US") },
      ]} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-bold"><KeyRound className="h-5 w-5 text-emerald-600" />{tr("1) إعداد الترحيل وإنشاء الرمز")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["definitions", "التعريفات فقط", "الحسابات والعملاء والأصناف والقوائم + الأرصدة والكميات الحالية كأرصدة افتتاحية"], ["full", "التعريفات والسندات", "التعريفات + رصيد أول المدة + السندات المختارة كما هي بالشامل"]] as const).map(([value, title, hint]) => (
              <button key={value} type="button" onClick={() => setMode(value)}
                className={`rounded-xl border p-3 text-start transition ${mode === value ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900" : "hover:border-emerald-300"}`}>
                <div className="font-semibold">{tr(title)}</div>
                <div className="mt-1 text-xs text-muted-foreground">{tr(hint)}</div>
              </button>
            ))}
          </div>

          {mode === "full" && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">{tr("السندات المطلوب ترحيلها")}</Label>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="text-emerald-700 hover:underline" onClick={() => setSelectedTypes(new Set(voucherTypes.map((type) => type.prefix)))}>{tr("تحديد الكل")}</button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSelectedTypes(new Set())}>{tr("إلغاء التحديد")}</button>
                </div>
              </div>
              {kinds.map(({ kind, types }) => (
                <div key={kind}>
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{tr(KIND_TITLES[kind])}</div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {types.map((type) => (
                      <label key={type.prefix} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                        <Checkbox checked={selectedTypes.has(type.prefix)} onCheckedChange={(checked) => toggleType(type.prefix, checked === true)} />
                        <span>{tr(type.title)}</span>
                        <span className="text-xs text-muted-foreground" dir="ltr">({type.prefix})</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">{tr("الأرصدة الحالية تساوي رصيد أول المدة + السندات المرحّلة — نوع سند غير مختار لن يظهر أثره في الأرصدة والكميات.")}</p>
            </div>
          )}

          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="shamel-balance-date">{tr(mode === "full" ? "تاريخ رصيد أول المدة" : "تاريخ الأرصدة الافتتاحية")}</Label>
            <Input id="shamel-balance-date" type="date" value={balanceDate} onChange={(event) => setBalanceDate(event.target.value)} />
          </div>

          <div className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {tr("يُفضّل الترحيل إلى شركة جديدة فارغة. سجل موجود بنفس الرقم (حساب، عميل، صنف...) يُربط ولا يُكرَّر، وإعادة تشغيل الترحيل تكمل من حيث توقف دون تكرار. حدّد الحسابات الافتراضية (حساب الأب للعملاء والموردين) ودفاتر السندات قبل البدء.")}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void create()} disabled={creating || loading} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <KeyRound className="me-2 h-4 w-4" />}{tr("إنشاء رمز الترحيل")}
            </Button>
            {active && <Button variant="outline" onClick={() => void cancel()}><XCircle className="me-2 h-4 w-4" />{tr("إلغاء الرمز الحالي")}</Button>}
          </div>

          {token && (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="text-sm font-semibold">{tr("رمز الترحيل (يظهر مرة واحدة — صالح 3 أيام)")}</div>
              <div className="flex gap-2">
                <Input readOnly value={token} dir="ltr" className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
                <Button variant="outline" onClick={() => void copyToken()}>{copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</Button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-base font-bold"><Download className="h-5 w-5 text-emerald-600" />{tr("2) تشغيل معالج الترحيل على جهاز الشامل")}</h2>
          <ol className="list-decimal space-y-2 ps-5 text-sm leading-7">
            <li>{tr("نزّل المعالج وشغّله على جهاز يصل لقاعدة الشامل (ويندوز مع تعريف Pervasive ODBC):")} <a href={WIZARD_URL} download className="font-semibold text-emerald-700 hover:underline">NoonERP-ShamelMigration.exe</a></li>
            <li>{tr("اختر مصدر بيانات الشامل (ODBC DSN) — المستخدم وكلمة المرور الافتراضيان للشامل معبّآن.")}</li>
            <li>{tr("الصق رمز الترحيل واضغط «اختبار الاتصال» ثم «بدء الترحيل». أبقِ المعالج مفتوحاً حتى ينتهي.")}</li>
            <li>{tr("تابع التقدم والأخطاء هنا — الصفحة تتحدث تلقائياً.")}</li>
          </ol>

          {current && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[current.status]?.className || ""}`}>{tr(STATUS[current.status]?.label || current.status)}</span>
                <span className="text-muted-foreground">{tr(current.mode === "full" ? "التعريفات والسندات" : "التعريفات فقط")}</span>
                <span className="text-muted-foreground">· {tr("آخر اتصال")}: {formatTime(current.last_seen_at)}</span>
              </div>
              {current.message && <div className="text-xs text-muted-foreground">{current.message}</div>}
              <div className="max-h-80 overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground">
                    <tr><th className="p-2 text-start">{tr("الخطوة")}</th><th className="p-2">{tr("مقروء")}</th><th className="p-2">{tr("جديد")}</th><th className="p-2">{tr("مربوط")}</th><th className="p-2">{tr("أخطاء")}</th><th className="p-2" /></tr>
                  </thead>
                  <tbody>
                    {Object.entries(current.progress || {}).map(([key, step]) => (
                      <tr key={key} onClick={() => { setLogStep(key); setLogLevel(step.failed ? "error" : "") }} title={tr("عرض سجل هذه الخطوة")}
                        className={`cursor-pointer border-t hover:bg-muted/50 ${logStep === key ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                        <td className="p-2">{tr(STEP_TITLES[key] || key)}</td>
                        <td className="p-2 text-center tabular-nums">{step.received}</td>
                        <td className="p-2 text-center tabular-nums">{step.created}</td>
                        <td className="p-2 text-center tabular-nums">{step.updated}</td>
                        <td className={`p-2 text-center tabular-nums ${step.failed ? "font-semibold text-red-600" : ""}`}>{step.failed}</td>
                        <td className="p-2 text-center">{step.done ? <CheckCircle2 className="inline h-4 w-4 text-emerald-600" /> : current.current_step === key && active ? <Loader2 className="inline h-4 w-4 animate-spin text-sky-600" /> : null}</td>
                      </tr>
                    ))}
                    {!Object.keys(current.progress || {}).length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">{tr("لم يبدأ المعالج بعد")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {current && (
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">
              {tr("سجل الترحيل")}
              {logStep && <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{tr(STEP_TITLES[logStep] || logStep)}</span>}
              <span className="ms-2 text-xs font-normal text-muted-foreground">({logTotal.toLocaleString("en-US")})</span>
            </h2>
            <div className="flex flex-wrap gap-1">
              <select value={logStep} onChange={(event) => setLogStep(event.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">{tr("كل الخطوات")}</option>
                {Object.keys(current.progress || {}).map((key) => <option key={key} value={key}>{tr(STEP_TITLES[key] || key)}</option>)}
              </select>
              {([["error", "الأخطاء"], ["warn", "التنبيهات"], ["", "الكل"]] as const).map(([value, label]) => (
                <Button key={value} size="sm" variant={logLevel === value ? "default" : "outline"} onClick={() => setLogLevel(value)}>{tr(label)}</Button>
              ))}
            </div>
          </div>
          {summary.length > 0 && (
            <div className="rounded-xl border">
              <div className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">{tr("ملخص الأسباب")}</div>
              <table className="w-full text-sm">
                <tbody>
                  {summary.map((row, index) => (
                    <tr key={index} className="border-t first:border-t-0 align-top">
                      <td className="whitespace-nowrap p-2 text-muted-foreground">{tr(STEP_TITLES[row.step] || row.step)}</td>
                      <td className={`p-2 ${row.level === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{row.message}</td>
                      <td className="whitespace-nowrap p-2 font-mono text-xs text-muted-foreground" dir="ltr">{row.sample_ref || ""}</td>
                      <td className="whitespace-nowrap p-2 text-end font-semibold tabular-nums">{row.count.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="max-h-96 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground">
                <tr><th className="p-2 text-start">{tr("الخطوة")}</th><th className="p-2 text-start">{tr("رقم الشامل")}</th><th className="p-2 text-start">{tr("الرسالة")}</th></tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-2">{tr(STEP_TITLES[row.step] || row.step)}</td>
                    <td className="whitespace-nowrap p-2 font-mono text-xs" dir="ltr">{row.ref || "—"}</td>
                    <td className={`p-2 ${row.level === "error" ? "text-red-700 dark:text-red-400" : row.level === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}>{row.message}</td>
                  </tr>
                ))}
                {!log.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">{tr("لا توجد سجلات")}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
