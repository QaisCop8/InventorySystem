"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Megaphone, X } from "lucide-react"
import { campaignAmounts } from "@/lib/campaign-items"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import { CampaignItemsGrid, type CampaignProduct } from "./campaign-items-grid"

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
type Product = CampaignProduct

const emptyCampaign: CampaignRecord = {
  code: "", name: "", start_date: new Date().toISOString().slice(0, 10), end_date: "",
  time_type: 1, from_time: "", to_time: "", type_id: 1, from_amount: 0, to_amount: 0,
  discount_perc: 0, condition_items_opt: 1, condition_items_val: 0, added_items_option: 1,
  added_items_value: 0, price_class: 1, max_campaigns: 1, notes: "", warehouse_ids: [], branch_ids: [],
}

type Props = {
  campaign?: CampaignRecord | null
  campaigns?: CampaignRecord[]
  products?: Product[]
  warehouses?: Warehouse[]
  branches?: Warehouse[]
  onSaved?: () => void
  onDeleted?: () => void
  onQuery?: () => void
  onCancel?: () => void
}

export default function UnifiedCampaigns({
  campaign, campaigns = [], products = [], warehouses = [], branches = [],
  onSaved = () => undefined, onDeleted = () => undefined, onQuery = () => undefined, onCancel = () => undefined,
}: Props) {
  const [form, setForm] = useState<CampaignRecord>({ ...emptyCampaign, ...(campaign || {}) })
  const [buyItems, setBuyItems] = useState<CampaignItem[]>(campaign?.items?.filter(item => item.type !== 2) || [])
  const [addedItems, setAddedItems] = useState<CampaignItem[]>(campaign?.items?.filter(item => item.type === 2) || [])
  const buyItemsRef = useRef(buyItems)
  const addedItemsRef = useRef(addedItems)
  buyItemsRef.current = buyItems
  addedItemsRef.current = addedItems
  const buyGrid = useRef<any>(null)
  const addedGrid = useRef<any>(null)
  const [catalogProducts, setCatalogProducts] = useState(products)
  const [priceClasses, setPriceClasses] = useState<{ id: number; name: string }[]>([])
  const [activeTab, setActiveTab] = useState("overview")
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    fetch(`/api/campaigns?catalog=1&price_class=${form.price_class}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setCatalogProducts(data.products || [])
        setPriceClasses([{ id: 0, name: "كل الفئات السعرية" }, ...(data.priceClasses || [])])
      })
      .catch(reason => { if (reason.name !== "AbortError") setError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false) })
    return () => controller.abort()
  }, [form.price_class])

  const update = (patch: Partial<CampaignRecord>) => setForm(current => ({ ...current, ...patch }))
  const selectedWarehouseNames = useMemo(
    () => warehouses.filter(row => form.warehouse_ids.includes(row.id)).map(row => row.name).join("، "),
    [warehouses, form.warehouse_ids],
  )
  const bundleOriginalTotal = useMemo(
    () => [...buyItems, ...addedItems].reduce((sum, item) => sum + campaignAmounts(item).qtyAmount, 0),
    [buyItems, addedItems],
  )
  const bundleCampaignTotal = useMemo(
    () => [...buyItems, ...addedItems].reduce((sum, item) => sum + campaignAmounts(item).campQtyAmount, 0),
    [buyItems, addedItems],
  )

  const showCampaign = (record: CampaignRecord | null) => {
    setForm({
      ...emptyCampaign,
      ...(record || {}),
      code: record?.code || `CMP-${Date.now().toString(36).toUpperCase()}`,
      warehouse_ids: Array.isArray(record?.warehouse_ids) ? record.warehouse_ids : [],
      branch_ids: Array.isArray(record?.branch_ids) ? record.branch_ids : [],
      start_date: String(record?.start_date || emptyCampaign.start_date).slice(0, 10),
      end_date: String(record?.end_date || "").slice(0, 10),
      from_time: String(record?.from_time || "").slice(0, 5),
      to_time: String(record?.to_time || "").slice(0, 5),
    })
    setBuyItems(record?.items?.filter(item => item.type !== 2) || [])
    setAddedItems(record?.items?.filter(item => item.type === 2) || [])
    setError("")
  }

  useEffect(() => { showCampaign(campaign || null) }, [campaign])

  const recordIndex = campaigns.findIndex(item => item.id === form.id)
  const navigate = (index: number) => { if (campaigns[index]) showCampaign(campaigns[index]) }
  const save = async () => {
    buyGrid.current?.control?.finishEditing()
    addedGrid.current?.control?.finishEditing()
    setSaving(true)
    setError("")
    try {
      if (!form.code.trim() || !form.name.trim()) throw new Error("رمز الحملة واسمها مطلوبان")
      if (!form.start_date || !form.end_date || form.start_date > form.end_date) throw new Error("حدد فترة صحيحة للحملة")
      if (form.type_id === 5 && (!Number.isInteger(Number(form.condition_items_val)) || Number(form.condition_items_val) < 1))
        throw new Error("كمية أول كمية يجب أن تكون عدداً صحيحاً موجباً")
      if (form.type_id !== 3 && !buyItemsRef.current.some(item => item.item_id)) throw new Error("أضف صنف شراء واحدًا على الأقل")
      if (![1, 5].includes(form.type_id) && !addedItemsRef.current.some(item => item.item_id) && form.discount_perc <= 0)
        throw new Error("حدد الأصناف المضافة أو نسبة الخصم")
      const response = await fetch("/api/campaigns", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          buy_items: form.type_id === 3 ? [] : buyItemsRef.current,
          added_items: [1, 5].includes(form.type_id) ? [] : addedItemsRef.current,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الحملة")
      setForm(current => ({ ...current, id: Number(data.id) }))
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ الحملة")
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!form.id || !confirm(`حذف الحملة ${form.name}؟`)) return
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

  const hasInvoiceDiscount = form.type_id === 3 || form.type_id === 4
  const hasBuyConditions = form.type_id === 2 || form.type_id === 4

  return <div dir="rtl" className="flex min-h-0 w-full flex-1 flex-col gap-3">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gradient-to-l from-slate-900 via-teal-950 to-slate-900 p-5 text-white shadow-sm">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-white/15 p-3"><Megaphone /></span><div><h2 className="text-2xl font-black">{form.id ? "تعديل الحملة" : "إضافة حملة"}</h2><p className="text-sm text-emerald-50/80">تعريف عروض البيع وشروط الأصناف والهدايا</p></div></div>
      <Button type="button" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={onCancel}><X className="ml-2 h-4 w-4" />إغلاق</Button>
    </header>
    <UniversalToolbar currentRecord={recordIndex + 1} totalRecords={campaigns.length} isNewRecord={!form.id} isFirstRecord={recordIndex <= 0} isLastRecord={recordIndex >= campaigns.length - 1} isSaving={saving} canSave={Boolean(form.code.trim() && form.name.trim())} canDelete={Boolean(form.id)} onFirst={() => navigate(0)} onPrevious={() => navigate(recordIndex - 1)} onNext={() => navigate(recordIndex + 1)} onLast={() => navigate(campaigns.length - 1)} onNew={() => showCampaign(null)} onSave={() => void save()} onDelete={() => void remove()} onReport={onQuery} />
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-3">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start gap-2 rounded-2xl bg-slate-100 p-2"><TabsTrigger value="overview">بيانات الحملة</TabsTrigger><TabsTrigger value="schedule">الوقت والشروط</TabsTrigger><TabsTrigger value="items">الأصناف والهدايا</TabsTrigger><TabsTrigger value="scope">المستودعات والفروع والملاحظات</TabsTrigger></TabsList>
        <TabsContent value="overview">
          <section className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-4 font-black">بيانات الحملة</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label>رمز الحملة *</Label><Input value={form.code} onChange={event => update({ code: event.target.value })} placeholder="CMP-001" /></div>
            <div><Label>اسم الحملة *</Label><Input value={form.name} onChange={event => update({ name: event.target.value })} /></div>
            <div><Label>من تاريخ</Label><Input type="date" value={form.start_date || ""} onChange={event => update({ start_date: event.target.value })} /></div>
            <div><Label>إلى تاريخ</Label><Input type="date" value={form.end_date || ""} onChange={event => update({ end_date: event.target.value })} /></div>
            <div><Label>نوع الحملة</Label><Select value={String(form.type_id)} onValueChange={value => { const typeId = Number(value); update({ type_id: typeId, ...(typeId === 5 ? { max_campaigns: 1, condition_items_val: Math.max(1, Math.floor(Number(form.condition_items_val) || 1)) } : {}) }) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">خصومات أسعار الأصناف</SelectItem><SelectItem value="2">خصومات حزم الأصناف</SelectItem><SelectItem value="3">خصومات إجمالي الفاتورة</SelectItem><SelectItem value="4">خصومات إجمالي أصناف</SelectItem><SelectItem value="5">أول كمية</SelectItem></SelectContent></Select></div>
            {form.type_id === 5 && <div><Label>الكمية الأولى</Label><Input type="number" min="1" step="1" value={form.condition_items_val} onChange={event => update({ condition_items_val: event.target.value === "" ? 0 : Number(event.target.value) })} /></div>}
            {hasInvoiceDiscount && <><div><Label>الخصم %</Label><Input type="number" min="0" max="100" value={form.discount_perc} onChange={event => update({ discount_perc: Number(event.target.value) })} /></div><div><Label>من مبلغ</Label><Input type="number" min="0" value={form.from_amount} onChange={event => update({ from_amount: Number(event.target.value) })} /></div><div><Label>إلى مبلغ</Label><Input type="number" min="0" value={form.to_amount} onChange={event => update({ to_amount: Number(event.target.value) })} /></div></>}
            <div><Label>فئة السعر</Label><Select value={String(form.price_class)} onValueChange={value => update({ price_class: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priceClasses.map(row => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent></Select></div>
            {form.type_id !== 5 && <div><Label>الحد الأقصى للتطبيق</Label><Input type="number" min="1" value={form.max_campaigns} onChange={event => update({ max_campaigns: Number(event.target.value) })} /></div>}
          </div></section>
        </TabsContent>
        <TabsContent value="schedule" className="space-y-5">
          <section className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 font-black">وقت الحملة</h3><div className="grid gap-3 sm:grid-cols-3">
            <div><Label>نوع الوقت</Label><Select value={String(form.time_type)} onValueChange={value => update({ time_type: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">بداية ونهاية الحملة</SelectItem><SelectItem value="2">فترة بيع يومية</SelectItem></SelectContent></Select></div>
            <div><Label>من الساعة</Label><Input type="time" value={form.from_time} onChange={event => update({ from_time: event.target.value })} /></div>
            <div><Label>إلى الساعة</Label><Input type="time" value={form.to_time} onChange={event => update({ to_time: event.target.value })} /></div>
          </div></section>
          {hasBuyConditions && <section className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 font-black">شروط أصناف الشراء</h3><div className="grid gap-3 sm:grid-cols-2">
            <div><Label>شرط الأصناف</Label><Select value={String(form.condition_items_opt)} onValueChange={value => update({ condition_items_opt: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">شراء جميع الأصناف</SelectItem><SelectItem value="2">شراء عدد من الأصناف</SelectItem><SelectItem value="3">شراء كمية محددة</SelectItem></SelectContent></Select></div>
            {form.condition_items_opt !== 1 && <div><Label>{form.condition_items_opt === 2 ? "عدد الأصناف" : "الكمية"}</Label><Input type="number" min="1" value={form.condition_items_val} onChange={event => update({ condition_items_val: Number(event.target.value) })} /></div>}
          </div></section>}
        </TabsContent>
        <TabsContent value="items" className="space-y-5">
          {form.type_id === 2 && <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">القيمة الأصلية</p><strong>{bundleOriginalTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></div><div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">قيمة الحملة</p><strong>{bundleCampaignTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></div></section>}
          {catalogLoading ? <p>جاري تحميل أسعار الأصناف...</p> : <>
            {form.type_id !== 3 && <CampaignItemsGrid title="أصناف الشراء" items={buyItems} setItems={items => { buyItemsRef.current = items; setBuyItems(items) }} products={catalogProducts} gridRef={buyGrid} />}
            {![1, 5].includes(form.type_id) && <><section className="rounded-2xl border bg-white p-4 shadow-sm"><h3 className="mb-3 font-black">شروط الأصناف المضافة</h3><div className="grid gap-3 sm:grid-cols-2">
              <div><Label>شرط الإضافة</Label><Select value={String(form.added_items_option)} onValueChange={value => update({ added_items_option: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">إضافة جميع الأصناف</SelectItem><SelectItem value="2">إضافة عدد من الأصناف</SelectItem><SelectItem value="3">إضافة كمية محددة</SelectItem></SelectContent></Select></div>
              {form.added_items_option !== 1 && <div><Label>{form.added_items_option === 2 ? "عدد الأصناف" : "الكمية"}</Label><Input type="number" min="1" value={form.added_items_value} onChange={event => update({ added_items_value: Number(event.target.value) })} /></div>}
            </div></section><CampaignItemsGrid title="الأصناف المضافة / الهدايا" items={addedItems} setItems={items => { addedItemsRef.current = items; setAddedItems(items) }} products={catalogProducts} gridRef={addedGrid} /></>}
          </>}
        </TabsContent>
        <TabsContent value="scope"><section className="rounded-2xl border bg-white p-5"><div className="mt-4">
          <Label>المستودعات</Label><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{warehouses.map(warehouse => <label key={warehouse.id} className="flex items-center gap-2 rounded-xl border p-2 text-sm"><Checkbox checked={form.warehouse_ids.includes(warehouse.id)} onCheckedChange={checked => update({ warehouse_ids: checked ? [...form.warehouse_ids, warehouse.id] : form.warehouse_ids.filter(id => id !== warehouse.id) })} />{warehouse.code ? `${warehouse.code} — ` : ""}{warehouse.name}</label>)}</div>
          {selectedWarehouseNames && <p className="mt-3 text-xs text-slate-500">النطاق المحدد: {selectedWarehouseNames}</p>}
          <div className="mt-6"><Label>الفروع</Label><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{branches.map(branch => <label key={branch.id} className="flex items-center gap-2 rounded-xl border p-2 text-sm"><Checkbox checked={form.branch_ids.includes(branch.id)} onCheckedChange={checked => update({ branch_ids: checked ? [...form.branch_ids, branch.id] : form.branch_ids.filter(id => id !== branch.id) })} />{branch.code ? `${branch.code} — ` : ""}{branch.name}</label>)}</div><p className="mt-3 text-xs text-slate-500">{form.branch_ids.length ? `الفروع المحددة: ${form.branch_ids.length}` : "بدون تحديد فروع: الحملة متاحة لكل الفروع"}</p></div>
          <div className="mt-5"><Label>ملاحظات</Label><Textarea value={form.notes} onChange={event => update({ notes: event.target.value })} rows={3} /></div>
        </div></section></TabsContent>
      </Tabs>
    </div>
  </div>
}
