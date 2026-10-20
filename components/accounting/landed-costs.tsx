"use client"

import { confirmYesNo } from "@/components/ui/confirm-host"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, Ban, FileSearch, PackagePlus, Plus, RefreshCw, Save, Search, Ship, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import AutoCompleteAccount from "@/components/customer/auto-complete-account"
import { useToast } from "@/hooks/use-toast"

// تحميل تكاليف الشحن والجمارك على الأصناف: بنود تكاليف (شحن/جمارك/تخليص/تأمين) على فاتورة مشتريات تُوزَّع
// على أصنافها حسب القيمة أو الكمية أو الوزن، فتدخل في كلفة الصنف وتقييم المخزون وتقارير الأرباح.
// الحفظ يُنشئ قيداً آلياً (مدين المخزون/المشتريات، دائن حساب كل بند). للتعديل: إلغاء المستند وإنشاء غيره.

type Option = { value: string; label: string }
type Meta = {
  currencies: { id: number; currency_code: string; currency_name: string }[]
  branches: { id: number; name: string }[]
  base_currency_id: number | null
  default_debit_account_id: number | null
  methods: Option[]
  charge_types: Option[]
}
type ListRow = {
  id: number; code: string; doc_date: string; method: string; total_amount: number; status: number; note: string | null
  purchase_code: string; supplier_name: string; currency_code: string; journal_code: string | null; branch_name: string | null; charge_types: string | null
}
type PurchaseRow = { id: number; vch_code: string; vch_date: string; supplier_name: string; currency_code: string; amount: number; landed_count: number }
type PurchaseLine = {
  id: number; product_code: string; product_name: string; unit_name: string; qnty: number; bonus: number; unit_factor: number
  basis_value: number; basis_quantity: number; basis_weight: number; allocated_before: number
}
type PurchaseData = { header: any; lines: PurchaseLine[] }
type Charge = { key: number; charge_type: string; account_id: string; amount: string; reference: string; note: string }

