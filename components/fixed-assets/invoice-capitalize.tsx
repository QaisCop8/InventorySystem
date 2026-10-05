"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Search } from "lucide-react"
import { api, DataTable, day, Field, money, n, NumberField, Select, toOptions, type Lookups, type Row } from "./shared"

export function InvoiceCapitalizeDialog({ open, lookups, onClose, onDone }: { open: boolean; lookups: Lookups; onClose: () => void; onDone: (message: string) => void }) {
  const [search, setSearch] = useState("")
  const [lines, setLines] = useState<Row[]>([])
  const [supported, setSupported] = useState(true)
  const [line, setLine] = useState<Row | null>(null)
  const [form, setForm] = useState<Row>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = (patch: Row) => setForm(current => ({ ...current, ...patch }))
  const accounts = useMemo(() => toOptions(lookups.accounts), [lookups.accounts])

  const load = async (term = search) => {
    setLoading(true)
    setError("")
    try {
      const data = await api<{ supported: boolean; lines: Row[] }>(`/api/fixed-assets/invoice-lines?search=${encodeURIComponent(term)}`)
      setSupported(data.supported)
      setLines(data.lines)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر التحميل")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (open) { setLine(null); void load("") } }, [open])

  const choose = (row: Row) => {
    const category = lookups.categories.find(item => Number(item.status) === 1)
    setLine(row)
    setForm({
      name: row.item_name, count: Math.max(1, Math.round(n(row.quantity)) || 1), amount: row.remaining_amount,
      category_id: category?.id ?? null, acquisition_date: day(row.vch_date), credit_account_id: row.line_account_id,
      useful_life_months: category?.default_useful_life_months ?? 60, activate: true,
    })
  }

  const category = lookups.categories.find(item => Number(item.id) === Number(form.category_id))
  const sameAccount = Boolean(line?.line_account_id && category?.asset_account_id && Number(line.line_account_id) === Number(category.asset_account_id))

  const submit = async () => {
    if (!line) return
    setSaving(true)
    setError("")
    try {
      const result = await api<{ created: Row[] }>("/api/fixed-assets/invoice-lines", {
        method: "POST",
        json: { ...form, line_id: line.line_id, post_acquisition_journal: sameAccount ? false : form.post_acquisition_journal !== false },
      })
      onDone(`تم إنشاء ${result.created.length} أصل: ${result.created.map(row => row.asset_no).join("، ")}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذرت الرسملة")
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={next => { if (!next && !saving) onClose() }}>
    <DialogContent dir="rtl" className="flex max-h-[92dvh] w-[96vw] max-w-5xl flex-col overflow-hidden" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>رسملة من فاتورة مشتريات</DialogTitle>
        <DialogDescription>اختر سطر فاتورة مرحّلة لتحويله إلى أصل أو عدة أصول (مثال: 5 أجهزة ← 5 أصول مستقلة).</DialogDescription>
      </DialogHeader>
      {error && <Alert variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto" data-enter-tab-root="true">
        {!line ? <>
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pr-9" value={search} placeholder="رقم الفاتورة أو الصنف أو المورد…" onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void load() }} /></div>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "بحث"}</Button>
          </div>
          {!supported ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">هيكل فواتير المشتريات في هذه الشركة لا يدعم الرسملة المباشرة — أدخل الأصل يدوياً بمصدر "فاتورة مشتريات".</p> :
          <DataTable rows={lines} onRowClick={choose} footer={false} maxHeight="55dvh" columns={[
            { key: "vch_code", label: "الفاتورة" },
            { key: "vch_date", label: "التاريخ", render: row => day(row.vch_date) },
            { key: "supplier_name", label: "المورد" },
            { key: "item_name", label: "الصنف" },
            { key: "quantity", label: "الكمية", numeric: true },
            { key: "line_amount", label: "قيمة السطر", numeric: true },
            { key: "remaining_amount", label: "غير المرسمل", numeric: true },
            { key: "line_account_name", label: "حساب السطر", render: row => row.line_account_code ? `${row.line_account_code} — ${row.line_account_name}` : "—" },
          ]} empty={loading ? "جاري التحميل…" : "لا توجد أسطر فواتير مرحّلة قابلة للرسملة"} />}
        </> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <span><b>{line.vch_code}</b> · {line.item_name} · {line.supplier_name ?? ""}</span>
            <span>غير المرسمل: <b dir="ltr">{money(line.remaining_amount)}</b></span>
            <Button size="sm" variant="ghost" onClick={() => setLine(null)}>تغيير السطر</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="التصنيف" htmlFor="fa-inv-cat" required><Select id="fa-inv-cat" value={form.category_id} options={toOptions(lookups.categories.filter(row => Number(row.status) === 1))} onChange={value => { const chosen = lookups.categories.find(row => Number(row.id) === Number(value)); set({ category_id: value, useful_life_months: chosen?.default_useful_life_months ?? form.useful_life_months }) }} /></Field>
            <Field label="اسم الأصل" htmlFor="fa-inv-name" required><Input id="fa-inv-name" value={form.name ?? ""} onChange={event => set({ name: event.target.value })} /></Field>
            <Field label="عدد الأصول" htmlFor="fa-inv-count" hint={n(form.count) > 1 ? `تكلفة كل أصل ≈ ${money(n(form.amount) / n(form.count))}` : undefined}><NumberField id="fa-inv-count" value={form.count} min={1} step="1" onChange={value => set({ count: value })} /></Field>
            <Field label="المبلغ المرسمل" htmlFor="fa-inv-amount"><NumberField id="fa-inv-amount" value={form.amount} min={0} onChange={value => set({ amount: value })} /></Field>
            <Field label="تاريخ الاقتناء" htmlFor="fa-inv-date"><Input id="fa-inv-date" type="date" value={form.acquisition_date ?? ""} onChange={event => set({ acquisition_date: event.target.value })} /></Field>
            <Field label="جاهز للاستخدام" htmlFor="fa-inv-ready"><Input id="fa-inv-ready" type="date" value={form.available_for_use_date ?? ""} onChange={event => set({ available_for_use_date: event.target.value })} /></Field>
            <Field label="العمر الإنتاجي (أشهر)" htmlFor="fa-inv-life"><NumberField id="fa-inv-life" value={form.useful_life_months} min={1} step="1" onChange={value => set({ useful_life_months: value })} /></Field>
            <Field label="الموقع" htmlFor="fa-inv-loc"><Select id="fa-inv-loc" value={form.location_id} options={toOptions(lookups.locations)} clearable onChange={value => set({ location_id: value })} /></Field>
            <Field label="مركز التكلفة" htmlFor="fa-inv-cc"><Select id="fa-inv-cc" value={form.cost_center_id} options={toOptions(lookups.costCenters)} clearable onChange={value => set({ cost_center_id: value })} /></Field>
            <Field label="الحساب الدائن (إعادة التصنيف)" htmlFor="fa-inv-credit" className="lg:col-span-2" hint={sameAccount ? "السطر مسجّل مسبقاً على حساب الأصل — لن يُنشأ قيد" : "يُنقل المبلغ من حساب سطر الفاتورة إلى حساب الأصل"}>
              <Select id="fa-inv-credit" value={form.credit_account_id} options={accounts} disabled={sameAccount} onChange={value => set({ credit_account_id: value })} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm"><span>تفعيل الأصول مباشرة</span><Switch checked={form.activate !== false} onCheckedChange={value => set({ activate: value })} /></label>
          </div>
        </>}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>إغلاق</Button>
        {line && <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => void submit()} disabled={saving || !form.category_id || !form.name}>
          {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إنشاء {Math.max(1, Math.round(n(form.count)))} أصل
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
