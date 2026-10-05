"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { FileBarChart, FileText, Layers, Loader2, Monitor, Palette, Printer, RotateCcw, Save, Search, Settings2, Smartphone } from "lucide-react"
import type { CompanyInfo } from "@/lib/voucher-print/document"
import { ReportPrintSettingsPanel } from "./report-print-settings"
import { invalidateVoucherPrintSettings, previewHtml, printVoucherWithSettings } from "@/lib/voucher-print/print"
import { samplePrintDocument } from "@/lib/voucher-print/samples"
import {
  DEFAULT_PRINT_SETTINGS, FAMILY_COLUMNS, PAPER_OPTIONS, normalizePrintSettings, paperDimensions,
  type VoucherFamily, type VoucherPrintSettings,
} from "@/lib/voucher-print/settings"

type VoucherTypeRow = { id: number; name: string; family: VoucherFamily; configured: boolean }
type Option<T = string> = { label: string; value: T }

const GENERAL_ID = 0
const REPORT_VIEW = -100
const GROUPS: { key: string; label: string; test: (name: string) => boolean }[] = [
  { key: "sales", label: "المبيعات", test: name => /مبيعات|البيع/.test(name) },
  { key: "purchases", label: "المشتريات", test: name => /مشتريات/.test(name) },
  { key: "inventory", label: "المخزون", test: name => /بضاعة|داخلية|استعمال|مخزون|جرد/.test(name) },
  { key: "finance", label: "المالية", test: () => true },
]
const ORIENTATION_OPTIONS: Option<VoucherPrintSettings["orientation"]>[] = [{ label: "عمودي", value: "portrait" }, { label: "أفقي", value: "landscape" }]
const METHOD_OPTIONS: Option<VoucherPrintSettings["print_method"]>[] = [
  { label: "تلقائي: خدمة الطباعة ثم المتصفح", value: "auto" },
  { label: "خدمة الطباعة فقط (طباعة مباشرة)", value: "service" },
  { label: "المتصفح دائماً", value: "browser" },
]
const TEMPLATE_OPTIONS: Option<VoucherPrintSettings["template"]>[] = [{ label: "عصري", value: "modern" }, { label: "كلاسيكي بإطارات", value: "classic" }, { label: "بسيط", value: "minimal" }]
const FONT_OPTIONS: Option[] = ["Cairo", "Tajawal", "Arial", "Tahoma", "Segoe UI", "Times New Roman"].map(font => ({ label: font, value: font }))
const ACCENTS = ["#0f766e", "#1d4ed8", "#4338ca", "#be123c", "#b45309", "#334155", "#111827"]
const emptyCompany: CompanyInfo = { name: "اسم الشركة", address: "", phone: "", email: "", taxNumber: "", logo: "" }

const settingsKey = (settings: VoucherPrintSettings) => JSON.stringify(settings)

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-1.5", className)}><Label htmlFor={htmlFor} className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</Label>{children}{hint && <p className="text-[11px] leading-5 text-slate-500">{hint}</p>}</div>
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900">
    <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-[11px] text-slate-500">{hint}</span>}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
}

function Dropdown<T extends string>({ id, value, options, onChange, disabled }: { id: string; value: T; options: Option<T>[]; onChange: (value: T) => void; disabled?: boolean }) {
  return <PrimeDropdown inputId={id} value={value} options={options} optionLabel="label" optionValue="value" disabled={disabled}
    className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo="self"
    onChange={(event: any) => { if (event.value !== null && event.value !== undefined) onChange(event.value as T) }} />
}

function NumberInput({ id, value, onChange, min, max, step = 1 }: { id: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <Input id={id} type="number" dir="ltr" className="text-right" min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value === "" ? 0 : Number(event.target.value))} />
}