const today = () => new Date().toISOString().slice(0, 10)
const num = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
const money = (value: unknown, digits = 2) => num(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
let chargeKey = 1
const emptyCharge = (charge_type = "freight"): Charge => ({ key: chargeKey++, charge_type, account_id: "", amount: "", reference: "", note: "" })

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`)
  return data as T
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

export default function LandedCosts() {
  const { toast } = useToast()
  const [meta, setMeta] = useState<Meta | null>(null)
  const [rows, setRows] = useState<ListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"list" | "new" | "view">("list")
  const [viewId, setViewId] = useState<number | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [metaData, list] = await Promise.all([api<Meta>("/api/landed-costs?meta=1"), api<{ rows: ListRow[] }>("/api/landed-costs")])
      setMeta(metaData); setRows(list.rows || [])
    } catch (error) {
      toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally { setLoading(false) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const methodLabel = (value: string) => meta?.methods.find((method) => method.value === value)?.label || value
  const chargeLabel = (value: string) => meta?.charge_types.find((type) => type.value === value)?.label || value
  const visible = rows.filter((row) => showCancelled || Number(row.status) !== 3)

  if (mode === "new" && meta) return <LandedCostEditor meta={meta} onBack={() => setMode("list")} onSaved={(id) => { setViewId(id); setMode("view"); void load() }} />
  if (mode === "view" && viewId && meta) return <LandedCostView id={viewId} meta={meta} onBack={() => { setMode("list"); void load() }} />

  return (
    <div dir="rtl" className="space-y-5 p-3 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Ship className="h-6 w-6 text-teal-600" />تحميل تكاليف الشحن والجمارك</h1>
          <p className="mt-1 text-sm text-muted-foreground">وزّع الشحن والجمارك والتخليص والتأمين على أصناف فاتورة المشتريات لتصبح كلفة الصنف حقيقية في تقييم المخزون وأرباح الأصناف.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          <Button onClick={() => setMode("new")} disabled={!meta}><Plus className="ml-2 h-4 w-4" />مستند جديد</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-bold">المستندات</span>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={showCancelled} onChange={(event) => setShowCancelled(event.target.checked)} />إظهار الملغاة</label>
          </div>
          {loading ? <div className="p-10 text-center text-muted-foreground">جاري تحميل البيانات...</div> : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">لا توجد مستندات تكاليف بعد</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="p-3 text-right">الرقم</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">فاتورة المشتريات</th>
                    <th className="p-3 text-right">المورد</th><th className="p-3 text-right">البنود</th><th className="p-3 text-right">التوزيع</th>
                    <th className="p-3 text-left">المبلغ</th><th className="p-3 text-right">القيد</th><th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className={`cursor-pointer border-t hover:bg-teal-50/50 ${Number(row.status) === 3 ? "text-slate-400" : ""}`} onClick={() => { setViewId(row.id); setMode("view") }}>
                      <td className="p-3 font-mono font-semibold">{row.code}</td>
                      <td className="p-3 font-mono">{row.doc_date}</td>
                      <td className="p-3 font-mono">{row.purchase_code}</td>
                      <td className="p-3">{row.supplier_name || "—"}</td>
                      <td className="p-3">{String(row.charge_types || "").split(",").filter(Boolean).map(chargeLabel).join("، ")}</td>
                      <td className="p-3">{methodLabel(row.method)}</td>
                      <td className="p-3 text-left font-mono">{money(row.total_amount)} <span className="text-xs text-muted-foreground">{row.currency_code}</span></td>
                      <td className="p-3 font-mono">{row.journal_code || "—"}</td>
                      <td className="p-3 text-center">{Number(row.status) === 3
                        ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">ملغى</span>
                        : <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">فعّال</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LandedCostEditor({ meta, onBack, onSaved }: { meta: Meta; onBack: () => void; onSaved: (id: number) => void }) {
  const { toast } = useToast()
  const [docDate, setDocDate] = useState(today())
  const [branchId, setBranchId] = useState("")
  const [currencyId, setCurrencyId] = useState(String(meta.base_currency_id || meta.currencies[0]?.id || ""))
  const [rate, setRate] = useState("1")
  const [method, setMethod] = useState("value")
  const [debitAccountId, setDebitAccountId] = useState(meta.default_debit_account_id ? String(meta.default_debit_account_id) : "")
  const [note, setNote] = useState("")
  const [charges, setCharges] = useState<Charge[]>([emptyCharge("freight"), emptyCharge("customs")])
  const [purchase, setPurchase] = useState<PurchaseData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!currencyId) return
    let cancelled = false
    api<{ rate: number }>(`/api/exchange-rates/lookup?currency_id=${currencyId}&date=${docDate}`)
      .then((data) => { if (!cancelled) setRate(String(num(data.rate) || 1)) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [currencyId, docDate])

  const choosePurchase = async (id: number) => {
    setPickerOpen(false)
    try {
      const data = await api<PurchaseData>(`/api/landed-costs?purchase_id=${id}`)
      setPurchase(data)
      if (!branchId && data.header?.branch_id) setBranchId(String(data.header.branch_id))
    } catch (error) {
      toast({ title: "تعذر تحميل الفاتورة", description: error instanceof Error ? error.message : "", variant: "destructive" })
    }
  }

  const total = useMemo(() => charges.reduce((sum, charge) => sum + num(charge.amount), 0), [charges])
  const invoiceRate = num(purchase?.header?.rate) || 1
  // المبلغ بعملة الفاتورة = المبلغ × سعر صرف المستند ÷ سعر صرف الفاتورة (نفس تحويل الخادم في landed_cost_lines_v)
  const totalInInvoiceCurrency = total * (num(rate) || 1) / invoiceRate
  const allocation = useMemo(() => {
    const lines = purchase?.lines || []
    const basisOf = (line: PurchaseLine) => Math.max(0, num(method === "quantity" ? line.basis_quantity : method === "weight" ? line.basis_weight : line.basis_value))
    const basisTotal = lines.reduce((sum, line) => sum + basisOf(line), 0)
    return {
      basisTotal,
      lines: lines.map((line) => {
        const basis = basisOf(line)
        const share = basisTotal > 0 ? basis / basisTotal : 0
        const amount = totalInInvoiceCurrency * share
        const mainQuantity = (num(line.qnty) + num(line.bonus)) * (num(line.unit_factor) || 1)
        return { ...line, basis, share, amount, perUnit: mainQuantity > 0 ? amount / mainQuantity : 0 }
      }),
    }
  }, [purchase, method, totalInInvoiceCurrency])

  const setCharge = (key: number, patch: Partial<Charge>) => setCharges((current) => current.map((charge) => (charge.key === key ? { ...charge, ...patch } : charge)))

  const save = async () => {
    if (!purchase) { toast({ title: "اختر فاتورة المشتريات", variant: "destructive" }); return }
    if (method === "weight" && !(allocation.basisTotal > 0)) { toast({ title: "أصناف الفاتورة بلا وزن معرّف", description: "عرّف وزن الأصناف أو وزّع حسب القيمة/الكمية", variant: "destructive" }); return }
    if (!(await confirmYesNo(`حفظ تحميل ${money(total)} على أصناف الفاتورة ${purchase.header.vch_code} وإنشاء القيد؟`))) return
    setSaving(true)
    try {
      const result = await api<{ id: number; code: string; journal: { code: string } }>("/api/landed-costs", {
        method: "POST",
        body: JSON.stringify({
          doc_date: docDate, branch_id: Number(branchId) || null, currency_id: Number(currencyId), rate: num(rate), method,
          purchase_voucher_id: purchase.header.id, debit_account_id: Number(debitAccountId) || null, note,
          charges: charges.filter((charge) => num(charge.amount) || charge.account_id).map((charge) => ({ ...charge, account_id: Number(charge.account_id) || null, amount: num(charge.amount) })),
        }),
      })
      toast({ title: "تم الحفظ", description: `المستند ${result.code} — القيد ${result.journal.code}` })
      onSaved(result.id)
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : "", variant: "destructive" })
    } finally { setSaving(false) }
  }

  const currencyCode = meta.currencies.find((currency) => String(currency.id) === currencyId)?.currency_code || ""

  return (
    <div dir="rtl" className="space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold"><PackagePlus className="h-5 w-5 text-teal-600" />مستند تحميل تكاليف جديد</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
          <Button onClick={() => void save()} disabled={saving || !purchase}><Save className="ml-2 h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ وإنشاء القيد"}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>فاتورة المشتريات</Label>
            <button type="button" onClick={() => setPickerOpen(true)}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm hover:border-teal-400">
              {purchase
                ? <span className="truncate"><b className="font-mono">{purchase.header.vch_code}</b> — {purchase.header.supplier_name || "بدون مورد"} — {purchase.header.vch_date}</span>
                : <span className="text-muted-foreground">اختر فاتورة المشتريات...</span>}
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={docDate} onChange={(event) => setDocDate(event.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>الفرع</Label>
            <select className={selectClass} value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">فرع الفاتورة</option>
              {meta.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>طريقة التوزيع</Label>
            <select className={selectClass} value={method} onChange={(event) => setMethod(event.target.value)}>
              {meta.methods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>العملة</Label>
            <select className={selectClass} value={currencyId} onChange={(event) => setCurrencyId(event.target.value)}>
              {meta.currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.currency_name} ({currency.currency_code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>سعر الصرف</Label><Input type="number" step="any" dir="ltr" value={rate} onChange={(event) => setRate(event.target.value)} /></div>
          <div className="space-y-1.5">
            <AutoCompleteAccount label="حساب المخزون/المشتريات (مدين)" value={debitAccountId} valueMode="id" onValueChange={setDebitAccountId} showCostCenterButton={false} placeholder="كود الحساب" />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4"><Label>ملاحظة</Label><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثلاً: بوليصة شحن رقم ..." /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="font-bold">بنود التكاليف (فواتير الشحن والجمارك)</span>
            <Button size="sm" variant="outline" onClick={() => setCharges((current) => [...current, emptyCharge("other")])}><Plus className="ml-1 h-3.5 w-3.5" />بند</Button>
          </div>
          <div className="space-y-3 p-4">
            {charges.map((charge) => (
              <div key={charge.key} className="grid gap-2 rounded-xl border bg-slate-50/50 p-3 md:grid-cols-[130px_minmax(220px,2fr)_130px_1fr_1fr_auto] md:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">النوع</Label>
                  <select className={selectClass} value={charge.charge_type} onChange={(event) => setCharge(charge.key, { charge_type: event.target.value })}>
                    {meta.charge_types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <AutoCompleteAccount label="الحساب الدائن (المورد/مزوّد الخدمة)" value={charge.account_id} valueMode="id" onValueChange={(value) => setCharge(charge.key, { account_id: value })} showCostCenterButton={false} placeholder="كود الحساب" />
                </div>
                <div className="space-y-1"><Label className="text-xs">المبلغ ({currencyCode})</Label><Input type="number" step="any" dir="ltr" value={charge.amount} onChange={(event) => setCharge(charge.key, { amount: event.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">رقم الفاتورة/المرجع</Label><Input value={charge.reference} onChange={(event) => setCharge(charge.key, { reference: event.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">ملاحظة</Label><Input value={charge.note} onChange={(event) => setCharge(charge.key, { note: event.target.value })} /></div>
                <Button size="icon" variant="ghost" className="text-rose-600" disabled={charges.length === 1} onClick={() => setCharges((current) => current.filter((item) => item.key !== charge.key))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex justify-end gap-6 rounded-xl bg-teal-50 px-4 py-2.5 text-sm">
              <span>الإجمالي: <b className="font-mono">{money(total)}</b> {currencyCode}</span>
              {purchase && <span>بعملة الفاتورة: <b className="font-mono">{money(totalInInvoiceCurrency)}</b> {purchase.header.currency_code}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <AllocationTable purchase={purchase} lines={allocation.lines} method={method} />
      <PurchasePicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={(id) => void choosePurchase(id)} />
    </div>
  )
}

function AllocationTable({ purchase, lines, method }: { purchase: PurchaseData | null; lines: any[]; method: string }) {
  if (!purchase) return (
    <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
      <FileSearch className="h-8 w-8 text-slate-300" />اختر فاتورة المشتريات لمعاينة توزيع التكاليف على أصنافها
    </CardContent></Card>
  )
  const basisLabel = method === "quantity" ? "الكمية (رئيسية)" : method === "weight" ? "الوزن" : "صافي القيمة"
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b px-4 py-2.5 font-bold">توزيع التكاليف على الأصناف <span className="text-xs font-normal text-muted-foreground">(بعملة الفاتورة {purchase.header.currency_code})</span></div>
        {lines.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">لا توجد أصناف مخزنية في الفاتورة</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-2.5 text-right">الصنف</th><th className="p-2.5 text-right">الوحدة</th><th className="p-2.5 text-left">الكمية</th>
                  <th className="p-2.5 text-left">{basisLabel}</th><th className="p-2.5 text-left">النسبة</th><th className="p-2.5 text-left">حصة التكاليف</th>
                  <th className="p-2.5 text-left">إضافة لكلفة الوحدة الرئيسية</th><th className="p-2.5 text-left">محمّل سابقاً</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-t">
                    <td className="p-2.5"><span className="font-mono text-xs text-muted-foreground">{line.product_code}</span> {line.product_name}</td>
                    <td className="p-2.5">{line.unit_name || "—"}</td>
                    <td className="p-2.5 text-left font-mono">{money(num(line.qnty) + num(line.bonus), 2)}</td>
                    <td className="p-2.5 text-left font-mono">{money(line.basis, 2)}</td>
                    <td className="p-2.5 text-left font-mono">{(line.share * 100).toFixed(2)}%</td>
                    <td className="p-2.5 text-left font-mono font-semibold text-teal-700">{money(line.amount)}</td>
                    <td className="p-2.5 text-left font-mono">{money(line.perUnit, 4)}</td>
                    <td className="p-2.5 text-left font-mono text-muted-foreground">{num(line.allocated_before) ? money(line.allocated_before) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-slate-50 font-bold">
                <tr><td className="p-2.5" colSpan={5}>الإجمالي</td><td className="p-2.5 text-left font-mono">{money(totalAmount)}</td><td colSpan={2} /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PurchasePicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (id: number) => void }) {
  const [search, setSearch] = useState("")
  const [rows, setRows] = useState<PurchaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const run = useCallback(async (text: string) => {
    setLoading(true)
    try { setRows((await api<{ rows: PurchaseRow[] }>(`/api/landed-costs?purchase_search=${encodeURIComponent(text)}`)).rows || []) }
    catch { setRows([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) void run(search) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,calc(100vw-1.5rem))] max-w-none gap-3" dir="rtl">
        <DialogTitle>اختيار فاتورة مشتريات</DialogTitle>
        <DialogDescription>ابحث برقم الفاتورة أو اسم المورد أو السند اليدوي</DialogDescription>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void run(search) }}>
          <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث..." />
          <Button type="submit" variant="outline"><Search className="ml-1.5 h-4 w-4" />بحث</Button>
        </form>
        <div className="max-h-[55vh] overflow-auto rounded-lg border">
          {loading ? <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل البيانات...</div> : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">لا توجد فواتير مطابقة</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="p-2 text-right">الرقم</th><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">المورد</th><th className="p-2 text-left">المبلغ</th><th className="p-2 text-center">تكاليف محمّلة</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-t hover:bg-teal-50" onClick={() => onPick(row.id)}>
                    <td className="p-2 font-mono font-semibold">{row.vch_code}</td>
                    <td className="p-2 font-mono">{row.vch_date}</td>
                    <td className="p-2">{row.supplier_name || "—"}</td>
                    <td className="p-2 text-left font-mono">{money(row.amount)} <span className="text-xs text-muted-foreground">{row.currency_code}</span></td>
                    <td className="p-2 text-center">{row.landed_count ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">{row.landed_count}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LandedCostView({ id, meta, onBack }: { id: number; meta: Meta; onBack: () => void }) {
  const { toast } = useToast()
  const [data, setData] = useState<{ header: any; charges: any[]; allocations: any[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setData(await api(`/api/landed-costs/${id}`)) }
    catch (error) { toast({ title: "خطأ", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
  }, [id, toast])
  useEffect(() => { void load() }, [load])

  const cancel = async () => {
    if (!(await confirmYesNo("إلغاء المستند وقيده؟ ستُزال التكاليف من كلفة الأصناف."))) return
    setBusy(true)
    try { await api(`/api/landed-costs/${id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) }); toast({ title: "أُلغي المستند" }); await load() }
    catch (error) { toast({ title: "تعذر الإلغاء", description: error instanceof Error ? error.message : "", variant: "destructive" }) }
    finally { setBusy(false) }
  }

  if (!data) return <div className="p-10 text-center text-muted-foreground">جاري تحميل البيانات...</div>
  const { header, charges, allocations } = data
  const cancelled = Number(header.status) === 3
  const method = meta.methods.find((option) => option.value === header.method)?.label || header.method
  const chargeLabel = (value: string) => meta.charge_types.find((type) => type.value === value)?.label || value
  const fields: [string, React.ReactNode][] = [
    ["فاتورة المشتريات", <span key="p" className="font-mono">{header.purchase_code} ({header.purchase_date})</span>],
    ["المورد", header.supplier_name || "—"],
    ["التاريخ", <span key="d" className="font-mono">{header.doc_date}</span>],
    ["الفرع", header.branch_name || "—"],
    ["طريقة التوزيع", method],
    ["المبلغ", <span key="a" className="font-mono">{money(header.total_amount)} {header.currency_code} × {num(header.rate)}</span>],
    ["حساب المدين", header.debit_account_code ? `${header.debit_account_code} - ${header.debit_account_name}` : "—"],
    ["القيد", <span key="j" className="font-mono">{header.journal_code || "—"}</span>],
  ]
  return (
    <div dir="rtl" className="space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Ship className="h-5 w-5 text-teal-600" />مستند تكاليف <span className="font-mono">{header.code}</span>
          {cancelled && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">ملغى</span>}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}><ArrowRight className="ml-2 h-4 w-4" />رجوع</Button>
          {!cancelled && <Button variant="outline" className="text-rose-600" disabled={busy} onClick={() => void cancel()}><Ban className="ml-2 h-4 w-4" />إلغاء المستند</Button>}
        </div>
      </div>
      <Card>
        <CardContent className="grid gap-x-6 gap-y-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>)}
          {header.note && <div className="sm:col-span-2 lg:col-span-4"><div className="text-xs text-muted-foreground">ملاحظة</div><div>{header.note}</div></div>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="border-b px-4 py-2.5 font-bold">بنود التكاليف</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2.5 text-right">النوع</th><th className="p-2.5 text-right">الحساب الدائن</th><th className="p-2.5 text-left">المبلغ</th><th className="p-2.5 text-right">المرجع</th><th className="p-2.5 text-right">ملاحظة</th></tr></thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id} className="border-t">
                    <td className="p-2.5">{chargeLabel(charge.charge_type)}</td>
                    <td className="p-2.5">{charge.account_code} - {charge.account_name}</td>
                    <td className="p-2.5 text-left font-mono">{money(charge.amount)}</td>
                    <td className="p-2.5">{charge.reference || "—"}</td>
                    <td className="p-2.5">{charge.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {!cancelled && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 py-2.5 font-bold">التوزيع الحالي على أصناف الفاتورة <span className="text-xs font-normal text-muted-foreground">(بعملة الفاتورة {header.purchase_currency_code} — يُعاد حسابه تلقائياً إن عُدّلت الفاتورة)</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2.5 text-right">الصنف</th><th className="p-2.5 text-right">الوحدة</th><th className="p-2.5 text-left">الكمية</th><th className="p-2.5 text-left">أساس التوزيع</th><th className="p-2.5 text-left">الحصة</th></tr></thead>
                <tbody>
                  {allocations.map((line) => (
                    <tr key={line.voucher_item_id} className="border-t">
                      <td className="p-2.5"><span className="font-mono text-xs text-muted-foreground">{line.product_code}</span> {line.product_name}</td>
                      <td className="p-2.5">{line.unit_name || "—"}</td>
                      <td className="p-2.5 text-left font-mono">{money(num(line.qnty) + num(line.bonus))}</td>
                      <td className="p-2.5 text-left font-mono">{money(line.basis)}</td>
                      <td className="p-2.5 text-left font-mono font-semibold text-teal-700">{money(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
