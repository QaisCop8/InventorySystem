"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgePercent, CalendarRange, Gift, Pause, Pencil, Play, Plus, RefreshCw, Search, Tag, Trash2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"

// العروض والأسعار الخاصة (lib/promotions.ts): تعريف العروض التي تُطبَّق تلقائياً في فاتورة/إرسالية المبيعات.

type PromotionRow = {
  id: number; code: string; name: string; promo_type: number; start_date: string; end_date: string | null
  status: number; priority: number; all_customers: boolean; item_count: number; customer_count: number
}
type Unit = { unit_id: number; unit_name: string }
type ItemDraft = {
  product_id: number | null; product_code?: string; product_name?: string; unit_id: number | null; units?: Unit[]
  special_price?: string; discount_percent?: string; min_quantity?: string
  buy_quantity?: string; get_product_id?: number | null; get_product_code?: string; get_product_name?: string
  get_unit_id?: number | null; get_units?: Unit[]; get_quantity?: string; max_times?: string
}
type Draft = {
  id?: number; code: string; name: string; promo_type: number; start_date: string; end_date: string; status: number; priority: string
  all_customers: boolean; customers: { account_id: number; account_code: string; account_name: string }[]
  currency_id: string; vch_types: number[]; branch_ids: number[]; notes: string; items: ItemDraft[]
}
type Lookup = { customers: { id: number; code: string; name: string }[]; branches: { id: number; name: string }[]; currencies: { id: number; code: string; name: string }[] }

const TYPES = [
  { value: 1, label: "سعر خاص", hint: "سعر ثابت لصنف لعملاء محددين أو للجميع", icon: Tag, tone: "text-sky-700 bg-sky-50 border-sky-200" },
  { value: 2, label: "خصم لفترة", hint: "نسبة خصم على صنف أو كل الأصناف ضمن فترة", icon: BadgePercent, tone: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: 3, label: "اشترِ واحصل مجاناً", hint: "كل كمية من صنف تمنح كمية مجانية (بونص)", icon: Gift, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
]
const VCH_TYPES = [{ value: 12, label: "فاتورة مبيعات" }, { value: 13, label: "إرسالية مبيعات" }, { value: 14, label: "إرسالية برسم البيع" }]
const today = () => new Date().toISOString().slice(0, 10)
const emptyItem = (): ItemDraft => ({ product_id: null, unit_id: null, min_quantity: "", special_price: "", discount_percent: "", buy_quantity: "", get_quantity: "", max_times: "" })
const emptyDraft = (): Draft => ({
  code: "", name: "", promo_type: 1, start_date: today(), end_date: "", status: 1, priority: "0", all_customers: true, customers: [],
  currency_id: "", vch_types: [12, 13, 14], branch_ids: [], notes: "", items: [emptyItem()],
})
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value))

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

const unitsOf = async (productId: number): Promise<Unit[]> => {
  const data = await fetch(`/api/products/${productId}/units?price_category_id=1`).then((response) => (response.ok ? response.json() : [])).catch(() => [])
  return (Array.isArray(data) ? data : []).map((unit: any) => ({ unit_id: Number(unit.unit_id), unit_name: String(unit.unit_name || "") })).filter((unit: Unit) => unit.unit_id > 0)
}

const statusOf = (row: PromotionRow) => {
  if (Number(row.status) === 2) return { label: "مجمّد", tone: "bg-slate-200 text-slate-600" }
  const now = today()
  if (row.start_date > now) return { label: "قادم", tone: "bg-sky-100 text-sky-700" }
  if (row.end_date && row.end_date < now) return { label: "منتهٍ", tone: "bg-slate-100 text-slate-500" }
  return { label: "فعّال", tone: "bg-emerald-100 text-emerald-700" }
}

