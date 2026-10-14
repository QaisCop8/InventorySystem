"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgePercent, CalendarRange, CreditCard, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useToast } from "@/hooks/use-toast"

type Card = {
  id: number
  card_number: string
  account_id: number
  customer_name: string
  customer_code?: string
  start_date: string
  end_date: string
  discount_percent: number
  min_invoice_amount: number
  max_discount_amount: number
  max_uses: number
  branch_id: number | null
  branch_name?: string | null
  status: number
  notes: string
  used_count: number
}

const today = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const plusYear = () => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const blank = () => ({ id: 0, card_number: "", account_id: 0, start_date: today(), end_date: plusYear(), discount_percent: 5, min_invoice_amount: 0, max_discount_amount: 0, max_uses: 0, branch_id: null as number | null, status: 1, notes: "" })
type Form = ReturnType<typeof blank>

const cardState = (card: Card) => {
  const now = today()
  if (Number(card.status) !== 1) return { label: "موقوفة", tone: "bg-slate-100 text-slate-600" }
  if (now < card.start_date) return { label: "لم تبدأ", tone: "bg-sky-100 text-sky-700" }
  if (now > card.end_date) return { label: "منتهية", tone: "bg-rose-100 text-rose-700" }
  if (card.max_uses > 0 && card.used_count >= card.max_uses) return { label: "مستنفدة", tone: "bg-amber-100 text-amber-700" }
  return { label: "فعّالة", tone: "bg-emerald-100 text-emerald-700" }
}