export default function PrintSettings() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [types, setTypes] = useState<VoucherTypeRow[]>([])
  const [company, setCompany] = useState<CompanyInfo>(emptyCompany)
  const [stored, setStored] = useState<Record<number, VoucherPrintSettings>>({})
  const [selectedId, setSelectedId] = useState(GENERAL_ID)
  const [form, setForm] = useState<VoucherPrintSettings>(DEFAULT_PRINT_SETTINGS)
  const [baseline, setBaseline] = useState(settingsKey(DEFAULT_PRINT_SETTINGS))
  const [search, setSearch] = useState("")
  const [reportMode, setReportMode] = useState(false)
  const [tab, setTab] = useState("paper")
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [previewWidth, setPreviewWidth] = useState(480)
  const previewRef = useRef<HTMLDivElement | null>(null)

  const storedRef = useRef(stored)
  storedRef.current = stored
  const effectiveFor = (id: number) => storedRef.current[id] ?? storedRef.current[GENERAL_ID] ?? DEFAULT_PRINT_SETTINGS

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/settings/voucher-print", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل إعدادات الطباعة")
      const next: Record<number, VoucherPrintSettings> = { [GENERAL_ID]: normalizePrintSettings(data.defaults) }
      for (const [id, value] of Object.entries(data.overrides || {})) next[Number(id)] = normalizePrintSettings(value as VoucherPrintSettings)
      setStored(next)
      setTypes(data.voucherTypes || [])
      setCompany({ ...emptyCompany, ...(data.company || {}), name: data.company?.name || emptyCompany.name })
      return next
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذر تحميل إعدادات الطباعة", variant: "destructive" })
      return null
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load().then(next => {
      if (!next) return
      const initial = next[GENERAL_ID]
      setForm(initial)
      setBaseline(settingsKey(initial))
    })
  }, [load])

  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setPreviewWidth(element.clientWidth))
    observer.observe(element)
    setPreviewWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [loading, reportMode])

  const dirty = settingsKey(form) !== baseline
  const selectedType = types.find(row => row.id === selectedId)
  const family: VoucherFamily = selectedType?.family ?? "items"
  const isOverride = selectedId !== GENERAL_ID && Boolean(types.find(row => row.id === selectedId)?.configured)
  const update = (patch: Partial<VoucherPrintSettings>) => setForm(current => ({ ...current, ...patch }))

  const select = (id: number) => {
    const next = effectiveFor(id)
    setSelectedId(id)
    setForm(next)
    setBaseline(settingsKey(next))
  }
  const goTo = (id: number) => {
    if (id === REPORT_VIEW) { select(selectedId); setReportMode(true) } else select(id)
  }
  const requestSelect = (id: number) => {
    if (reportMode) { setReportMode(false); if (id !== selectedId) select(id); return }
    if (id === selectedId) return
    if (dirty) setPendingId(id)
    else select(id)
  }

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/settings/voucher-print", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucher_type_id: selectedId, settings: form }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الإعدادات")
      const saved = normalizePrintSettings(data.settings)
      storedRef.current = { ...storedRef.current, [selectedId]: saved }
      setStored(storedRef.current)
      setTypes(current => current.map(row => row.id === selectedId ? { ...row, configured: true } : row))
      setForm(saved)
      setBaseline(settingsKey(saved))
      invalidateVoucherPrintSettings()
      toast({ title: "تم الحفظ", description: selectedId === GENERAL_ID ? "تم حفظ الإعدادات العامة" : `تم حفظ إعدادات ${selectedType?.name || "السند"}` })
      return true
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذر حفظ الإعدادات", variant: "destructive" })
      return false
    } finally {
      setSaving(false)
    }
  }

  const resetToGeneral = async () => {
    if (selectedId === GENERAL_ID) return
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/voucher-print?voucher_type_id=${selectedId}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذرت إعادة الضبط")
      const next = { ...storedRef.current }
      delete next[selectedId]
      storedRef.current = next
      setStored(next)
      setTypes(current => current.map(row => row.id === selectedId ? { ...row, configured: false } : row))
      const general = next[GENERAL_ID] ?? DEFAULT_PRINT_SETTINGS
      setForm(general)
      setBaseline(settingsKey(general))
      invalidateVoucherPrintSettings()
      toast({ title: "تمت إعادة الضبط", description: "يستخدم هذا السند الإعدادات العامة الآن" })
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذرت إعادة الضبط", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const sample = useMemo(() => samplePrintDocument(selectedId, selectedType?.name || "فاتورة مبيعات", family), [selectedId, selectedType?.name, family])

  const testPrint = async () => {
    setTesting(true)
    try {
      const result = await printVoucherWithSettings(sample, normalizePrintSettings(form), company)
      toast({
        title: result.method === "service" ? "أُرسلت إلى الطابعة الافتراضية" : "فُتحت نافذة طباعة المتصفح",
        description: result.warning ? `تعذرت خدمة الطباعة: ${result.warning}` : undefined,
      })
    } catch (error) {
      toast({ title: "تعذرت الطباعة", description: error instanceof Error ? error.message : "تأكد من تشغيل خدمة الطباعة", variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }

  const paper = paperDimensions(normalizePrintSettings(form))
  const previewScale = Math.min(1, Math.max(0.3, (previewWidth - 24) / ((paper.widthMm + 12) * 3.7795)))
  const preview = useMemo(() => previewHtml(sample, normalizePrintSettings(form), company, previewScale), [sample, form, company, previewScale])

  const filteredGroups = useMemo(() => {
    const term = search.trim()
    const assigned = new Set<number>()
    return GROUPS.map(group => {
      const rows = types.filter(row => !assigned.has(row.id) && group.test(row.name))
      rows.forEach(row => assigned.add(row.id))
      return { ...group, rows: term ? rows.filter(row => row.name.includes(term)) : rows }
    }).filter(group => group.rows.length)
  }, [types, search])

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center" dir="rtl"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
  }

  const columns = FAMILY_COLUMNS[family]

  return <div dir="rtl" className="flex min-h-full flex-col gap-4 bg-slate-50 p-3 sm:p-5 dark:bg-slate-950">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-teal-900 px-5 py-4 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Printer className="h-6 w-6" /></span>
        <div>
          <h1 className="text-xl font-black">إعدادات طباعة السندات</h1>
          <p className="text-xs text-slate-300">حجم الورق وطريقة الطباعة ومحتوى النموذج لكل نوع سند</p>
        </div>
      </div>
      {!reportMode && <div className="flex flex-wrap gap-2">
        {isOverride && <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20" onClick={() => void resetToGeneral()} disabled={saving}><RotateCcw className="ml-2 h-4 w-4" />استخدام الإعدادات العامة</Button>}
        <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20" onClick={() => void testPrint()} disabled={testing}>{testing ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Printer className="ml-2 h-4 w-4" />}طباعة تجريبية</Button>
        <Button className="bg-teal-500 font-bold text-white hover:bg-teal-400" onClick={() => void save()} disabled={saving || !dirty}>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}حفظ</Button>
      </div>}
    </header>

    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_minmax(340px,0.9fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={() => requestSelect(GENERAL_ID)} className={cn("flex items-center gap-3 rounded-xl border p-3 text-right transition", selectedId === GENERAL_ID && !reportMode ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")}>
          <Settings2 className="h-5 w-5 shrink-0 text-teal-600" />
          <span><b className="block text-sm">الإعدادات العامة</b><small className="text-[11px] text-slate-500">تُطبَّق على كل سند بلا إعدادات خاصة</small></span>
        </button>
        <button type="button" onClick={() => { if (dirty && !reportMode) setPendingId(REPORT_VIEW); else setReportMode(true) }} className={cn("flex items-center gap-3 rounded-xl border p-3 text-right transition", reportMode ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")}>
          <FileBarChart className="h-5 w-5 shrink-0 text-indigo-600" />
          <span><b className="block text-sm">طباعة التقارير</b><small className="text-[11px] text-slate-500">الترويسة والتذييل والورق لكل التقارير</small></span>
        </button>
        <div className="relative"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-9 pr-9 text-sm" placeholder="بحث عن نوع سند…" /></div>
        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto lg:max-h-[calc(100dvh-260px)]" aria-label="أنواع السندات">
          {filteredGroups.map(group => <div key={group.key}>
            <p className="mb-1 px-1 text-[11px] font-black text-slate-400">{group.label}</p>
            <div className="space-y-1">{group.rows.map(row => <button key={row.id} type="button" onClick={() => requestSelect(row.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-right text-sm transition", selectedId === row.id && !reportMode ? "bg-slate-900 font-bold text-white dark:bg-teal-700" : "hover:bg-slate-100 dark:hover:bg-slate-800")}>
              <span className="truncate">{row.name}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", row.configured ? "bg-teal-100 text-teal-700" : selectedId === row.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>{row.configured ? "مخصص" : "عام"}</span>
            </button>)}</div>
          </div>)}
          {!filteredGroups.length && <p className="p-4 text-center text-sm text-slate-500">لا توجد أنواع مطابقة</p>}
        </nav>
      </aside>

      {reportMode ? <ReportPrintSettingsPanel /> : <>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black">{selectedId === GENERAL_ID ? "الإعدادات العامة" : selectedType?.name}</h2>
          {selectedId !== GENERAL_ID && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", isOverride ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700")}>{isOverride ? "إعدادات خاصة" : "يستخدم الإعدادات العامة — الحفظ ينشئ إعدادات خاصة"}</span>}
          {dirty && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">تعديلات غير محفوظة</span>}
        </div>
        <Tabs value={tab} onValueChange={setTab} dir="rtl" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <TabsTrigger value="paper" className="gap-1.5"><FileText className="h-4 w-4" />الورق والطابعة</TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5"><Palette className="h-4 w-4" />التصميم</TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5"><Layers className="h-4 w-4" />المحتوى</TabsTrigger>
            <TabsTrigger value="header" className="gap-1.5"><Settings2 className="h-4 w-4" />الترويسة والتذييل</TabsTrigger>
          </TabsList>

          <TabsContent value="paper" className="mt-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="حجم الورق" htmlFor="print-paper"><Dropdown id="print-paper" value={form.paper_size} options={PAPER_OPTIONS} onChange={value => update({ paper_size: value })} /></Field>
              <Field label="اتجاه الصفحة" htmlFor="print-orientation"><Dropdown id="print-orientation" value={form.orientation} options={ORIENTATION_OPTIONS} onChange={value => update({ orientation: value })} disabled={paper.receipt} /></Field>
              {form.paper_size === "Custom" && <>
                <Field label="العرض (مم)" htmlFor="print-width"><NumberInput id="print-width" value={form.custom_width_mm} min={40} max={600} onChange={value => update({ custom_width_mm: value })} /></Field>
                <Field label="الطول (مم)" htmlFor="print-height"><NumberInput id="print-height" value={form.custom_height_mm} min={40} max={1200} onChange={value => update({ custom_height_mm: value })} /></Field>
              </>}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">الهوامش (مم)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([["margin_top_mm", "أعلى"], ["margin_bottom_mm", "أسفل"], ["margin_right_mm", "يمين"], ["margin_left_mm", "يسار"]] as const).map(([key, label]) =>
                  <Field key={key} label={label} htmlFor={`print-${key}`}><NumberInput id={`print-${key}`} value={form[key]} min={0} max={60} onChange={value => update({ [key]: value })} /></Field>)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="طريقة الطباعة" htmlFor="print-method" className="sm:col-span-2"><Dropdown id="print-method" value={form.print_method} options={METHOD_OPTIONS} onChange={value => update({ print_method: value })} /></Field>
                <Field label="اسم الطابعة" htmlFor="print-printer" hint="اتركه فارغاً لاستخدام الطابعة الافتراضية في خدمة الطباعة أو في ويندوز"><Input id="print-printer" dir="ltr" className="text-right" value={form.printer_name} onChange={event => update({ printer_name: event.target.value })} placeholder="الطابعة الافتراضية" /></Field>
                <Field label="عدد النسخ" htmlFor="print-copies"><NumberInput id="print-copies" value={form.copies} min={1} max={10} onChange={value => update({ copies: value })} /></Field>
                <Field label="عناوين النسخ" htmlFor="print-copy-labels" hint="مفصولة بفاصلة، مثال: الأصل, نسخة العميل" className="sm:col-span-2"><Input id="print-copy-labels" value={form.copy_labels} onChange={event => update({ copy_labels: event.target.value })} placeholder="الأصل, نسخة" /></Field>
              </div>
              <div className="mt-4 grid gap-2 text-[11px] leading-5 text-slate-600 sm:grid-cols-2 dark:text-slate-400">
                <p className="flex gap-2"><Monitor className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />على ويندوز تُرسل الطباعة مباشرة إلى الطابعة عبر خدمة الطباعة (CashierWinService) بدون نافذة.</p>
                <p className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />على أندرويد وiOS، أو إذا لم تعمل الخدمة، تُفتح طباعة المتصفح بنفس المقاس.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="design" className="mt-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="النموذج" htmlFor="print-template"><Dropdown id="print-template" value={form.template} options={TEMPLATE_OPTIONS} onChange={value => update({ template: value })} /></Field>
              <Field label="الخط" htmlFor="print-font"><Dropdown id="print-font" value={form.font_family} options={FONT_OPTIONS} onChange={value => update({ font_family: value })} /></Field>
              <Field label="حجم الخط" htmlFor="print-font-size"><NumberInput id="print-font-size" value={form.font_size} min={7} max={20} onChange={value => update({ font_size: value })} /></Field>
            </div>
            <Field label="اللون الرئيسي" hint="يظهر في المعاينة وطباعة المتصفح؛ الطباعة المباشرة بالأبيض والأسود">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map(color => <button key={color} type="button" aria-label={color} onClick={() => update({ accent_color: color })} className={cn("h-8 w-8 rounded-full border-2 transition", form.accent_color === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent")} style={{ background: color }} />)}
                <input type="color" aria-label="لون مخصص" value={form.accent_color} onChange={event => update({ accent_color: event.target.value })} className="h-8 w-12 cursor-pointer rounded border border-slate-200 bg-transparent" />
              </div>
            </Field>
          </TabsContent>

          <TabsContent value="content" className="mt-0 space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label="بيانات رأس السند" hint="العميل، المستودع، العملة…" checked={form.show_fields} onChange={value => update({ show_fields: value })} />
              <Toggle label="ترقيم الأسطر" checked={form.show_row_numbers} onChange={value => update({ show_row_numbers: value })} />
              <Toggle label="المجاميع" checked={form.show_totals} onChange={value => update({ show_totals: value })} />
              <Toggle label="المبلغ كتابةً" checked={form.show_amount_in_words} onChange={value => update({ show_amount_in_words: value })} />
              <Toggle label="الملاحظات" checked={form.show_notes} onChange={value => update({ show_notes: value })} />
              <Toggle label="باركود رقم السند" checked={form.show_barcode} onChange={value => update({ show_barcode: value })} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">أعمدة الجدول{selectedId === GENERAL_ID ? " (حسب نوع السند)" : ""}</p>
              {(selectedId === GENERAL_ID ? (Object.keys(FAMILY_COLUMNS) as VoucherFamily[]) : [family]).map(groupFamily => <div key={groupFamily} className="mb-3">
                {selectedId === GENERAL_ID && <p className="mb-1.5 text-[11px] font-bold text-slate-400">{groupFamily === "items" ? "سندات الأصناف" : groupFamily === "journal" ? "القيود والإشعارات" : "سندات القبض والصرف"}</p>}
                <div className="grid gap-2 sm:grid-cols-3">{FAMILY_COLUMNS[groupFamily].map(column => {
                  const checked = !form.hidden_columns.includes(column.key)
                  return <label key={`${groupFamily}-${column.key}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                    <Checkbox checked={checked} onCheckedChange={value => update({ hidden_columns: value ? form.hidden_columns.filter(key => key !== column.key) : [...new Set([...form.hidden_columns, column.key])] })} />{column.label}
                  </label>
                })}</div>
              </div>)}
              {selectedId !== GENERAL_ID && !columns.length && <p className="text-sm text-slate-500">لا توجد أعمدة لهذا السند</p>}
            </div>
          </TabsContent>

          <TabsContent value="header" className="mt-0 space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label="شعار الشركة" checked={form.show_logo} onChange={value => update({ show_logo: value })} />
              <Toggle label="بيانات الشركة" hint="العنوان، الهاتف، الرقم الضريبي" checked={form.show_company_info} onChange={value => update({ show_company_info: value })} />
            </div>
            <Field label="نص أسفل الترويسة" htmlFor="print-header-text"><Textarea id="print-header-text" rows={2} value={form.header_text} onChange={event => update({ header_text: event.target.value })} /></Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle label="خانات التوقيع" checked={form.show_signatures} onChange={value => update({ show_signatures: value })} />
              <Toggle label="التذييل" checked={form.show_footer} onChange={value => update({ show_footer: value })} />
            </div>
            {form.show_signatures && <Field label="عناوين التوقيعات" htmlFor="print-signatures" hint="مفصولة بفاصلة"><Input id="print-signatures" value={form.signatures} onChange={event => update({ signatures: event.target.value })} /></Field>}
            {form.show_footer && <>
              <Field label="نص التذييل" htmlFor="print-footer-text"><Textarea id="print-footer-text" rows={2} value={form.footer_text} onChange={event => update({ footer_text: event.target.value })} placeholder="شكراً لتعاملكم معنا" /></Field>
              <div className="grid gap-2 sm:grid-cols-3">
                <Toggle label="تاريخ الطباعة" checked={form.show_print_date} onChange={value => update({ show_print_date: value })} />
                <Toggle label="اسم المستخدم" checked={form.show_printed_by} onChange={value => update({ show_printed_by: value })} />
                <Toggle label="أرقام الصفحات" checked={form.show_page_numbers} onChange={value => update({ show_page_numbers: value })} />
              </div>
            </>}
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 lg:col-span-2 xl:col-span-1 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h3 className="text-sm font-black">معاينة</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="ltr">{Math.round(paper.widthMm)} × {paper.receipt ? "auto" : Math.round(paper.heightMm)} mm</span>
        </div>
        <div ref={previewRef} className="min-h-[520px] flex-1 overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
          <iframe title="معاينة الطباعة" srcDoc={preview} className="h-full min-h-[520px] w-full border-0" sandbox="allow-same-origin" />
        </div>
      </section>
      </>}
    </div>

    <ConfirmDialogYesNo
      visible={pendingId !== null}
      message="توجد تعديلات غير محفوظة، هل تريد حفظها؟"
      showBack
      onConfirm={async () => {
        const target = pendingId
        setPendingId(null)
        if (target !== null && await save()) goTo(target)
      }}
      onCancel={() => {
        const target = pendingId
        setPendingId(null)
        if (target !== null) goTo(target)
      }}
      onBack={() => setPendingId(null)}
    />
  </div>
}
