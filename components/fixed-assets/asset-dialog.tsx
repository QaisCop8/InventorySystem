"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { cn } from "@/lib/utils"
import {
  ArrowLeftRight, CirclePause, CirclePlay, FileUp, Landmark, Loader2, PackagePlus, Rocket,
  Settings2, Trash2, TrendingDown, TrendingUp, XCircle,
} from "lucide-react"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { ACQUISITION_SOURCES, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/fixed-assets/constants"
import { DEPRECIATION_METHODS } from "@/lib/fixed-assets/depreciation"
import { ACTION_LABELS, AssetActionDialog, type AssetAction } from "./asset-actions"
import {
  api, DataTable, day, Field, money, n, NumberField, recordOptions, Select, StatusBadge, today, toOptions, transactionLabel,
  type Lookups, type Row,
} from "./shared"

const blankAsset = (categoryId?: number | null): Row => ({
  asset_no: "", name: "", category_id: categoryId ?? null, parent_asset_id: null, barcode: "", serial_number: "", model: "", manufacturer: "",
  warranty_end_date: "", description: "", notes: "", acquisition_source: "MANUAL", acquisition_date: today(), available_for_use_date: "",
  depreciation_start_date: "", original_cost: "", residual_value: "", opening_accumulated_depreciation: "", currency_id: null, foreign_cost: "",
  exchange_rate: "1", supplier_account_id: null, credit_account_id: null, post_acquisition_journal: true, useful_life_months: "",
  depreciation_method: "STRAIGHT_LINE", declining_rate: "", location_id: null, department_id: null, cost_center_id: null, custodian_employee_id: null,
  status: "DRAFT",
})

const FORM_KEYS = Object.keys(blankAsset())
const snapshot = (form: Row) => JSON.stringify(FORM_KEYS.map(key => form[key] ?? ""))
const fromRecord = (record: Row): Row => Object.fromEntries(FORM_KEYS.map(key => [key, record[key] == null ? (blankAsset()[key] ?? "") : typeof record[key] === "string" && /_date$/.test(key) ? day(record[key]) : record[key]]))

type Props = {
  open: boolean
  assetId: number | null
  assets: Row[]
  lookups: Lookups
  onClose: () => void
  onChanged: (message?: string) => void
  onNavigate: (id: number | null) => void
}

export function AssetDialog({ open, assetId, assets, lookups, onClose, onChanged, onNavigate }: Props) {
  const [card, setCard] = useState<Row | null>(null)
  const [form, setForm] = useState<Row>(blankAsset())
  const baseline = useRef(snapshot(blankAsset()))
  const [tab, setTab] = useState("general")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [action, setAction] = useState<AssetAction | null>(null)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editable = !card || ["DRAFT", "UNDER_CONSTRUCTION"].includes(card.status)
  const set = (patch: Row) => setForm(current => ({ ...current, ...patch }))
  const category = lookups.categories.find(row => Number(row.id) === Number(form.category_id))

  const load = async (id: number | null) => {
    setError("")
    setNotice("")
    if (!id) {
      const fresh = blankAsset(lookups.categories.find(row => Number(row.status) === 1)?.id ?? null)
      setCard(null)
      setForm(fresh)
      baseline.current = snapshot(fresh)
      setTab("general")
      return
    }
    setLoading(true)
    try {
      const data = await api<Row>(`/api/fixed-assets/${id}`)
      const next = fromRecord(data)
      setCard(data)
      setForm(next)
      baseline.current = snapshot(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل الأصل")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open) void load(assetId) }, [open, assetId])

  const dirty = () => snapshot(form) !== baseline.current
  const guard = (next: () => void) => { if (dirty() && editable) setPending(() => next); else next() }

  // تبديل الشاشة من القائمة/إغلاق التبويب/رجوع المتصفح/تحديث الصفحة مع تغييرات غير محفوظة ⇐ نفس نافذة
  // التحقق من التغييرات — كما في كاشير نقطة البيع (lib/navigation-guard.ts)
  useNavigationGuard(
    () => Boolean(open && editable && dirty()),
    (continueNavigation) => guard(continueNavigation),
  )

  const applyCategoryDefaults = (categoryId: number) => {
    const chosen = lookups.categories.find(row => Number(row.id) === categoryId)
    set({
      category_id: categoryId,
      ...(chosen ? {
        useful_life_months: form.useful_life_months || chosen.default_useful_life_months,
        depreciation_method: chosen.is_depreciable === false ? "NONE" : chosen.default_depreciation_method,
        declining_rate: chosen.default_declining_rate ?? "",
      } : {}),
    })
  }

  const save = async (activate = false) => {
    setSaving(true)
    setError("")
    try {
      let id = card?.id ? Number(card.id) : null
      if (id) await api(`/api/fixed-assets/${id}`, { method: "PUT", json: form })
      else id = Number((await api<Row>("/api/fixed-assets", { method: "POST", json: form })).id)
      if (activate) await api(`/api/fixed-assets/${id}/actions`, { method: "POST", json: { action: "activate" } })
      baseline.current = snapshot(form)
      onChanged(activate ? "تم تفعيل الأصل وترحيل قيد الاقتناء" : "تم حفظ الأصل")
      if (id !== assetId) onNavigate(id)
      else await load(id)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الحفظ")
      return false
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setConfirmDelete(false)
    if (!card?.id) return
    setSaving(true)
    try {
      await api(`/api/fixed-assets/${card.id}`, { method: "DELETE" })
      onChanged("تم حذف الأصل")
      onNavigate(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الحذف")
    } finally {
      setSaving(false)
    }
  }

  const index = assets.findIndex(row => Number(row.id) === Number(card?.id))
  const go = (target: number) => { const row = assets[target]; if (row) guard(() => onNavigate(Number(row.id))) }
  const accounts = useMemo(() => toOptions(lookups.accounts), [lookups.accounts])
  const parentOptions = useMemo(() => assets.filter(row => !row.parent_asset_id && Number(row.id) !== Number(card?.id) && row.status !== "DISPOSED").map(row => ({ label: `${row.asset_no} — ${row.name}`, value: Number(row.id) })), [assets, card?.id])
  const opening = form.acquisition_source === "OPENING_BALANCE"
  const life = n(form.useful_life_months)
  const monthly = life > 0 && form.depreciation_method === "STRAIGHT_LINE" ? (n(form.original_cost) - n(form.opening_accumulated_depreciation) - n(form.residual_value || n(form.original_cost) * n(category?.default_residual_percentage) / 100)) / life : 0
  const status = card?.status ?? "DRAFT"
  const actionsFor: AssetAction[] = status === "SUSPENDED" ? ["resume", "transfer", "adjust", "dispose"]
    : ["ACTIVE", "FULLY_DEPRECIATED"].includes(status) ? ["addition", "revaluation", "impairment", "adjust", "transfer", "suspend", "dispose"]
    : status === "DRAFT" || status === "UNDER_CONSTRUCTION" ? ["transfer"] : []
  const actionIcons: Record<AssetAction, JSX.Element> = {
    addition: <PackagePlus className="h-4 w-4" />, revaluation: <TrendingUp className="h-4 w-4" />, impairment: <TrendingDown className="h-4 w-4" />,
    adjust: <Settings2 className="h-4 w-4" />, transfer: <ArrowLeftRight className="h-4 w-4" />, suspend: <CirclePause className="h-4 w-4" />,
    resume: <CirclePlay className="h-4 w-4" />, dispose: <XCircle className="h-4 w-4" />,
  }

  return <>
    <Dialog open={open} onOpenChange={next => { if (!next && !saving) guard(onClose) }}>
      <DialogContent dir="rtl" className="flex h-[92dvh] max-h-[92dvh] w-[97vw] max-w-[1320px] flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <UniversalToolbar
          currentRecord={index + 1} totalRecords={assets.length} isNewRecord={!card} isSaving={saving}
          isFirstRecord={index <= 0} isLastRecord={index < 0 || index >= assets.length - 1}
          canSave={editable ? Boolean(form.name && form.category_id) : Boolean(form.name)} canDelete={Boolean(card && editable)}
          onFirst={() => go(0)} onPrevious={() => go(index < 0 ? assets.length - 1 : index - 1)} onNext={() => go(index < 0 ? 0 : index + 1)} onLast={() => go(assets.length - 1)}
          onNew={() => guard(() => onNavigate(null))} onSave={() => void save(false)} onDelete={() => setConfirmDelete(true)}
        />
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900/60">
          <span className="rounded-xl bg-teal-600 p-2 text-white"><Landmark className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-black">{card ? `${card.asset_no} — ${card.name}` : "أصل ثابت جديد"}</DialogTitle>
            <DialogDescription className="text-xs">{card ? `${card.category_name} · ${card.branch_name ?? ""}` : "يُحفظ كمسودة ثم يُفعَّل لترحيل قيد الاقتناء وتوليد جدول الإهلاك"}</DialogDescription>
          </div>
          <StatusBadge status={status} />
          {card && !editable && <div className="flex gap-4 text-xs">
            <div><span className="text-slate-500">التكلفة </span><b dir="ltr">{money(card.book_cost)}</b></div>
            <div><span className="text-slate-500">المتراكم </span><b dir="ltr">{money(card.accumulated_depreciation)}</b></div>
            <div><span className="text-slate-500">الدفترية </span><b dir="ltr" className="text-teal-700">{money(card.net_book_value)}</b></div>
          </div>}
        </div>
        {(editable || actionsFor.length > 0) && <div className="flex flex-wrap gap-2 border-b px-5 py-2">
          {editable && <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={saving || !form.name || !form.category_id} onClick={() => void save(true)}><Rocket className="ml-1.5 h-4 w-4" />حفظ وتفعيل الأصل</Button>}
          {card && actionsFor.map(key => <Button key={key} size="sm" variant="outline" disabled={saving || dirty()} onClick={() => setAction(key)}
            className={cn(key === "dispose" && "border-rose-200 text-rose-700 hover:bg-rose-50")}>{actionIcons[key]}<span className="mr-1.5">{ACTION_LABELS[key]}</span></Button>)}
        </div>}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-enter-tab-root="true">
          {error && <Alert variant="destructive" className="mb-3 border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
          {notice && <Alert className="mb-3 border-emerald-200 bg-emerald-50 text-emerald-700"><AlertDescription>{notice}</AlertDescription></Alert>}
          {loading ? <div className="grid h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div> :
          <Tabs value={tab} onValueChange={setTab} dir="rtl" className="space-y-4">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <TabsTrigger value="general">البيانات الأساسية</TabsTrigger>
              <TabsTrigger value="acquisition">الاقتناء والتكلفة</TabsTrigger>
              <TabsTrigger value="depreciation">سياسة الإهلاك</TabsTrigger>
              <TabsTrigger value="location">الموقع والعهدة</TabsTrigger>
              {card && <>
                <TabsTrigger value="schedule">جدول الإهلاك</TabsTrigger>
                <TabsTrigger value="history">الحركات ({card.transactions?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="components">المكونات ({card.components?.length ?? 0})</TabsTrigger>
                <TabsTrigger value="documents">المستندات ({card.documents?.length ?? 0})</TabsTrigger>
              </>}
            </TabsList>

            <TabsContent value="general" className="mt-0">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="رقم الأصل" htmlFor="fa-no" hint={card ? undefined : "اتركه فارغاً للترقيم التلقائي"}><Input id="fa-no" dir="ltr" className="text-right" value={form.asset_no ?? ""} disabled={!editable} onChange={event => set({ asset_no: event.target.value })} placeholder="FA-00001" /></Field>
                <Field label="اسم الأصل" htmlFor="fa-name" required className="lg:col-span-2"><Input id="fa-name" value={form.name ?? ""} onChange={event => set({ name: event.target.value })} /></Field>
                <Field label="التصنيف" htmlFor="fa-category" required><Select id="fa-category" value={form.category_id} disabled={!editable} options={toOptions(lookups.categories.filter(row => Number(row.status) === 1 || Number(row.id) === Number(form.category_id)))} onChange={value => applyCategoryDefaults(Number(value))} /></Field>
                <Field label="مكوّن من الأصل" htmlFor="fa-parent" hint="للمكونات بعمر مختلف (مصعد مبنى، محرك آلة)"><Select id="fa-parent" value={form.parent_asset_id} disabled={!editable} options={parentOptions} clearable onChange={value => set({ parent_asset_id: value })} /></Field>
                <Field label="الباركود" htmlFor="fa-barcode"><Input id="fa-barcode" dir="ltr" className="text-right" value={form.barcode ?? ""} onChange={event => set({ barcode: event.target.value })} /></Field>
                <Field label="الرقم التسلسلي" htmlFor="fa-serial"><Input id="fa-serial" dir="ltr" className="text-right" value={form.serial_number ?? ""} onChange={event => set({ serial_number: event.target.value })} /></Field>
                <Field label="نهاية الكفالة" htmlFor="fa-warranty"><Input id="fa-warranty" type="date" value={form.warranty_end_date ?? ""} onChange={event => set({ warranty_end_date: event.target.value })} /></Field>
                <Field label="الموديل" htmlFor="fa-model"><Input id="fa-model" value={form.model ?? ""} onChange={event => set({ model: event.target.value })} /></Field>
                <Field label="الشركة المصنعة" htmlFor="fa-maker"><Input id="fa-maker" value={form.manufacturer ?? ""} onChange={event => set({ manufacturer: event.target.value })} /></Field>
                <Field label="الوصف" htmlFor="fa-desc" className="sm:col-span-2"><Textarea id="fa-desc" rows={2} value={form.description ?? ""} onChange={event => set({ description: event.target.value })} /></Field>
                <Field label="ملاحظات" htmlFor="fa-notes" className="sm:col-span-2"><Textarea id="fa-notes" rows={2} value={form.notes ?? ""} onChange={event => set({ notes: event.target.value })} /></Field>
              </div>
            </TabsContent>

            <TabsContent value="acquisition" className="mt-0 space-y-4">
              {!editable && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">الأصل مفعّل — البيانات المالية تتغير فقط عبر الحركات (إضافة رأسمالية، إعادة تقييم، تعديل سياسة الإهلاك) للحفاظ على سجل التدقيق.</p>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="مصدر الاقتناء" htmlFor="fa-source"><Select id="fa-source" value={form.acquisition_source} disabled={!editable} options={recordOptions(ACQUISITION_SOURCES)} onChange={value => set({ acquisition_source: value })} /></Field>
                <Field label={opening ? "تاريخ الرصيد الافتتاحي" : "تاريخ الاقتناء"} htmlFor="fa-acq-date" required><Input id="fa-acq-date" type="date" disabled={!editable} value={form.acquisition_date ?? ""} onChange={event => set({ acquisition_date: event.target.value })} /></Field>
                <Field label="جاهز للاستخدام" htmlFor="fa-ready" hint="التركيب / التشغيل"><Input id="fa-ready" type="date" disabled={!editable} value={form.available_for_use_date ?? ""} onChange={event => set({ available_for_use_date: event.target.value })} /></Field>
                <Field label="التكلفة الأصلية (بعملة الأساس)" htmlFor="fa-cost" required><NumberField id="fa-cost" value={form.original_cost} min={0} disabled={!editable} onChange={value => set({ original_cost: value })} /></Field>
                <Field label="القيمة المتبقية (الخردة)" htmlFor="fa-residual" hint={category ? `افتراضي التصنيف ${n(category.default_residual_percentage)}%` : undefined}><NumberField id="fa-residual" value={form.residual_value} min={0} disabled={!editable} onChange={value => set({ residual_value: value })} /></Field>
                {opening && <Field label="الإهلاك المتراكم الافتتاحي" htmlFor="fa-open-acc"><NumberField id="fa-open-acc" value={form.opening_accumulated_depreciation} min={0} disabled={!editable} onChange={value => set({ opening_accumulated_depreciation: value })} /></Field>}
                <Field label="العملة الأصلية" htmlFor="fa-currency"><Select id="fa-currency" value={form.currency_id} disabled={!editable} options={toOptions(lookups.currencies)} clearable onChange={value => set({ currency_id: value })} /></Field>
                <Field label="المبلغ بالعملة الأصلية" htmlFor="fa-foreign"><NumberField id="fa-foreign" value={form.foreign_cost} disabled={!editable} onChange={value => set({ foreign_cost: value, original_cost: n(value) && n(form.exchange_rate) ? (n(value) * n(form.exchange_rate)).toFixed(2) : form.original_cost })} /></Field>
                <Field label="سعر الصرف" htmlFor="fa-rate"><NumberField id="fa-rate" value={form.exchange_rate} disabled={!editable} onChange={value => set({ exchange_rate: value, original_cost: n(form.foreign_cost) && n(value) ? (n(form.foreign_cost) * n(value)).toFixed(2) : form.original_cost })} /></Field>
                <Field label="المورد" htmlFor="fa-supplier"><Select id="fa-supplier" value={form.supplier_account_id} disabled={!editable} options={accounts} clearable onChange={value => set({ supplier_account_id: value, credit_account_id: form.credit_account_id ?? value })} /></Field>
                <Field label={opening ? "حساب الأرصدة الافتتاحية" : "الحساب الدائن لقيد الاقتناء"} htmlFor="fa-credit" required={form.post_acquisition_journal} hint={opening ? "رأس المال / أرصدة افتتاحية" : "المورد أو الصندوق أو حساب فاتورة المشتريات"} className="lg:col-span-2">
                  <Select id="fa-credit" value={form.credit_account_id} disabled={!editable} options={accounts} clearable onChange={value => set({ credit_account_id: value })} />
                </Field>
                <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm lg:col-span-2">
                  <span><b className="block">ترحيل قيد الاقتناء عند التفعيل</b><small className="text-slate-500">أوقفه إذا كانت التكلفة مسجلة مسبقاً على حساب الأصل</small></span>
                  <Switch checked={form.post_acquisition_journal !== false} disabled={!editable} onCheckedChange={value => set({ post_acquisition_journal: value })} />
                </label>
              </div>
              {card?.purchase_invoice_id && <p className="text-xs text-slate-500">مصدره سطر فاتورة مشتريات رقم {card.purchase_invoice_id}</p>}
            </TabsContent>

            <TabsContent value="depreciation" className="mt-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="طريقة الإهلاك" htmlFor="fa-method"><Select id="fa-method" value={form.depreciation_method} disabled={!editable || category?.is_depreciable === false} options={recordOptions(DEPRECIATION_METHODS)} onChange={value => set({ depreciation_method: value })} /></Field>
                <Field label="العمر الإنتاجي (أشهر)" htmlFor="fa-life" hint={life ? `${(life / 12).toFixed(1)} سنة` : category ? `افتراضي ${category.default_useful_life_months} شهر` : undefined}><NumberField id="fa-life" value={form.useful_life_months} min={1} step="1" disabled={!editable} onChange={value => set({ useful_life_months: value })} /></Field>
                {form.depreciation_method === "DECLINING_BALANCE" && <Field label="النسبة السنوية %" htmlFor="fa-db-rate" hint="فارغ = ضعف القسط الثابت"><NumberField id="fa-db-rate" value={form.declining_rate} disabled={!editable} onChange={value => set({ declining_rate: value })} /></Field>}
                <Field label="بداية الإهلاك" htmlFor="fa-dep-start" hint="افتراضياً تاريخ الجاهزية للاستخدام — الشهر الأول يُحسب نسبياً"><Input id="fa-dep-start" type="date" disabled={!editable} value={form.depreciation_start_date ?? ""} onChange={event => set({ depreciation_start_date: event.target.value })} /></Field>
              </div>
              {editable && monthly > 0 && <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">الإهلاك الشهري التقديري: <b dir="ltr">{money(monthly)}</b> — السنوي: <b dir="ltr">{money(monthly * 12)}</b></p>}
              {card?.books?.map((book: Row) => <div key={book.id} className="grid grid-cols-2 gap-3 rounded-xl border p-3 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">الدفتر</p><b>{book.book_type === "ACCOUNTING" ? "الدفتر المحاسبي" : book.book_type}</b></div>
                <div><p className="text-xs text-slate-500">الطريقة / العمر</p><b>{(DEPRECIATION_METHODS as Row)[book.depreciation_method]} · {book.useful_life_months} شهر</b></div>
                <div><p className="text-xs text-slate-500">من — إلى</p><b dir="ltr">{day(book.depreciation_start_date)} → {day(book.depreciation_end_date)}</b></div>
                <div><p className="text-xs text-slate-500">آخر إهلاك مرحّل</p><b dir="ltr">{day(book.last_depreciation_date) || "—"}</b></div>
              </div>)}
            </TabsContent>

            <TabsContent value="location" className="mt-0">
              {!editable && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">لتغيير الموقع أو العهدة استخدم "نقل الأصل" ليُحفظ سجل النقل.</p>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="الموقع" htmlFor="fa-location"><Select id="fa-location" value={form.location_id} disabled={!editable} options={toOptions(lookups.locations)} clearable onChange={value => set({ location_id: value })} /></Field>
                <Field label="القسم" htmlFor="fa-dept"><Select id="fa-dept" value={form.department_id} disabled={!editable} options={toOptions(lookups.departments)} clearable onChange={value => set({ department_id: value })} /></Field>
                <Field label="مركز التكلفة" htmlFor="fa-cc" hint="يُحمَّل عليه مصروف الإهلاك"><Select id="fa-cc" value={form.cost_center_id} disabled={!editable} options={toOptions(lookups.costCenters)} clearable onChange={value => set({ cost_center_id: value })} /></Field>
                <Field label="المسؤول / العهدة" htmlFor="fa-custodian"><Select id="fa-custodian" value={form.custodian_employee_id} disabled={!editable} options={toOptions(lookups.employees)} clearable onChange={value => set({ custodian_employee_id: value })} placeholder={lookups.employees.length ? "—" : "لا يوجد موظفون معرّفون"} /></Field>
              </div>
              {card?.transfers?.length > 0 && <div className="mt-5">
                <h4 className="mb-2 text-sm font-black">سجل النقل</h4>
                <DataTable maxHeight="280px" footer={false} rows={card!.transfers} columns={[
                  { key: "transfer_date", label: "التاريخ", render: row => day(row.transfer_date) },
                  { key: "branch", label: "الفرع", render: row => row.from_branch === row.to_branch ? row.to_branch : `${row.from_branch ?? "—"} ← ${row.to_branch ?? "—"}` },
                  { key: "location", label: "الموقع", render: row => `${row.from_location ?? "—"} ← ${row.to_location ?? "—"}` },
                  { key: "cc", label: "مركز التكلفة", render: row => `${row.from_cost_center ?? "—"} ← ${row.to_cost_center ?? "—"}` },
                  { key: "reason", label: "السبب" },
                ]} />
              </div>}
            </TabsContent>

            {card && <>
              <TabsContent value="schedule" className="mt-0">
                <DataTable rows={card.schedule ?? []} maxHeight="calc(92dvh - 330px)" columns={[
                  { key: "period", label: "الفترة" },
                  { key: "opening_book_value", label: "القيمة الافتتاحية", numeric: true },
                  { key: "depreciation_amount", label: "الإهلاك", numeric: true, total: true },
                  { key: "accumulated_depreciation", label: "المتراكم", numeric: true },
                  { key: "closing_book_value", label: "القيمة الدفترية", numeric: true },
                  { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} /> },
                  { key: "run_no", label: "التشغيل" },
                  { key: "journal_code", label: "القيد" },
                ]} empty="لا يوجد جدول إهلاك (الأصل غير قابل للإهلاك أو مهلك بالكامل)" />
              </TabsContent>
              <TabsContent value="history" className="mt-0">
                <DataTable rows={card.transactions ?? []} maxHeight="calc(92dvh - 330px)" footer={false} columns={[
                  { key: "transaction_no", label: "الرقم" },
                  { key: "transaction_date", label: "التاريخ", render: row => day(row.transaction_date) },
                  { key: "transaction_type", label: "النوع", render: row => transactionLabel(row.transaction_type) },
                  { key: "amount", label: "المبلغ", numeric: true },
                  { key: "cost_delta", label: "أثر التكلفة", numeric: true },
                  { key: "accumulated_delta", label: "أثر المتراكم", numeric: true },
                  { key: "journal_code", label: "القيد" },
                  { key: "notes", label: "ملاحظات" },
                ]} />
              </TabsContent>
              <TabsContent value="components" className="mt-0">
                <p className="mb-3 text-xs text-slate-500">المكونات أصول مستقلة لها عمر وإهلاك خاص (مثل المصعد والتكييف في مبنى). أنشئ أصلاً جديداً واختر هذا الأصل في حقل "مكوّن من الأصل".</p>
                <DataTable rows={card.components ?? []} onRowClick={row => guard(() => onNavigate(Number(row.id)))} footer columns={[
                  { key: "asset_no", label: "الرقم" }, { key: "name", label: "الاسم" },
                  { key: "status", label: "الحالة", render: row => <StatusBadge status={row.status} /> },
                  { key: "book_cost", label: "التكلفة", numeric: true, total: true },
                  { key: "net_book_value", label: "القيمة الدفترية", numeric: true, total: true },
                ]} empty="لا توجد مكونات" />
              </TabsContent>
              <TabsContent value="documents" className="mt-0">
                <DocumentsPanel assetId={Number(card.id)} documents={card.documents ?? []} onChanged={() => void load(Number(card.id))} onError={setError} />
              </TabsContent>
            </>}
          </Tabs>}
        </div>
      </DialogContent>
    </Dialog>

    <AssetActionDialog action={action} asset={card} lookups={lookups} onClose={() => setAction(null)}
      onDone={message => { setAction(null); setNotice(message); onChanged(message); if (card) void load(Number(card.id)).then(() => setNotice(message)) }} />
    <ConfirmDialogYesNo useAppDialog visible={pending !== null} showBack message="توجد تعديلات غير محفوظة على الأصل، هل تريد حفظها؟"
      onConfirm={async () => { const next = pending; setPending(null); if (await save(false)) next?.() }}
      onCancel={() => { const next = pending; setPending(null); baseline.current = snapshot(form); next?.() }}
      onBack={() => setPending(null)} />
    <ConfirmDialogYesNo useAppDialog visible={confirmDelete} message={`حذف المسودة ${card?.asset_no ?? ""}؟`} onConfirm={() => void remove()} onCancel={() => setConfirmDelete(false)} />
  </>
}

function DocumentsPanel({ assetId, documents, onChanged, onError }: { assetId: number; documents: Row[]; onChanged: () => void; onError: (message: string) => void }) {
  const [type, setType] = useState("OTHER")
  const [description, setDescription] = useState("")
  const [expiry, setExpiry] = useState("")
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  const upload = async (file: File) => {
    if (file.size > MAX_DOCUMENT_BYTES) { onError("حجم الملف يتجاوز 5 ميجابايت"); return }
    setBusy(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
        reader.onerror = () => reject(new Error("تعذرت قراءة الملف"))
        reader.readAsDataURL(file)
      })
      await api(`/api/fixed-assets/${assetId}/documents`, { method: "POST", json: { document_type: type, file_name: file.name, mime_type: file.type || "application/octet-stream", data, description, expiry_date: expiry } })
      setDescription("")
      setExpiry("")
      onChanged()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "تعذر رفع الملف")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  const openDocument = async (id: number) => {
    const response = await fetch(`/api/fixed-assets/${assetId}/documents?document_id=${id}`)
    if (!response.ok) { onError("تعذر فتح المستند"); return }
    const url = URL.createObjectURL(await response.blob())
    window.open(url, "_blank", "noopener")
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const remove = async (id: number) => {
    try { await api(`/api/fixed-assets/${assetId}/documents?document_id=${id}`, { method: "DELETE" }); onChanged() }
    catch (reason) { onError(reason instanceof Error ? reason.message : "تعذر الحذف") }
  }

  return <div className="space-y-4">
    <div className="grid items-end gap-3 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-4 dark:border-slate-700">
      <Field label="نوع المستند" htmlFor="fa-doc-type"><Select id="fa-doc-type" value={type} options={recordOptions(DOCUMENT_TYPES)} onChange={value => setType(value)} /></Field>
      <Field label="الوصف" htmlFor="fa-doc-desc"><Input id="fa-doc-desc" value={description} onChange={event => setDescription(event.target.value)} /></Field>
      <Field label="تاريخ الانتهاء" htmlFor="fa-doc-exp"><Input id="fa-doc-exp" type="date" value={expiry} onChange={event => setExpiry(event.target.value)} /></Field>
      <div>
        <input ref={input} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file) }} />
        <Button type="button" className="w-full" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <FileUp className="ml-2 h-4 w-4" />}رفع ملف (حتى 5MB)</Button>
      </div>
    </div>
    <DataTable rows={documents} footer={false} maxHeight="calc(92dvh - 420px)" columns={[
      { key: "document_type", label: "النوع", render: row => (DOCUMENT_TYPES as Row)[row.document_type] ?? row.document_type },
      { key: "file_name", label: "الملف", render: row => <button type="button" className="text-teal-700 underline-offset-2 hover:underline" onClick={() => void openDocument(Number(row.id))}>{row.file_name}</button> },
      { key: "file_size", label: "الحجم", render: row => `${(n(row.file_size) / 1024).toFixed(0)} KB` },
      { key: "description", label: "الوصف" },
      { key: "expiry_date", label: "ينتهي", render: row => { const value = day(row.expiry_date); return value ? <span className={value < today() ? "font-bold text-rose-600" : ""}>{value}</span> : "" } },
      { key: "created_at", label: "أُضيف", render: row => day(row.created_at) },
      { key: "delete", label: "", render: row => <button type="button" aria-label="حذف المستند" className="text-rose-600" onClick={() => void remove(Number(row.id))}><Trash2 className="h-4 w-4" /></button> },
    ]} empty="لا توجد مستندات — ارفع الفاتورة أو الكفالة أو التأمين أو صورة الأصل" />
  </div>
}

