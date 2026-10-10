"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import Messages from "@/components/common/Messages"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { CalendarClock, CalendarRange, Megaphone, PackagePlus, SaveAll, ShieldAlert, Store } from "lucide-react"
import { campaignAmounts } from "@/lib/campaign-items"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { CampaignItemsGrid, type CampaignProduct } from "./campaign-items-grid"
import { useWorkspaceTabActive } from "@/contexts/workspace-tab-context"
import { useNavigationGuard } from "@/lib/navigation-guard"

export type CampaignItem = {
  item_id: number
  item_name: string
  item_code?: string
  unit_name?: string
  unit_id?: number
  discount_type?: number
  notes?: string
  price: number
  discount: number
  quantity: number
  type?: number
}

export type CampaignRecord = {
  id?: number
  code: string
  name: string
  start_date: string
  end_date: string
  time_type: number
  from_time: string
  to_time: string
  type_id: number
  from_amount: number
  to_amount: number
  discount_perc: number
  condition_items_opt: number
  condition_items_val: number
  added_items_option: number
  added_items_value: number
  price_class: number
  max_campaigns: number
  notes: string
  warehouse_ids: number[]
  branch_ids: number[]
  items?: CampaignItem[]
}

type Warehouse = { id: number; code?: string; name: string }
type Option = { label: string; value: number }

export const campaignTypeOptions: Option[] = [
  { value: 1, label: "خصومات أسعار الأصناف" },
  { value: 2, label: "خصومات حزم الأصناف" },
  { value: 3, label: "خصومات إجمالي الفاتورة" },
  { value: 4, label: "خصومات إجمالي أصناف" },
  { value: 5, label: "أول كمية" },
]
const timeTypeOptions: Option[] = [
  { value: 1, label: "من بداية الحملة حتى نهايتها" },
  { value: 2, label: "فترة بيع يومية" },
]
const buyConditionOptions: Option[] = [
  { value: 1, label: "شراء جميع الأصناف" },
  { value: 2, label: "شراء عدد من الأصناف" },
  { value: 3, label: "شراء كمية محددة" },
]
const addedConditionOptions: Option[] = [
  { value: 1, label: "إضافة جميع الأصناف" },
  { value: 2, label: "إضافة عدد من الأصناف" },
  { value: 3, label: "إضافة كمية محددة" },
]

const today = () => new Date().toISOString().slice(0, 10)

export function campaignStatus(record: Pick<CampaignRecord, "start_date" | "end_date">) {
  const now = today()
  const start = String(record.start_date || "").slice(0, 10)
  const end = String(record.end_date || "").slice(0, 10)
  if (start && now < start) return { label: "قادمة", tone: "bg-sky-100 text-sky-700" }
  if (end && now > end) return { label: "منتهية", tone: "bg-slate-200 text-slate-600" }
  return { label: "فعّالة", tone: "bg-emerald-100 text-emerald-700" }
}

const emptyCampaign: CampaignRecord = {
  code: "", name: "", start_date: today(), end_date: "",
  time_type: 1, from_time: "", to_time: "", type_id: 1, from_amount: 0, to_amount: 0,
  discount_perc: 0, condition_items_opt: 1, condition_items_val: 0, added_items_option: 1,
  added_items_value: 0, price_class: 1, max_campaigns: 1, notes: "", warehouse_ids: [], branch_ids: [],
}

const numberFields = ["time_type", "type_id", "from_amount", "to_amount", "discount_perc", "condition_items_opt", "condition_items_val", "added_items_option", "added_items_value", "price_class", "max_campaigns"] as const

function normalizeCampaign(record: CampaignRecord | null, code: string): CampaignRecord {
  const merged = { ...emptyCampaign, ...(record || {}) }
  for (const field of numberFields) merged[field] = Number(merged[field] ?? emptyCampaign[field]) || 0
  merged.time_type ||= 1
  merged.type_id ||= 1
  return {
    ...merged,
    code: record?.code || code,
    name: merged.name || "",
    notes: merged.notes || "",
    warehouse_ids: Array.isArray(record?.warehouse_ids) ? record.warehouse_ids.map(Number) : [],
    branch_ids: Array.isArray(record?.branch_ids) ? record.branch_ids.map(Number) : [],
    start_date: String(record?.start_date || emptyCampaign.start_date).slice(0, 10),
    end_date: String(record?.end_date || "").slice(0, 10),
    from_time: String(record?.from_time || "").slice(0, 5),
    to_time: String(record?.to_time || "").slice(0, 5),
  }
}

