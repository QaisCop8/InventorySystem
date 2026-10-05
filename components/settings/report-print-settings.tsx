"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { FileText, ImagePlus, Loader2, PanelBottom, PanelTop, Printer, Save, Table2, Trash2 } from "lucide-react"
import type { CompanyInfo } from "@/lib/voucher-print/document"
import { PAPER_OPTIONS } from "@/lib/voucher-print/settings"
import {
  DEFAULT_REPORT_SETTINGS, MAX_HEADER_IMAGE_CHARS, normalizeReportSettings, reportPaper, type ReportPrintSettings,
} from "@/lib/voucher-print/report-settings"
import { invalidateReportPrintSettings, printReportSample, renderReportHtml, sampleReportInput } from "@/lib/voucher-print/report-print"

type Option<T = string> = { label: string; value: T }
const ORIENTATIONS: Option<ReportPrintSettings["orientation"]>[] = [{ label: "عمودي", value: "portrait" }, { label: "أفقي", value: "landscape" }]
const HEADER_TYPES: Option<ReportPrintSettings["header_type"]>[] = [{ label: "نص (بيانات الشركة)", value: "text" }, { label: "صورة ترويسة", value: "image" }]
const UNDERLINES: Option<ReportPrintSettings["header_underline"]>[] = [{ label: "بدون", value: "none" }, { label: "خط مفرد", value: "single" }, { label: "خط مزدوج", value: "double" }, { label: "خط عريض ملوّن", value: "thick" }]
const FONTS: Option[] = ["Cairo", "Tajawal", "Arial", "Tahoma", "Segoe UI", "Times New Roman"].map(font => ({ label: font, value: font }))
const ACCENTS = ["#0f766e", "#1d4ed8", "#4338ca", "#be123c", "#b45309", "#334155", "#111827"]
const emptyCompany: CompanyInfo = { name: "اسم الشركة", address: "", phone: "", email: "", taxNumber: "", logo: "" }

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-1.5", className)}><Label htmlFor={htmlFor} className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</Label>{children}{hint && <p className="text-[11px] leading-5 text-slate-500">{hint}</p>}</div>
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900">
    <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-[11px] text-slate-500">{hint}</span>}</span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
}

function Dropdown<T extends string>({ id, value, options, onChange, disabled }: { id: string; value: T; options: Option<T>[]; onChange: (value: T) => void; disabled?: boolean }) {
  return <PrimeDropdown inputId={id} value={value} options={options} optionLabel="label" optionValue="value" disabled={disabled}
    className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel" appendTo="self"
    onChange={(event: any) => { if (event.value != null) onChange(event.value as T) }} />
}

function NumberInput({ id, value, onChange, min, max, step = 1 }: { id: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <Input id={id} type="number" dir="ltr" className="text-right" min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value === "" ? 0 : Number(event.target.value))} />
}