export default function DiscountCards() {
  const { toast } = useToast()
  const [cards, setCards] = useState<Card[]>([])
  const [branches, setBranches] = useState<{ id: number; branch_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [stateFilter, setStateFilter] = useState("all")
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [remove, setRemove] = useState<Card | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cardsResponse, branchesResponse] = await Promise.all([fetch("/api/pos/discount-cards", { cache: "no-store" }), fetch("/api/branches", { cache: "no-store" })])
      const cardsData = await cardsResponse.json().catch(() => [])
      if (!cardsResponse.ok) throw new Error(cardsData?.error || "تعذر تحميل بطاقات الخصم")
      setCards(Array.isArray(cardsData) ? cardsData : [])
      const branchesData = await branchesResponse.json().catch(() => [])
      setBranches((Array.isArray(branchesData) ? branchesData : []).filter((branch: any) => !branch.bank_id))
    } catch (reason) {
      toast({ title: "خطأ", description: reason instanceof Error ? reason.message : "تعذر التحميل", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return cards.filter((card) => {
      if (stateFilter !== "all" && cardState(card).label !== stateFilter) return false
      if (!term) return true
      return [card.card_number, card.customer_name, card.customer_code].some((value) => String(value || "").toLowerCase().includes(term))
    })
  }, [cards, query, stateFilter])

  const stats = useMemo(() => ({
    total: cards.length,
    active: cards.filter((card) => cardState(card).label === "فعّالة").length,
    used: cards.reduce((sum, card) => sum + Number(card.used_count || 0), 0),
    stopped: cards.filter((card) => Number(card.status) !== 1).length,
  }), [cards])

  const openNew = () => { setError(""); setForm(blank()) }
  const openEdit = (card: Card) => {
    setError("")
    setForm({ id: card.id, card_number: card.card_number, account_id: card.account_id, start_date: card.start_date, end_date: card.end_date, discount_percent: Number(card.discount_percent), min_invoice_amount: Number(card.min_invoice_amount), max_discount_amount: Number(card.max_discount_amount), max_uses: Number(card.max_uses), branch_id: card.branch_id, status: Number(card.status), notes: card.notes || "" })
  }
  const set = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current))

  const save = async () => {
    if (!form) return
    if (!form.account_id) { setError("اختر العميل"); return }
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/pos/discount-cards", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "تعذر الحفظ")
      toast({ title: "تم الحفظ", description: `بطاقة الخصم ${data.card_number}` })
      setForm(null)
      void load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر الحفظ")
    } finally {
      setSaving(false)
    }
  }

  const confirmRemove = async () => {
    if (!remove) return
    const response = await fetch(`/api/pos/discount-cards?id=${remove.id}`, { method: "DELETE" })
    const data = await response.json().catch(() => ({}))
    setRemove(null)
    if (!response.ok) { toast({ title: "خطأ", description: data?.error || "تعذر الحذف", variant: "destructive" }); return }
    toast({ title: data.deactivated ? "تم الإيقاف" : "تم الحذف", description: data.message || "تم حذف بطاقة الخصم" })
    void load()
  }

  const money = (value: number) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div dir="rtl" className="flex min-h-full flex-col gap-3 bg-slate-50 p-3 sm:p-4 dark:bg-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-teal-900 px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20"><BadgePercent className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-bold">بطاقات الخصم</h1>
            <p className="text-xs text-white/70">ربط العملاء ببطاقات خصم بمدة صلاحية وشروط تُطبَّق تلقائياً في كاشير نقطة البيع</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          <Button size="sm" className="bg-teal-500 hover:bg-teal-600" onClick={openNew}><Plus className="ml-1 h-4 w-4" />بطاقة جديدة</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[["عدد البطاقات", stats.total, "text-slate-800"], ["فعّالة اليوم", stats.active, "text-emerald-700"], ["مرات الاستخدام", stats.used, "text-sky-700"], ["موقوفة", stats.stopped, "text-slate-500"]].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-xl border bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-white p-3 shadow-sm dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="h-9 pr-8" placeholder="رقم البطاقة أو اسم/رقم العميل…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
            <option value="all">كل الحالات</option>
            {["فعّالة", "لم تبدأ", "منتهية", "مستنفدة", "موقوفة"].map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
            <CreditCard className="h-8 w-8 text-slate-300" />
            {cards.length ? "لا توجد بطاقات مطابقة" : "لا توجد بطاقات خصم بعد"}
            {!cards.length && <Button size="sm" variant="outline" onClick={openNew}><Plus className="ml-1 h-4 w-4" />إنشاء أول بطاقة</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-bold">
                  <th>رقم البطاقة</th><th>العميل</th><th>الخصم</th><th>الشروط</th><th>الصلاحية</th><th>الاستخدام</th><th>الحالة</th><th />
                </tr>
              </thead>
              <tbody>
                {visible.map((card) => {
                  const state = cardState(card)
                  return (
                    <tr key={card.id} className="border-t hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&>td]:px-3 [&>td]:py-2">
                      <td className="font-mono font-semibold">{card.card_number}</td>
                      <td><div className="font-medium">{card.customer_name}</div><div className="text-xs text-slate-500">{card.customer_code}</div></td>
                      <td><span className="rounded-md bg-teal-50 px-2 py-0.5 font-bold text-teal-700">{Number(card.discount_percent)}%</span></td>
                      <td className="text-xs leading-5 text-slate-600">
                        {Number(card.min_invoice_amount) > 0 && <div>الفاتورة أكثر من {money(card.min_invoice_amount)}</div>}
                        {Number(card.max_discount_amount) > 0 && <div>الخصم حتى {money(card.max_discount_amount)}</div>}
                        {card.branch_name && <div>فرع {card.branch_name}</div>}
                        {!(Number(card.min_invoice_amount) > 0) && !(Number(card.max_discount_amount) > 0) && !card.branch_name && <span className="text-slate-400">بدون شروط</span>}
                      </td>
                      <td className="whitespace-nowrap text-xs"><CalendarRange className="ml-1 inline h-3.5 w-3.5 text-slate-400" />{card.start_date} ← {card.end_date}</td>
                      <td className="tabular-nums">{card.used_count}{card.max_uses > 0 ? ` / ${card.max_uses}` : ""}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.tone}`}>{state.label}</span></td>
                      <td className="whitespace-nowrap text-left">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="تعديل" onClick={() => openEdit(card)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50" aria-label="حذف" onClick={() => setRemove(card)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(form)} onOpenChange={(open) => { if (!open && !saving) setForm(null) }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] w-[94vw] max-w-2xl overflow-y-auto" onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BadgePercent className="h-5 w-5 text-teal-600" />{form?.id ? "تعديل بطاقة خصم" : "بطاقة خصم جديدة"}</DialogTitle>
            <DialogDescription>تُطبَّق البطاقة في الكاشير عند اختيار العميل أو مسح رقم البطاقة، ضمن مدة الصلاحية وبعد تحقق الشروط.</DialogDescription>
          </DialogHeader>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          {form && (
            <div className="grid gap-3 sm:grid-cols-2 [&_label]:text-xs">
              <div className="sm:col-span-2">
                <Label>العميل *</Label>
                <AutoCompleteAccount valueMode="id" value={form.account_id ? String(form.account_id) : ""} onValueChange={(value) => set({ account_id: Number(value) || 0 })} showCostCenterButton={false} searchAllowedTypeValues={[2, 3, 5]} />
              </div>
              <div>
                <Label>رقم البطاقة</Label>
                <Input dir="ltr" className="text-right font-mono" placeholder="يُولَّد تلقائياً إن تُرك فارغاً" value={form.card_number} onChange={(event) => set({ card_number: event.target.value })} />
              </div>
              <div>
                <Label>الفرع (اختياري)</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.branch_id ?? ""} onChange={(event) => set({ branch_id: Number(event.target.value) || null })}>
                  <option value="">كل الفروع</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}
                </select>
              </div>
              <div><Label>من تاريخ *</Label><Input type="date" value={form.start_date} onChange={(event) => set({ start_date: event.target.value })} /></div>
              <div><Label>إلى تاريخ *</Label><Input type="date" min={form.start_date} value={form.end_date} onChange={(event) => set({ end_date: event.target.value })} /></div>
              <div><Label>نسبة الخصم % *</Label><Input type="number" min={0.01} max={100} step="0.01" value={form.discount_percent} onChange={(event) => set({ discount_percent: Number(event.target.value) })} /></div>
              <div>
                <Label>مبلغ الفاتورة يجب أن يزيد عن</Label>
                <Input type="number" min={0} step="0.01" value={form.min_invoice_amount} onChange={(event) => set({ min_invoice_amount: Number(event.target.value) })} />
                <p className="mt-0.5 text-[11px] text-slate-500">0 = بدون حد أدنى</p>
              </div>
              <div>
                <Label>الحد الأقصى لمبلغ الخصم</Label>
                <Input type="number" min={0} step="0.01" value={form.max_discount_amount} onChange={(event) => set({ max_discount_amount: Number(event.target.value) })} />
                <p className="mt-0.5 text-[11px] text-slate-500">0 = بدون سقف</p>
              </div>
              <div>
                <Label>عدد مرات الاستخدام المسموح</Label>
                <Input type="number" min={0} step="1" value={form.max_uses} onChange={(event) => set({ max_uses: Math.trunc(Number(event.target.value)) })} />
                <p className="mt-0.5 text-[11px] text-slate-500">0 = غير محدود</p>
              </div>
              <div>
                <Label>الحالة</Label>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.status} onChange={(event) => set({ status: Number(event.target.value) })}>
                  <option value={1}>فعّالة</option>
                  <option value={2}>موقوفة</option>
                </select>
              </div>
              <div className="sm:col-span-2"><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} /></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>إلغاء</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialogYesNo
        visible={Boolean(remove)}
        useAppDialog
        title="حذف بطاقة خصم"
        message={remove ? `حذف بطاقة الخصم ${remove.card_number} للعميل ${remove.customer_name}؟ إن كانت مستخدمة في فواتير فستُوقف بدل حذفها.` : ""}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemove(null)}
      />
    </div>
  )
}