const normalizeItems = (items: CampaignItem[]) => items.map(item => ({
  ...item, price: Number(item.price) || 0, discount: Number(item.discount) || 0, quantity: Number(item.quantity) || 0,
}))

const snapshotOf = (form: CampaignRecord, buy: CampaignItem[], added: CampaignItem[]) => {
  const { items: _items, ...header } = form
  const pick = (rows: CampaignItem[]) => rows.map(row => [row.item_id, row.unit_id || 0, Number(row.price) || 0, Number(row.quantity) || 0, Number(row.discount) || 0, row.notes || ""])
  return JSON.stringify({ header, buy: pick(buy), added: pick(added) })
}

function nextCampaignCode(campaigns: CampaignRecord[]) {
  const max = campaigns.reduce((top, row) => Math.max(top, Number(/(\d+)$/.exec(String(row.code || ""))?.[1] || 0)), 0)
  return `CMP-${String(max + 1).padStart(4, "0")}`
}

type Props = {
  open?: boolean
  campaign?: CampaignRecord | null
  campaigns?: CampaignRecord[]
  products?: CampaignProduct[]
  warehouses?: Warehouse[]
  branches?: Warehouse[]
  onSaved?: (id: number) => void
  onDeleted?: () => void
  onQuery?: () => void
  onCancel?: () => void
}