export function ReportPrintSettingsPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<ReportPrintSettings>(DEFAULT_REPORT_SETTINGS)
  const [baseline, setBaseline] = useState(JSON.stringify(DEFAULT_REPORT_SETTINGS))
  const [company, setCompany] = useState<CompanyInfo>(emptyCompany)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState("paper")
  const [previewWidth, setPreviewWidth] = useState(480)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const imageInput = useRef<HTMLInputElement | null>(null)
  const update = (patch: Partial<ReportPrintSettings>) => setForm(current => ({ ...current, ...patch }))
  const dirty = JSON.stringify(form) !== baseline

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  useEffect(() => {
    let active = true
    fetch("/api/settings/voucher-print?scope=report", { cache: "no-store" })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر التحميل")
        if (!active) return
        const settings = normalizeReportSettings(data.settings)
        setForm(settings)
        setBaseline(JSON.stringify(settings))
        setCompany({ ...emptyCompany, ...(data.company || {}), name: data.company?.name || emptyCompany.name })
      })
      .catch(error => toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذر تحميل إعدادات التقارير", variant: "destructive" }))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [toast])

  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setPreviewWidth(element.clientWidth))
    observer.observe(element)
    setPreviewWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [loading])

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/settings/voucher-print", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "report", settings: form }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ")
      const saved = normalizeReportSettings(data.settings)
      setForm(saved)
      setBaseline(JSON.stringify(saved))
      invalidateReportPrintSettings()
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات طباعة التقارير" })
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "تعذر الحفظ", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const pickImage = (file: File) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast({ title: "صيغة غير مدعومة", description: "PNG أو JPG أو WEBP", variant: "destructive" }); return }
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result || "")
      if (value.length > MAX_HEADER_IMAGE_CHARS) { toast({ title: "الصورة كبيرة", description: "الحد الأقصى نحو 1 ميجابايت", variant: "destructive" }); return }
      update({ header_image: value, header_type: "image" })
    }
    reader.readAsDataURL(file)
    if (imageInput.current) imageInput.current.value = ""
  }

  const normalized = useMemo(() => normalizeReportSettings(form), [form])
  const paper = reportPaper(normalized, normalized.orientation === "landscape")
  const scale = Math.min(1, Math.max(0.3, (previewWidth - 24) / ((paper.widthMm + 12) * (96 / 25.4))))
  const preview = useMemo(() => renderReportHtml(sampleReportInput(), normalized, company, { landscape: normalized.orientation === "landscape", preview: true, previewScale: scale, printedBy: "المستخدم" }), [normalized, company, scale])

  if (loading) return <div className="grid min-h-[300px] place-items-center lg:col-span-2"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>

  return <>
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black">إعدادات طباعة التقارير</h2>
          {dirty && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">تعديلات غير محفوظة</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => printReportSample(normalized, company)}><Printer className="ml-1.5 h-4 w-4" />طباعة تجريبية</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={() => void save()} disabled={saving || !dirty}>{saving ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Save className="ml-1.5 h-4 w-4" />}حفظ</Button>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} dir="rtl" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <TabsTrigger value="paper" className="gap-1.5"><FileText className="h-4 w-4" />الورق والهوامش</TabsTrigger>
          <TabsTrigger value="header" className="gap-1.5"><PanelTop className="h-4 w-4" />الترويسة</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Table2 className="h-4 w-4" />البيانات</TabsTrigger>
          <TabsTrigger value="footer" className="gap-1.5"><PanelBottom className="h-4 w-4" />التذييل</TabsTrigger>
        </TabsList>

        <TabsContent value="paper" className="mt-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="حجم الورق" htmlFor="rp-paper"><Dropdown id="rp-paper" value={form.paper_size} options={PAPER_OPTIONS} onChange={value => update({ paper_size: value })} /></Field>
            <Field label="الاتجاه" htmlFor="rp-orientation"><Dropdown id="rp-orientation" value={form.orientation} options={ORIENTATIONS} onChange={value => update({ orientation: value })} /></Field>
            {form.paper_size === "Custom" && <>
              <Field label="عرض الورقة (مم)" htmlFor="rp-w"><NumberInput id="rp-w" value={form.custom_width_mm} onChange={value => update({ custom_width_mm: value })} /></Field>
              <Field label="طول الورقة (مم)" htmlFor="rp-h"><NumberInput id="rp-h" value={form.custom_height_mm} onChange={value => update({ custom_height_mm: value })} /></Field>
            </>}
          </div>
          <Toggle label="قلب الورقة عرضياً تلقائياً" hint="إذا كان جدول التقرير أعرض من الصفحة الطولية" checked={form.auto_landscape} onChange={value => update({ auto_landscape: value })} />
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600">الهوامش (مم)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([["margin_top_mm", "أعلى"], ["margin_bottom_mm", "أسفل"], ["margin_right_mm", "يمين"], ["margin_left_mm", "يسار"]] as const).map(([key, label]) =>
                <Field key={key} label={label} htmlFor={`rp-${key}`}><NumberInput id={`rp-${key}`} value={form[key]} min={0} max={60} onChange={value => update({ [key]: value })} /></Field>)}
            </div>
          </div>
          <Toggle label="إطار محيط بالصفحة" checked={form.border_frame} onChange={value => update({ border_frame: value })} />
        </TabsContent>

        <TabsContent value="header" className="mt-0 space-y-4">
          <Toggle label="إظهار الترويسة" checked={form.show_header} onChange={value => update({ show_header: value })} />
          {form.show_header && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نوع الترويسة" htmlFor="rp-header-type"><Dropdown id="rp-header-type" value={form.header_type} options={HEADER_TYPES} onChange={value => update({ header_type: value })} /></Field>
              <Field label="تسطير أسفل الترويسة" htmlFor="rp-underline"><Dropdown id="rp-underline" value={form.header_underline} options={UNDERLINES} onChange={value => update({ header_underline: value })} /></Field>
            </div>
            {form.header_type === "image" ? <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) pickImage(file) }} />
              {form.header_image ? <img src={form.header_image} alt="صورة الترويسة" className="max-h-28 w-full rounded-lg bg-slate-50 object-contain" /> : <p className="text-sm text-slate-500">ارفع صورة ترويسة كاملة (شعار وبيانات الشركة) بعرض الصفحة.</p>}
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => imageInput.current?.click()}><ImagePlus className="ml-1.5 h-4 w-4" />{form.header_image ? "تغيير الصورة" : "رفع صورة"}</Button>
                {form.header_image && <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={() => update({ header_image: "" })}><Trash2 className="ml-1.5 h-4 w-4" />حذف</Button>}
                <Field label="ارتفاع الصورة (مم)" htmlFor="rp-img-h" className="w-40"><NumberInput id="rp-img-h" value={form.header_image_height_mm} min={8} max={120} onChange={value => update({ header_image_height_mm: value })} /></Field>
              </div>
            </div> : <div className="grid gap-3 sm:grid-cols-2">
              <Toggle label="شعار الشركة" checked={form.show_logo} onChange={value => update({ show_logo: value })} />
              <div className="grid grid-cols-[1fr_96px] items-end gap-2"><Toggle label="اسم الشركة" checked={form.show_company_name} onChange={value => update({ show_company_name: value })} /><Field label="حجم الخط" htmlFor="rp-name-size"><NumberInput id="rp-name-size" value={form.company_name_font_size} min={8} max={40} onChange={value => update({ company_name_font_size: value })} /></Field></div>
              <div className="grid grid-cols-[1fr_96px] items-end gap-2"><Toggle label="عنوان الشركة" hint="العنوان والهاتف والبريد" checked={form.show_company_address} onChange={value => update({ show_company_address: value })} /><Field label="حجم الخط" htmlFor="rp-address-size"><NumberInput id="rp-address-size" value={form.company_address_font_size} min={6} max={24} onChange={value => update({ company_address_font_size: value })} /></Field></div>
              <div className="grid grid-cols-[1fr_96px] items-end gap-2"><Toggle label="المشتغل المرخص" hint="الرقم الضريبي" checked={form.show_tax_number} onChange={value => update({ show_tax_number: value })} /><Field label="حجم الخط" htmlFor="rp-tax-size"><NumberInput id="rp-tax-size" value={form.tax_number_font_size} min={6} max={24} onChange={value => update({ tax_number_font_size: value })} /></Field></div>
            </div>}
            <Field label="نص إضافي أسفل الترويسة" htmlFor="rp-header-text"><Textarea id="rp-header-text" rows={2} value={form.header_text} onChange={event => update({ header_text: event.target.value })} /></Field>
          </>}
          <Toggle label="عنوان التقرير والفترة" checked={form.show_report_title} onChange={value => update({ show_report_title: value })} />
        </TabsContent>

        <TabsContent value="data" className="mt-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="الخط" htmlFor="rp-font"><Dropdown id="rp-font" value={form.font_family} options={FONTS} onChange={value => update({ font_family: value })} /></Field>
            <Field label="حجم خط البيانات" htmlFor="rp-data-size"><NumberInput id="rp-data-size" value={form.data_font_size} min={6} max={18} onChange={value => update({ data_font_size: value })} /></Field>
            <Field label="هامش الخلية (مم)" htmlFor="rp-pad"><NumberInput id="rp-pad" value={form.cell_padding_mm} min={0} max={6} step={0.1} onChange={value => update({ cell_padding_mm: value })} /></Field>
          </div>
          <Field label="لون رأس الجدول">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map(color => <button key={color} type="button" aria-label={color} onClick={() => update({ accent_color: color })} className={cn("h-8 w-8 rounded-full border-2", form.accent_color === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent")} style={{ background: color }} />)}
              <input type="color" aria-label="لون مخصص" value={form.accent_color} onChange={event => update({ accent_color: event.target.value })} className="h-8 w-12 cursor-pointer rounded border border-slate-200 bg-transparent" />
            </div>
          </Field>
          <Toggle label="تظليل الأسطر بالتناوب" checked={form.zebra_rows} onChange={value => update({ zebra_rows: value })} />
        </TabsContent>

        <TabsContent value="footer" className="mt-0 space-y-4">
          <Toggle label="إظهار التذييل" hint="يتكرر أسفل كل صفحة" checked={form.show_footer} onChange={value => update({ show_footer: value })} />
          {form.show_footer && <>
            <Field label="نص التذييل" htmlFor="rp-footer"><Textarea id="rp-footer" rows={2} value={form.footer_text} onChange={event => update({ footer_text: event.target.value })} placeholder="مثال: تقرير داخلي — غير مخصص للتداول" /></Field>
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
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" dir="ltr">{Math.round(paper.widthMm)} × {Math.round(paper.heightMm)} mm</span>
      </div>
      <div ref={previewRef} className="min-h-[520px] flex-1 overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
        <iframe title="معاينة طباعة التقرير" srcDoc={preview} className="h-full min-h-[520px] w-full border-0" sandbox="allow-same-origin" />
      </div>
    </section>
  </>
}