export default function Promotions() {
  const { toast } = useToast()
  const [rows, setRows] = useState<PromotionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState(0)
  const [editing, setEditing] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows((await api<{ rows: PromotionRow[] }>("/api/promotions")).rows || []) }
    catch (error) { toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
    finally { setLoading(false) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => (!typeFilter || Number(row.promo_type) === typeFilter) && (!query || `${row.code} ${row.name}`.toLowerCase().includes(query)))
  }, [rows, search, typeFilter])

  const openEditor = async (row?: PromotionRow) => {
    if (!row) { setEditing(emptyDraft()); return }
    try {
      const data = await api<any>(`/api/promotions/${row.id}`)
      const items: ItemDraft[] = await Promise.all((data.items || []).map(async (item: any) => ({
        product_id: item.product_id, product_code: item.product_code, product_name: item.product_name, unit_id: item.unit_id,
        units: item.product_id ? await unitsOf(item.product_id) : [],
        special_price: str(item.special_price), discount_percent: str(item.discount_percent), min_quantity: Number(item.min_quantity) ? str(item.min_quantity) : "",
        buy_quantity: str(item.buy_quantity), get_quantity: str(item.get_quantity), max_times: Number(item.max_times) ? str(item.max_times) : "",
        get_product_id: item.get_product_id, get_product_code: item.get_product_code, get_product_name: item.get_product_name, get_unit_id: item.get_unit_id,
        get_units: item.get_product_id ? await unitsOf(item.get_product_id) : [],
      })))
      setEditing({
        id: data.id, code: data.code, name: data.name, promo_type: Number(data.promo_type), start_date: data.start_date, end_date: data.end_date || "",
        status: Number(data.status), priority: str(data.priority), all_customers: Boolean(data.all_customers), customers: data.customers || [],
        currency_id: str(data.currency_id), vch_types: data.vch_types || [12, 13, 14], branch_ids: data.branch_ids || [], notes: data.notes || "",
        items: items.length ? items : [emptyItem()],
      })
    } catch (error) {
      toast({ title: "تعذر فتح العرض", description: error instanceof Error ? error.message : "", variant: "destructive" })
    }
  }

  const toggleStatus = async (row: PromotionRow) => {
    try { await api(`/api/promotions/${row.id}`, { method: "PUT", body: JSON.stringify({ status: Number(row.status) === 2 ? 1 : 2 }) }); await load() }
    catch (error) { toast({ title: "تعذر التحديث", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
  }
  const remove = async (row: PromotionRow) => {
    if (!(await confirmYesNo(`حذف العرض «${row.name}»؟`))) return
    try { await api(`/api/promotions/${row.id}`, { method: "DELETE" }); await load() }
    catch (error) { toast({ title: "تعذر الحذف", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
  }

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Gift className="h-6 w-6 text-emerald-600" />العروض والأسعار الخاصة</h1>
          <p className="mt-1 text-sm text-muted-foreground">أسعار خاصة للعملاء، خصومات لفترة، و«اشترِ واحصل مجاناً» — تُطبَّق تلقائياً في فاتورة وإرسالية المبيعات.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          <Button onClick={() => void openEditor()}><Plus className="ml-2 h-4 w-4" />عرض جديد</Button>
        </div>
      </div>

      <Card><CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث برقم العرض أو اسمه..." /></div>
        <div className="flex overflow-hidden rounded-lg border text-xs">
          {[{ value: 0, label: "الكل" }, ...TYPES].map((type) => (
            <button key={type.value} type="button" onClick={() => setTypeFilter(type.value)} className={`px-3 py-2 ${typeFilter === type.value ? "bg-slate-800 text-white" : "hover:bg-slate-50"}`}>{type.label}</button>
          ))}
        </div>
      </CardContent></Card>

      {loading ? <div className="py-16 text-center text-muted-foreground">جاري التحميل...</div> : visible.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-16 text-center">
          <Gift className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-bold">لا توجد عروض</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">أضف أول عرض: سعر خاص لعميل، خصم موسمي، أو صنف مجاني.</p>
          <Button onClick={() => void openEditor()}><Plus className="ml-2 h-4 w-4" />عرض جديد</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((row) => {
            const type = TYPES.find((item) => item.value === Number(row.promo_type)) || TYPES[0]
            const status = statusOf(row)
            const Icon = type.icon
            return (
              <Card key={row.id} className="transition hover:shadow-md">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-slate-500">{row.code}</div>
                      <div className="truncate font-bold">{row.name}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>{status.label}</span>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${type.tone}`}><Icon className="h-3.5 w-3.5" />{type.label}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" />{row.start_date} ← {row.end_date || "مفتوح"}</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{row.all_customers ? "كل العملاء" : `${row.customer_count} عميل`}</span>
                    <span>{row.item_count} سطر</span>
                    {Number(row.priority) > 0 && <span>أولوية {row.priority}</span>}
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => void openEditor(row)}><Pencil className="ml-1.5 h-3.5 w-3.5" />تعديل</Button>
                    <Button size="sm" variant="outline" title={Number(row.status) === 2 ? "تفعيل" : "تجميد"} onClick={() => void toggleStatus(row)}>{Number(row.status) === 2 ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}</Button>
                    <Button size="sm" variant="outline" className="text-rose-600" title="حذف" onClick={() => void remove(row)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {editing && <PromotionEditor draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />}
    </div>
  )
}

function PromotionEditor({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<Draft>(initial)
  const [lookup, setLookup] = useState<Lookup>({ customers: [], branches: [], currencies: [] })
  const [saving, setSaving] = useState(false)
  const [picker, setPicker] = useState<{ index: number; field: "product" | "get" } | null>(null)
  const [customerCode, setCustomerCode] = useState("")

  useEffect(() => { void api<Lookup>("/api/promotions?lookup=1").then(setLookup).catch(() => undefined) }, [])

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const setItem = (index: number, patch: Partial<ItemDraft>) => setDraft((current) => ({ ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }))
  const type = draft.promo_type

  // اختيار أصناف من نافذة البحث: حقل "الصنف" يقبل عدة أصناف — الأول يملأ السطر المختار، والبقية تُضاف أسطراً
  // جديدة بعده بنفس قاعدة السطر (الخصم/الحد الأدنى/اشترِ-احصل) دون السعر الخاص، وتُتخطّى الأصناف الموجودة مسبقاً.
  // حقل "الصنف المجاني" يبقى صنفاً واحداً.
  const pickProduct = async (products: any[]) => {
    const target = picker
    setPicker(null)
    const picked = (products || []).filter((product) => Number(product?.id) > 0)
    if (!target || !picked.length) return
    const unitIdOf = (product: any, units: Unit[]) => Number(product.selected_unit?.unit_id) || units[0]?.unit_id || null
    if (target.field === "get") {
      const product = picked[0]
      const units = await unitsOf(Number(product.id))
      setItem(target.index, { get_product_id: Number(product.id), get_product_code: product.product_code, get_product_name: product.product_name, get_units: units, get_unit_id: unitIdOf(product, units) })
      return
    }
    const unitsList = await Promise.all(picked.map((product) => unitsOf(Number(product.id))))
    setDraft((current) => {
      const items = [...current.items]
      const base = items[target.index] ?? emptyItem()
      const taken = new Set(items.filter((_, index) => index !== target.index).map((item) => Number(item.product_id)).filter((id) => id > 0))
      const rows: ItemDraft[] = []
      picked.forEach((product, index) => {
        const id = Number(product.id)
        if (taken.has(id)) return
        taken.add(id)
        const units = unitsList[index]
        const fields = { product_id: id, product_code: product.product_code, product_name: product.product_name, units, unit_id: unitIdOf(product, units) }
        rows.push(rows.length === 0 ? { ...base, ...fields } : { ...base, special_price: "", ...fields })
      })
      if (!rows.length) return current
      items.splice(target.index, 1, ...rows)
      return { ...current, items }
    })
    if (picked.length > 1) toast({ title: "أُضيفت الأصناف المختارة إلى العرض (المكرر يُتخطّى)" })
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        code: draft.code, name: draft.name, promo_type: type, start_date: draft.start_date, end_date: draft.end_date || null, status: draft.status,
        priority: Number(draft.priority) || 0, all_customers: draft.all_customers, customer_ids: draft.customers.map((customer) => customer.account_id),
        currency_id: Number(draft.currency_id) || null, vch_types: draft.vch_types, branch_ids: draft.branch_ids, notes: draft.notes,
        items: draft.items.filter((item) => item.product_id || (type === 2 && item.discount_percent)).map((item) => ({
          product_id: item.product_id, unit_id: item.unit_id, special_price: item.special_price, discount_percent: item.discount_percent, min_quantity: item.min_quantity,
          buy_quantity: item.buy_quantity, get_product_id: item.get_product_id, get_unit_id: item.get_unit_id, get_quantity: item.get_quantity, max_times: item.max_times,
        })),
      }
      if (draft.id) await api(`/api/promotions/${draft.id}`, { method: "PUT", body: JSON.stringify(body) })
      else await api("/api/promotions", { method: "POST", body: JSON.stringify(body) })
      toast({ title: "تم حفظ العرض" })
      onSaved()
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const toggle = (list: number[], value: number) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent dir="rtl" className="flex max-h-[94vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader className="border-b px-5 py-3"><DialogTitle>{draft.id ? `تعديل العرض ${draft.code}` : "عرض جديد"}</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {/* نوع العرض */}
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((option) => {
              const Icon = option.icon
              const active = type === option.value
              return (
                <button key={option.value} type="button" disabled={Boolean(draft.id)} onClick={() => set({ promo_type: option.value, items: [emptyItem()] })}
                  className={`rounded-xl border-2 p-3 text-right transition ${active ? option.tone + " border-current" : "border-slate-200 hover:bg-slate-50"} ${draft.id && !active ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-2 font-bold"><Icon className="h-4 w-4" />{option.label}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{option.hint}</div>
                </button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2"><Label>اسم العرض *</Label><Input value={draft.name} onChange={(event) => set({ name: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>رقم العرض</Label><Input value={draft.code} onChange={(event) => set({ code: event.target.value.toUpperCase() })} placeholder="تلقائي" /></div>
            <div className="space-y-1.5"><Label>الأولوية</Label><Input inputMode="numeric" value={draft.priority} onChange={(event) => set({ priority: event.target.value.replace(/\D/g, "") })} title="عند تعارض عرضين على نفس الصنف يُطبَّق الأعلى أولوية" /></div>
            <div className="space-y-1.5"><Label>من تاريخ *</Label><Input type="date" value={draft.start_date} onChange={(event) => set({ start_date: event.target.value })} /></div>
            <div className="space-y-1.5"><Label>إلى تاريخ</Label><Input type="date" value={draft.end_date} onChange={(event) => set({ end_date: event.target.value })} /></div>
            {type === 1 && (
              <div className="space-y-1.5"><Label>عملة السعر</Label>
                <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={draft.currency_id} onChange={(event) => set({ currency_id: event.target.value })}>
                  <option value="">عملة الأساس</option>
                  {lookup.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.code} — {currency.name}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.status === 1} onChange={(event) => set({ status: event.target.checked ? 1 : 2 })} />فعّال</label>
          </div>

          {/* النطاق */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center justify-between"><Label className="font-bold">العملاء</Label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.all_customers} onChange={(event) => set({ all_customers: event.target.checked })} />كل العملاء</label>
              </div>
              {!draft.all_customers && (
                <>
                  <AutoCompleteAccount label="" value={customerCode} placeholder="أضف عميلاً..." showCostCenterButton={false} searchAllowedTypeValues={[2, 5]}
                    onValueChange={setCustomerCode}
                    onAccountSelect={(account) => {
                      if (!account) return
                      setDraft((current) => current.customers.some((customer) => customer.account_id === account.id) ? current
                        : { ...current, customers: [...current.customers, { account_id: account.id, account_code: account.code, account_name: account.name }] })
                      setCustomerCode("")
                    }} />
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {draft.customers.length === 0 && <span className="text-xs text-slate-400">لم يُختر أي عميل</span>}
                    {draft.customers.map((customer) => (
                      <span key={customer.account_id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {customer.account_name} <span className="font-mono text-slate-400">{customer.account_code}</span>
                        <button type="button" onClick={() => set({ customers: draft.customers.filter((item) => item.account_id !== customer.account_id) })}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="space-y-3 rounded-xl border p-3">
              <div><Label className="font-bold">الحركات</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {VCH_TYPES.map((option) => (
                    <label key={option.value} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={draft.vch_types.includes(option.value)} onChange={() => set({ vch_types: toggle(draft.vch_types, option.value) })} />{option.label}</label>
                  ))}
                </div>
              </div>
              <div><Label className="font-bold">الفروع</Label> <span className="text-xs text-slate-400">(بلا اختيار = كل الفروع)</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {lookup.branches.map((branch) => (
                    <button key={branch.id} type="button" onClick={() => set({ branch_ids: toggle(draft.branch_ids, branch.id) })}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${draft.branch_ids.includes(branch.id) ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200"}`}>{branch.name}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* الأسطر */}
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
              <span className="font-bold">{type === 1 ? "الأصناف والأسعار الخاصة" : type === 2 ? "الخصومات" : "اشترِ ← واحصل مجاناً"}</span>
              <Button size="sm" variant="outline" onClick={() => set({ items: [...draft.items, emptyItem()] })}><Plus className="ml-1 h-3.5 w-3.5" />سطر</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b">
                    <th className="p-2 text-right">{type === 3 ? "الصنف المشترى" : "الصنف"}</th>
                    <th className="w-32 p-2 text-right">الوحدة</th>
                    {type === 1 && <th className="w-32 p-2">السعر الخاص</th>}
                    {type === 2 && <th className="w-28 p-2">الخصم %</th>}
                    {type !== 3 && <th className="w-28 p-2" title="مجموع كمية الصنف في الحركة">حد أدنى للكمية</th>}
                    {type === 3 && <><th className="w-24 p-2">كل كمية</th><th className="p-2 text-right">الصنف المجاني</th><th className="w-24 p-2">مجاناً</th><th className="w-24 p-2" title="0 = بلا حد">أقصى مرات</th></>}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((item, index) => (
                    <tr key={index} className="border-b last:border-0">
                      <td className="p-2">
                        <button type="button" onClick={() => setPicker({ index, field: "product" })} className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-right hover:bg-slate-50">
                          <span className="truncate">{item.product_id ? <>{item.product_name} <span className="font-mono text-xs text-slate-400">{item.product_code}</span></> : <span className="text-slate-400">{type === 2 ? "كل الأصناف (أو اختر صنفاً)" : "اختر الصنف..."}</span>}</span>
                          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </button>
                        {type === 2 && item.product_id && <button type="button" className="mt-1 text-[11px] text-slate-500 underline" onClick={() => setItem(index, { product_id: null, product_code: "", product_name: "", unit_id: null, units: [] })}>كل الأصناف</button>}
                      </td>
                      <td className="p-2">
                        <select className="h-8 w-full rounded-md border bg-white px-1 text-sm" value={item.unit_id ?? ""} disabled={!item.product_id} onChange={(event) => setItem(index, { unit_id: Number(event.target.value) || null })}>
                          <option value="">{type === 1 ? "كل الوحدات" : "أي وحدة"}</option>
                          {(item.units || []).map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.unit_name}</option>)}
                        </select>
                      </td>
                      {type === 1 && <td className="p-2"><Input className="h-8 text-center" inputMode="decimal" value={item.special_price} onChange={(event) => setItem(index, { special_price: event.target.value })} /></td>}
                      {type === 2 && <td className="p-2"><Input className="h-8 text-center" inputMode="decimal" value={item.discount_percent} onChange={(event) => setItem(index, { discount_percent: event.target.value })} /></td>}
                      {type !== 3 && <td className="p-2"><Input className="h-8 text-center" inputMode="decimal" value={item.min_quantity} placeholder="0" onChange={(event) => setItem(index, { min_quantity: event.target.value })} /></td>}
                      {type === 3 && (
                        <>
                          <td className="p-2"><Input className="h-8 text-center" inputMode="decimal" value={item.buy_quantity} onChange={(event) => setItem(index, { buy_quantity: event.target.value })} /></td>
                          <td className="p-2">
                            <button type="button" onClick={() => setPicker({ index, field: "get" })} className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-right hover:bg-slate-50">
                              <span className="truncate">{item.get_product_id && item.get_product_id !== item.product_id ? <>{item.get_product_name} <span className="font-mono text-xs text-slate-400">{item.get_product_code}</span></> : <span className="text-slate-500">نفس الصنف (بونص)</span>}</span>
                              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            </button>
                            {item.get_product_id && item.get_product_id !== item.product_id && (
                              <div className="mt-1 flex items-center gap-2">
                                <select className="h-7 flex-1 rounded-md border bg-white px-1 text-xs" value={item.get_unit_id ?? ""} onChange={(event) => setItem(index, { get_unit_id: Number(event.target.value) || null })}>
                                  {(item.get_units || []).map((unit) => <option key={unit.unit_id} value={unit.unit_id}>{unit.unit_name}</option>)}
                                </select>
                                <button type="button" className="text-[11px] text-slate-500 underline" onClick={() => setItem(index, { get_product_id: null, get_product_code: "", get_product_name: "", get_unit_id: null, get_units: [] })}>نفس الصنف</button>
                              </div>
                            )}
                          </td>
                          <td className="p-2"><Input className="h-8 text-center" inputMode="decimal" value={item.get_quantity} onChange={(event) => setItem(index, { get_quantity: event.target.value })} /></td>
                          <td className="p-2"><Input className="h-8 text-center" inputMode="numeric" value={item.max_times} placeholder="0" onChange={(event) => setItem(index, { max_times: event.target.value.replace(/\D/g, "") })} /></td>
                        </>
                      )}
                      <td className="p-2 text-center">
                        <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => set({ items: draft.items.length > 1 ? draft.items.filter((_, i) => i !== index) : [emptyItem()] })}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-slate-50/60 px-3 py-2 text-[11px] text-slate-500">
              {type === 1 && "السعر يُدخل كما تُدخل أسعار الأصناف (حسب إعداد شمول الضريبة) ويُطبَّق فقط إذا طابقت عملة السند عملة السعر."}
              {type === 2 && "الحد الأدنى = مجموع كمية الصنف في الحركة. السطر بلا صنف يطبّق الخصم على كل الأصناف."}
              {type === 3 && "مثال: كل 10 → 1 مجاناً. نفس الصنف يُضاف كبونص على السطر؛ صنف آخر يُضاف سطراً بخصم 100%."}
            </div>
          </div>

          <div className="space-y-1.5"><Label>ملاحظات</Label><Textarea rows={2} value={draft.notes} onChange={(event) => set({ notes: event.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => void save()} disabled={saving || !draft.name.trim()}>{saving ? "جاري الحفظ..." : "حفظ العرض"}</Button>
        </div>
        <ProductSearchPopup open={Boolean(picker)} onClose={() => setPicker(null)} onSelect={(products) => void pickProduct(products as any[])} title="اختر الصنف" />
      </DialogContent>
    </Dialog>
  )
}