export default function UnifiedCampaigns({
  open = true, campaign, campaigns = [], products = [], warehouses = [], branches = [],
  onSaved = () => undefined, onDeleted = () => undefined, onQuery, onCancel = () => undefined,
}: Props) {
  const workspaceTabActive = useWorkspaceTabActive()
  const [form, setForm] = useState<CampaignRecord>(() => normalizeCampaign(campaign || null, nextCampaignCode(campaigns)))
  const [buyItems, setBuyItems] = useState<CampaignItem[]>([])
  const [addedItems, setAddedItems] = useState<CampaignItem[]>([])
  const buyItemsRef = useRef(buyItems)
  const addedItemsRef = useRef(addedItems)
  buyItemsRef.current = buyItems
  addedItemsRef.current = addedItems
  const formRef = useRef(form)
  formRef.current = form
  const baselineRef = useRef("")
  const pendingActionRef = useRef<(() => void) | null>(null)
  const buyGrid = useRef<any>(null)
  const addedGrid = useRef<any>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const [catalogProducts, setCatalogProducts] = useState(products)
  const [priceClasses, setPriceClasses] = useState<Option[]>([])
  const [activeTab, setActiveTab] = useState("overview")
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const messagesRef = useRef<any>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    fetch(`/api/campaigns?catalog=1&price_class=${form.price_class}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setCatalogProducts(data.products || [])
        setPriceClasses([{ value: 0, label: "كل الفئات السعرية" }, ...(data.priceClasses || []).map((row: any) => ({ value: Number(row.id), label: row.name }))])
      })
      .catch(reason => { if (reason.name !== "AbortError") setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false) })
    return () => controller.abort()
  }, [form.price_class])

  const update = (patch: Partial<CampaignRecord>) => setForm(current => ({ ...current, ...patch }))
  const finishGridEditing = () => {
    buyGrid.current?.control?.finishEditing()
    addedGrid.current?.control?.finishEditing()
  }

  const showCampaign = (record: CampaignRecord | null) => {
    const next = normalizeCampaign(record, nextCampaignCode(campaigns))
    const buy = normalizeItems(record?.items?.filter(item => Number(item.type) !== 2) || [])
    const added = normalizeItems(record?.items?.filter(item => Number(item.type) === 2) || [])
    setForm(next)
    setBuyItems(buy)
    setAddedItems(added)
    buyItemsRef.current = buy
    addedItemsRef.current = added
    baselineRef.current = snapshotOf(next, buy, added)
    setError("")
    setActiveTab("overview")
    requestAnimationFrame(() => nameRef.current?.focus())
  }

  useEffect(() => { showCampaign(campaign || null) }, [campaign])

  const isDirty = () => {
    finishGridEditing()
    return snapshotOf(formRef.current, buyItemsRef.current, addedItemsRef.current) !== baselineRef.current
  }
  const runAfterUnsavedCheck = (action: () => void) => {
    if (saving) return
    if (!isDirty()) { action(); return }
    pendingActionRef.current = action
    setShowUnsavedConfirm(true)
  }
  // تبديل الشاشة من القائمة/إغلاق التبويب/رجوع المتصفح/تحديث الصفحة مع تغييرات غير محفوظة ⇐ نفس نافذة
  // التحقق من التغييرات — كما في كاشير نقطة البيع (lib/navigation-guard.ts)
  useNavigationGuard(
    () => Boolean(open && !saving && isDirty()),
    (continueNavigation) => runAfterUnsavedCheck(continueNavigation),
  )


  const recordIndex = campaigns.findIndex(item => Number(item.id) === Number(form.id))
  const navigate = (index: number) => {
    const target = campaigns[index]
    if (target) runAfterUnsavedCheck(() => showCampaign(target))
  }

  type Issue = { message: string; tab: "overview" | "items" | "scope"; grid?: "buy" | "added"; row?: number; field?: string; focusId?: string }

  // Same rules as ShamelWeb Campaigns.js (validateGrid / validateGrid2): every buy item needs a
  // discount — except bundle and "other" campaigns that already give added items — every added
  // item needs a discount, quantity at least 1, and no item repeated in the same grid.
  const validateItems = (items: CampaignItem[], grid: "buy" | "added", allowZeroDiscount: boolean): Issue | null => {
    const label = grid === "buy" ? "أصناف الشراء" : "الأصناف المضافة"
    const seen = new Map<string, number>()
    for (let row = 0; row < items.length; row++) {
      const item = items[row]
      if (!item.item_id) continue
      const name = item.item_name || item.item_code || `السطر ${row + 1}`
      if (!(Number(item.quantity) >= 1)) return { message: `${label}: الكمية للصنف "${name}" يجب أن تكون 1 على الأقل`, tab: "items", grid, row, field: "quantity" }
      if (!(Number(item.discount) > 0) && !allowZeroDiscount) return { message: `${label}: أدخل مبلغ الخصم للصنف "${name}"`, tab: "items", grid, row, field: "discount" }
      const key = `${item.item_id}:${item.unit_id ?? ""}`
      if (seen.has(key)) return { message: `${label}: الصنف "${name}" مكرر`, tab: "items", grid, row, field: "item_code" }
      seen.set(key, row)
    }
    return null
  }

  const validate = (current: CampaignRecord): Issue | null => {
    if (!current.code.trim()) return { message: "رمز الحملة مطلوب", tab: "overview", focusId: "campaign-code" }
    if (!current.name.trim()) return { message: "اسم الحملة مطلوب", tab: "overview", focusId: "campaign-name" }
    if (!current.start_date) return { message: "حدد تاريخ بداية الحملة", tab: "overview", focusId: "campaign-start_date" }
    if (!current.end_date) return { message: "حدد تاريخ نهاية الحملة", tab: "overview", focusId: "campaign-end_date" }
    if (current.start_date > current.end_date) return { message: "تاريخ نهاية الحملة قبل تاريخ بدايتها", tab: "overview", focusId: "campaign-end_date" }
    if (current.time_type === 2 && Boolean(current.from_time) !== Boolean(current.to_time)) return { message: "حدد ساعة البداية والنهاية للفترة اليومية", tab: "overview", focusId: current.from_time ? "campaign-to_time" : "campaign-from_time" }
    if (current.time_type === 2 && current.from_time && current.from_time >= current.to_time) return { message: "ساعة نهاية الفترة اليومية يجب أن تكون بعد ساعة البداية", tab: "overview", focusId: "campaign-to_time" }
    if (current.time_type === 1 && current.start_date === current.end_date && current.from_time && current.to_time && current.from_time >= current.to_time)
      return { message: "وقت نهاية الحملة يجب أن يكون بعد وقت بدايتها", tab: "overview", focusId: "campaign-to_time" }
    if (current.type_id === 5 && (!Number.isInteger(Number(current.condition_items_val)) || Number(current.condition_items_val) < 1))
      return { message: "الكمية الأولى يجب أن تكون عدداً صحيحاً موجباً", tab: "overview", focusId: "campaign-first-qty" }
    if ((current.type_id === 3 || current.type_id === 4) && (current.discount_perc < 0 || current.discount_perc > 100))
      return { message: "نسبة الخصم يجب أن تكون بين 0 و 100", tab: "overview", focusId: "campaign-discount" }
    if ((current.type_id === 3 || current.type_id === 4) && current.to_amount > 0 && current.from_amount > current.to_amount)
      return { message: "\"من مبلغ\" أكبر من \"إلى مبلغ\"", tab: "overview", focusId: "campaign-to-amount" }
    const buy = buyItemsRef.current.filter(item => item.item_id)
    const added = addedItemsRef.current.filter(item => item.item_id)
    const usesBuy = current.type_id !== 3
    const usesAdded = ![1, 5].includes(current.type_id)
    if (usesBuy && !buy.length) return { message: "أضف صنف شراء واحداً على الأقل", tab: "items" }
    if (usesBuy) {
      const bundleWithGifts = (current.type_id === 2 || current.type_id === 4) && added.length > 0
      const issue = validateItems(buyItemsRef.current, "buy", bundleWithGifts)
      if (issue) return issue
    }
    if (usesAdded) {
      if (!added.length && !(current.type_id === 3 && current.discount_perc > 0)) return { message: "أضف صنفاً واحداً على الأقل في الأصناف المضافة / الهدايا", tab: "items" }
      const issue = validateItems(addedItemsRef.current, "added", false)
      if (issue) return issue
    }
    return null
  }

  const showMessage = (severity: "error" | "success" | "info", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, sticky: severity === "error", life: 4000 }])
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }
  const setError = (message: string) => { if (message) showMessage("error", message); else messagesRef.current?.clear?.() }

  const revealIssue = (issue: Issue) => {
    setActiveTab(issue.tab)
    showMessage("error", issue.message)
    window.setTimeout(() => {
      if (issue.focusId) { document.getElementById(issue.focusId)?.focus(); return }
      const grid = (issue.grid === "added" ? addedGrid : buyGrid).current?.control
      if (!grid || issue.row === undefined) return
      const column = grid.columns.findIndex((col: any) => col.binding === issue.field)
      grid.focus()
      grid.select(issue.row, Math.max(0, column))
    }, 120)
  }

  const save = async () => {
    // أي استثناء قبل الإرسال (إنهاء تحرير شبكة غير مركّبة، تحقق...) كان يُبتلع بصمت فيبدو الزر بلا أثر —
    // يُعرض الآن كرسالة خطأ بدل ذلك
    let current: CampaignRecord
    try {
      try { finishGridEditing() } catch { /* شبكة تبويب الأصناف غير مركّبة حالياً */ }
      current = formRef.current
      const issue = validate(current)
      if (issue) {
        revealIssue(issue)
        return false
      }
    } catch (reason) {
      console.error("Campaign save failed before submit", reason)
      showMessage("error", reason instanceof Error ? `تعذر حفظ الحملة: ${reason.message}` : "تعذر حفظ الحملة")
      return false
    }
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/campaigns", {
        method: current.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...current,
          buy_items: current.type_id === 3 ? [] : buyItemsRef.current,
          added_items: [1, 5].includes(current.type_id) ? [] : addedItemsRef.current,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الحملة")
      const saved = { ...current, id: Number(data.id) }
      setForm(saved)
      formRef.current = saved
      baselineRef.current = snapshotOf(saved, buyItemsRef.current, addedItemsRef.current)
      onSaved(Number(data.id))
      showMessage("success", "تم حفظ الحملة بنجاح")
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الحملة")
      return false
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setShowDeleteConfirm(false)
    if (!form.id) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(`/api/campaigns?id=${form.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر حذف الحملة")
      showCampaign(null)
      onDeleted()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حذف الحملة")
    } finally {
      setSaving(false)
    }
  }

  const requestClose = () => runAfterUnsavedCheck(onCancel)

  // F3 حفظ / F9 حذف وبقية الاختصارات الموحّدة: UniversalToolbar (lib/hotkeys.ts)

  const hasInvoiceDiscount = form.type_id === 3 || form.type_id === 4
  const hasBuyConditions = form.type_id === 2 || form.type_id === 4
  const hasBuyItems = form.type_id !== 3
  const hasAddedItems = ![1, 5].includes(form.type_id)
  const status = campaignStatus(form)
  const bundleOriginalTotal = useMemo(() => [...buyItems, ...addedItems].reduce((sum, item) => sum + campaignAmounts(item).qtyAmount, 0), [buyItems, addedItems])
  const bundleCampaignTotal = useMemo(() => [...buyItems, ...addedItems].reduce((sum, item) => sum + campaignAmounts(item).campQtyAmount, 0), [buyItems, addedItems])
  const durationDays = form.start_date && form.end_date && form.end_date >= form.start_date
    ? Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86_400_000) + 1
    : 0

  const dropdown = (id: string, value: number, options: Option[], onChange: (value: number) => void, filter = false) => (
    <PrimeDropdown
      inputId={id}
      value={value}
      options={options}
      optionLabel="label"
      optionValue="value"
      filter={filter}
      filterInputAutoFocus={filter}
      className="invoice-currency-dropdown w-full"
      panelClassName="invoice-currency-dropdown-panel customer-popup-dropdown-panel"
      appendTo="self"
      onChange={(event: any) => { if (event.value !== null && event.value !== undefined) onChange(Number(event.value)) }}
    />
  )
  const numberInput = (id: string, value: number, onChange: (value: number) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={id} type="number" dir="ltr" className="text-right" value={value} onChange={event => onChange(event.target.value === "" ? 0 : Number(event.target.value))} {...props} />
  )
  const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
  const cardTitle = (icon: React.ReactNode, title: string, hint?: string) => (
    <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-teal-50 p-2 text-teal-700 dark:bg-teal-950 dark:text-teal-300">{icon}</span><div><h3 className="font-black">{title}</h3>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div></div>
  )

  return <>
    <Dialog open={open} onOpenChange={next => { if (!next) requestClose() }}>
      <DialogContent
        dir="rtl"
        className="flex h-[90dvh] max-h-[90dvh] w-[96vw] max-w-[1280px] flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { if (showUnsavedConfirm || showDeleteConfirm || saving) event.preventDefault() }}
      >
        <UniversalToolbar
          currentRecord={recordIndex + 1}
          totalRecords={campaigns.length}
          isNewRecord={!form.id}
          isFirstRecord={recordIndex <= 0}
          isLastRecord={recordIndex < 0 || recordIndex >= campaigns.length - 1}
          isSaving={saving}
          canSave={Boolean(form.code.trim() && form.name.trim())}
          canDelete={Boolean(form.id) && !saving}
          onFirst={() => navigate(0)}
          onPrevious={() => navigate(recordIndex < 0 ? campaigns.length - 1 : recordIndex - 1)}
          onNext={() => navigate(recordIndex < 0 ? 0 : recordIndex + 1)}
          onLast={() => navigate(campaigns.length - 1)}
          onNew={() => runAfterUnsavedCheck(() => showCampaign(null))}
          onSave={() => void save()}
          onDelete={() => setShowDeleteConfirm(true)}
          onReport={onQuery ? () => runAfterUnsavedCheck(onQuery) : undefined}
        />

        <div className="flex items-center gap-3 border-b bg-slate-50 px-5 py-3 dark:bg-slate-900/60">
          <span className="rounded-xl bg-teal-600 p-2 text-white"><Megaphone size={20} /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-black">{form.id ? `تعديل الحملة ${form.name || ""}` : "حملة جديدة"}</DialogTitle>
            <DialogDescription className="text-xs">تعريف عروض البيع وشروط الأصناف والهدايا</DialogDescription>
          </div>
          <span className="rounded-full bg-white px-3 py-1 font-mono text-xs font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300" dir="ltr">{form.code}</span>
          {form.id ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span> : null}
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-4" data-enter-tab-root="true">
          <div className="sticky top-0 z-30 -mx-5 bg-white/95 px-5 pt-2 backdrop-blur dark:bg-slate-950/95"><Messages innerRef={messagesRef} /></div>
          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-4">
            <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
              <TabsTrigger value="overview">بيانات الحملة</TabsTrigger>
              <TabsTrigger value="items">الأصناف والهدايا{(buyItems.length + addedItems.length) ? ` (${buyItems.length + addedItems.length})` : ""}</TabsTrigger>
              <TabsTrigger value="scope">النطاق والملاحظات</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <section className={cardClass}>
                  {cardTitle(<Megaphone size={18} />, "تعريف الحملة", "الاسم والنوع والفئة السعرية")}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label htmlFor="campaign-code">رمز الحملة *</Label><Input id="campaign-code" dir="ltr" className="text-right" value={form.code} onChange={event => update({ code: event.target.value })} maxLength={40} /></div>
                    <div className="grid gap-2"><Label htmlFor="campaign-name">اسم الحملة *</Label><Input id="campaign-name" ref={nameRef} value={form.name} onChange={event => update({ name: event.target.value })} maxLength={160} /></div>
                    <div className="grid gap-2"><Label htmlFor="campaign-type">نوع الحملة</Label>{dropdown("campaign-type", form.type_id, campaignTypeOptions, typeId => update({ type_id: typeId, ...(typeId === 5 ? { max_campaigns: 1, condition_items_val: Math.max(1, Math.floor(Number(form.condition_items_val) || 1)) } : {}) }))}</div>
                    <div className="grid gap-2"><Label htmlFor="campaign-price-class">الفئة السعرية</Label>{dropdown("campaign-price-class", form.price_class, priceClasses, value => update({ price_class: value }), true)}</div>
                    {form.type_id === 5
                      ? <div className="grid gap-2"><Label htmlFor="campaign-first-qty">الكمية الأولى</Label>{numberInput("campaign-first-qty", form.condition_items_val, value => update({ condition_items_val: value }), { min: 1, step: 1 })}</div>
                      : <div className="grid gap-2"><Label htmlFor="campaign-max">الحد الأقصى للتطبيق في الفاتورة</Label>{numberInput("campaign-max", form.max_campaigns, value => update({ max_campaigns: value }), { min: 1, step: 1 })}</div>}
                  </div>
                  {hasInvoiceDiscount && <div className="mt-4 grid gap-4 rounded-xl bg-amber-50/70 p-3 sm:grid-cols-3 dark:bg-amber-950/30">
                    <div className="grid gap-2"><Label htmlFor="campaign-from-amount">من مبلغ</Label>{numberInput("campaign-from-amount", form.from_amount, value => update({ from_amount: value }), { min: 0 })}</div>
                    <div className="grid gap-2"><Label htmlFor="campaign-to-amount">إلى مبلغ</Label>{numberInput("campaign-to-amount", form.to_amount, value => update({ to_amount: value }), { min: 0 })}</div>
                    <div className="grid gap-2"><Label htmlFor="campaign-discount">نسبة الخصم %</Label>{numberInput("campaign-discount", form.discount_perc, value => update({ discount_perc: value }), { min: 0, max: 100 })}</div>
                  </div>}
                </section>

                <section className={cardClass}>
                  {cardTitle(<CalendarClock size={18} />, "فترة الحملة", form.time_type === 1 ? "تبدأ الحملة من تاريخ ووقت البداية وتنتهي بتاريخ ووقت النهاية" : "تعمل الحملة يومياً بين الساعتين طوال الفترة")}
                  <div className="grid gap-2"><Label htmlFor="campaign-time-type">نوع الوقت</Label>{dropdown("campaign-time-type", form.time_type, timeTypeOptions, value => update({ time_type: value }))}</div>
                  <div className="mt-4 grid gap-3">
                    {([
                      ["start", "البداية", "start_date", "from_time", form.time_type === 1 ? "وقت البداية" : "من الساعة"],
                      ["end", "النهاية", "end_date", "to_time", form.time_type === 1 ? "وقت النهاية" : "إلى الساعة"],
                    ] as const).map(([key, title, dateField, timeField, timeLabel]) => (
                      <div key={key} className="grid grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)] items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                        <span className={`mb-1 rounded-lg px-2 py-1.5 text-xs font-black ${key === "start" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{title}</span>
                        <div className="grid gap-1.5"><Label htmlFor={`campaign-${dateField}`} className="text-xs text-slate-500">التاريخ</Label><Input id={`campaign-${dateField}`} type="date" value={form[dateField] || ""} onChange={event => update({ [dateField]: event.target.value })} /></div>
                        <div className="grid gap-1.5"><Label htmlFor={`campaign-${timeField}`} className="text-xs text-slate-500">{timeLabel}</Label><Input id={`campaign-${timeField}`} type="time" value={form[timeField] || ""} onChange={event => update({ [timeField]: event.target.value })} /></div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><CalendarRange size={14} />{durationDays ? `مدة الحملة ${durationDays} يوم` : "حدد تاريخ النهاية"}{!form.from_time && !form.to_time && " · طوال اليوم"}</p>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="items" className="mt-0 space-y-4">
              {form.type_id === 2 && <section className="grid gap-3 sm:grid-cols-2">
                <div className={cardClass}><p className="text-sm text-slate-500">القيمة الأصلية</p><strong className="text-lg">{bundleOriginalTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></div>
                <div className={cardClass}><p className="text-sm text-slate-500">قيمة الحملة</p><strong className="text-lg text-teal-700">{bundleCampaignTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></div>
              </section>}
              {!hasBuyItems && !hasAddedItems && <p className="text-sm text-slate-500">هذا النوع لا يحتاج أصنافاً.</p>}
              {catalogLoading ? <p className="text-sm text-slate-500">جاري تحميل أسعار الأصناف...</p> : <>
                {hasBuyConditions && <section className={cardClass}>
                  {cardTitle(<PackagePlus size={18} />, "شروط أصناف الشراء")}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label htmlFor="campaign-buy-condition">شرط الأصناف</Label>{dropdown("campaign-buy-condition", form.condition_items_opt, buyConditionOptions, value => update({ condition_items_opt: value }))}</div>
                    {form.condition_items_opt !== 1 && <div className="grid gap-2"><Label htmlFor="campaign-buy-value">{form.condition_items_opt === 2 ? "عدد الأصناف" : "الكمية"}</Label>{numberInput("campaign-buy-value", form.condition_items_val, value => update({ condition_items_val: value }), { min: 1 })}</div>}
                  </div>
                </section>}
                {hasBuyItems && <CampaignItemsGrid title="أصناف الشراء" items={buyItems} setItems={items => { buyItemsRef.current = items; setBuyItems(items) }} products={catalogProducts} priceClass={Number(form.price_class) || 1} gridRef={buyGrid} onError={message => showMessage("error", message)} />}
                {hasAddedItems && <>
                  <section className={cardClass}>
                    {cardTitle(<PackagePlus size={18} />, "شروط الأصناف المضافة")}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2"><Label htmlFor="campaign-added-condition">شرط الإضافة</Label>{dropdown("campaign-added-condition", form.added_items_option, addedConditionOptions, value => update({ added_items_option: value }))}</div>
                      {form.added_items_option !== 1 && <div className="grid gap-2"><Label htmlFor="campaign-added-value">{form.added_items_option === 2 ? "عدد الأصناف" : "الكمية"}</Label>{numberInput("campaign-added-value", form.added_items_value, value => update({ added_items_value: value }), { min: 1 })}</div>}
                    </div>
                  </section>
                  <CampaignItemsGrid title="الأصناف المضافة / الهدايا" items={addedItems} setItems={items => { addedItemsRef.current = items; setAddedItems(items) }} products={catalogProducts} priceClass={Number(form.price_class) || 1} gridRef={addedGrid} onError={message => showMessage("error", message)} />
                </>}
              </>}
            </TabsContent>

            <TabsContent value="scope" className="mt-0 space-y-4">
              <section className={cardClass}>
                {cardTitle(<Store size={18} />, "المستودعات", form.warehouse_ids.length ? `محدد ${form.warehouse_ids.length}` : "بدون تحديد: الحملة متاحة لكل المستودعات")}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{warehouses.map(warehouse => <label key={warehouse.id} className="flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Checkbox checked={form.warehouse_ids.includes(warehouse.id)} onCheckedChange={checked => update({ warehouse_ids: checked ? [...form.warehouse_ids, warehouse.id] : form.warehouse_ids.filter(id => id !== warehouse.id) })} />{warehouse.code ? `${warehouse.code} — ` : ""}{warehouse.name}</label>)}</div>
              </section>
              <section className={cardClass}>
                {cardTitle(<Store size={18} />, "الفروع", form.branch_ids.length ? `محدد ${form.branch_ids.length}` : "بدون تحديد: الحملة متاحة لكل الفروع")}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{branches.map(branch => <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><Checkbox checked={form.branch_ids.includes(branch.id)} onCheckedChange={checked => update({ branch_ids: checked ? [...form.branch_ids, branch.id] : form.branch_ids.filter(id => id !== branch.id) })} />{branch.code ? `${branch.code} — ` : ""}{branch.name}</label>)}</div>
              </section>
              <section className={cardClass}>
                <Label htmlFor="campaign-notes">ملاحظات</Label>
                <Textarea id="campaign-notes" className="mt-2" value={form.notes} onChange={event => update({ notes: event.target.value })} rows={3} maxLength={400} />
              </section>
            </TabsContent>
          </Tabs>
        </div>
        <InlineConfirm
          open={showUnsavedConfirm}
          tone="save"
          message="تم تعديل الحملة، هل تريد حفظ التغييرات؟"
          busy={saving}
          yesLabel="نعم"
          noLabel="لا"
          backLabel="رجوع"
          onYes={async () => {
            const action = pendingActionRef.current
            setShowUnsavedConfirm(false)
            if (await save()) { pendingActionRef.current = null; action?.() }
            else pendingActionRef.current = null
          }}
          onNo={() => {
            const action = pendingActionRef.current
            pendingActionRef.current = null
            setShowUnsavedConfirm(false)
            action?.()
          }}
          onBack={() => { pendingActionRef.current = null; setShowUnsavedConfirm(false) }}
        />
        <InlineConfirm
          open={showDeleteConfirm}
          tone="delete"
          message={`هل تريد حذف الحملة ${form.name || ""}؟`}
          busy={saving}
          yesLabel="حذف"
          noLabel="إلغاء"
          onYes={() => void remove()}
          onNo={() => setShowDeleteConfirm(false)}
        />
      </DialogContent>
    </Dialog>

  </>
}

// Rendered inside the campaign popup (not as another dialog), so it is always above the popup and
// clickable whatever the workspace window / modal stacking is.
function InlineConfirm({ open, tone, message, busy, yesLabel, noLabel, backLabel, onYes, onNo, onBack }: {
  open: boolean; tone: "save" | "delete"; message: string; busy?: boolean; yesLabel: string; noLabel: string; backLabel?: string
  onYes: () => void; onNo: () => void; onBack?: () => void
}) {
  const workspaceTabActive = useWorkspaceTabActive()
  const yesRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => yesRef.current?.focus(), 30)
    const onKey = (event: KeyboardEvent) => { if (!workspaceTabActive.current) return;
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      ;(onBack ?? onNo)()
    }
    window.addEventListener("keydown", onKey, true)
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onKey, true) }
  }, [open, onBack, onNo])
  if (!open) return null
  const Icon = tone === "save" ? SaveAll : ShieldAlert
  return <div role="alertdialog" aria-modal="true" aria-label={message} className="absolute inset-0 z-[80] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <span className={`mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full ${tone === "save" ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600"}`}><Icon size={26} /></span>
      <p className="mb-5 text-base font-semibold leading-7 text-slate-700 dark:text-slate-200">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button ref={yesRef} type="button" disabled={busy} onClick={onYes} className={`rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${tone === "save" ? "bg-teal-600 hover:bg-teal-700" : "bg-rose-600 hover:bg-rose-700"}`}>{busy ? "جاري الحفظ…" : yesLabel}</button>
        <button type="button" disabled={busy} onClick={onNo} className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">{noLabel}</button>
        {onBack && backLabel && <button type="button" disabled={busy} onClick={onBack} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">{backLabel}</button>}
      </div>
    </div>
  </div>
}
