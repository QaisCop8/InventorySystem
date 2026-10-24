"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftRight, CheckCircle2, ExternalLink, Factory, Loader2, PackagePlus, Plus, RotateCcw, Save, Trash2, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useAuth } from "@/components/auth/auth-context"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { voucherHref } from "@/lib/voucher-links"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import { VoucherListTable, VoucherSearchButton, searchOnEnter } from "@/components/common/voucher-list-table"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"

// سند انتاج بضاعة: جدول المواد المنتجة + جدول المواد الخام. اختيار صنف منتَج يضيف مكونات التصنيع المعرّفة عليه
// للمواد الخام (كمية المكوّن × كمية المنتَج، وتُعاد حسابها مع تغيّر الكمية ما لم يعدّلها المستخدم يدوياً).
// السعر في الجدولين = آخر سعر شراء. الترحيل يولّد سند اخراج للخام وسند ادخال للمنتَج (app/api/production-vouchers).

type Line = {
  key: string; id?: number; item_id: number; product_code: string; product_name: string; unit_name: string
  quantity: string; price: string; expiry_date: string; batch_no: string; note: string
  has_expiry?: boolean; has_batch?: boolean; transferred?: number
  /** المواد الخام: مفتاح سطر المنتَج الذي أضافها + كمية المكوّن لكل وحدة منتَجة */
  source?: string | null; per_unit?: number | null; edited?: boolean
}
type Production = Record<string, any> & { id?: number; code?: string; status?: number }
type Option = { id: number; name: string; code?: string }
type Form = { id: number | null; code: string; status: number; vch_date: string; finished_store_id: string; raw_store_id: string; note: string; produced: Line[]; raw: Line[] }

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const keyOf = () => Math.random().toString(36).slice(2)
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const STATUS_LABEL: Record<number, string> = { 1: "غير معتمد", 2: "معتمد", 3: "ملغى", 4: "قيد الإلغاء" }
const STATUS_TONE: Record<number, string> = { 1: "bg-amber-100 text-amber-800", 2: "bg-emerald-100 text-emerald-800", 3: "bg-rose-100 text-rose-700", 4: "bg-orange-100 text-orange-800" }

const emptyForm = (defaults?: { finished_store_id?: number | null; raw_store_id?: number | null }): Form => ({
  id: null, code: "", status: 1, vch_date: today(),
  finished_store_id: defaults?.finished_store_id ? String(defaults.finished_store_id) : "",
  raw_store_id: defaults?.raw_store_id ? String(defaults.raw_store_id) : "",
  note: "", produced: [], raw: [],
})

const openVoucher = (id: number | null | undefined, type: number) => {
  if (id) window.open(voucherHref(id, type, sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}))
  return data?.error || fallback
}

function fromServer(row: any): Form {
  const producedKeys = (row.produced || []).map(() => keyOf())
  return {
    id: Number(row.id), code: row.code, status: Number(row.status), vch_date: row.vch_date,
    finished_store_id: String(row.finished_store_id || ""), raw_store_id: String(row.raw_store_id || ""), note: row.note || "",
    produced: (row.produced || []).map((line: any, index: number) => ({
      key: producedKeys[index], id: line.id, item_id: line.item_id, product_code: line.product_code, product_name: line.product_name, unit_name: line.unit_name,
      quantity: String(line.quantity), price: String(line.price), expiry_date: line.expiry_date || "", batch_no: line.batch_no || "", note: line.note || "",
      has_expiry: Boolean(line.expiry_date), has_batch: Boolean(line.batch_no), transferred: Number(line.transferred || 0),
    })),
    raw: (row.raw || []).map((line: any) => ({
      key: keyOf(), id: line.id, item_id: line.item_id, product_code: line.product_code, product_name: line.product_name, unit_name: line.unit_name,
      quantity: String(line.quantity), price: String(line.price), expiry_date: "", batch_no: "", note: line.note || "",
      // بعد إعادة الفتح تبقى كميات الخام كما حُفظت (لا إعادة حساب تلقائية)
      source: line.source_line != null ? producedKeys[line.source_line] ?? null : null, per_unit: null, edited: true,
    })),
  }
}

export default function ProductionVouchers() {
  const { activeBranchId } = useAuth()
  const [rows, setRows] = useState<Production[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [filters, setFilters] = useState({ from: "", to: "", status: "0", q: "" })
  const [warehouses, setWarehouses] = useState<Option[]>([])
  const [defaults, setDefaults] = useState<{ finished_store_id: number | null; raw_store_id: number | null }>({ finished_store_id: null, raw_store_id: null })

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm())
  const [current, setCurrent] = useState<Production | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")
  const [search, setSearch] = useState<null | "produced" | "raw">(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const initialRef = useRef("")

  const locked = form.status !== 1
  const dirty = open && !locked && JSON.stringify(form) !== initialRef.current
  useNavigationGuard(() => dirty, (continueNavigation) => {
    void confirmYesNo("توجد تغييرات غير محفوظة على سند الانتاج. هل تريد المتابعة دون حفظ؟").then((ok) => { if (ok) { setOpen(false); continueNavigation() } })
  })

  const loadList = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ from_date: filters.from, to_date: filters.to, status: filters.status, q: filters.q })
      if (activeBranchId) query.set("branch_id", String(activeBranchId))
      const response = await fetch(`/api/production-vouchers?${query}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, "تعذر تحميل سندات الانتاج"))
      setRows(await response.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل سندات الانتاج")
    } finally { setLoading(false) }
  }, [filters, activeBranchId])

  useEffect(() => { void loadList() }, [activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const query = activeBranchId ? `&branch_id=${activeBranchId}` : ""
    fetch(`/api/production-vouchers?meta=1${query}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!data) return
      setWarehouses(data.warehouses || [])
      setDefaults(data.defaults || { finished_store_id: null, raw_store_id: null })
    }).catch(() => undefined)
  }, [activeBranchId])

  const begin = (value: Form, row: Production | null) => {
    setForm(value); setCurrent(row); initialRef.current = JSON.stringify(value); setFormError(""); setOpen(true)
  }
  const openNew = () => begin(emptyForm(defaults), null)
  const openRow = async (id: number) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/production-vouchers?id=${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, "تعذر فتح سند الانتاج"))
      const row = await response.json()
      begin(fromServer(row), row)
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر فتح سند الانتاج")
    } finally { setBusy(false) }
  }
  const refresh = (row: any) => { const value = fromServer(row); setForm(value); setCurrent(row); initialRef.current = JSON.stringify(value) }
  const close = async () => {
    if (dirty && !(await confirmYesNo("توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟"))) return
    setOpen(false); void loadList()
  }

  // ───── الجداول ─────
  const setProduced = (key: string, patch: Partial<Line>) => setForm((value) => {
    const produced = value.produced.map((line) => (line.key === key ? { ...line, ...patch } : line))
    let raw = value.raw
    if (patch.quantity !== undefined) {
      const quantity = num(patch.quantity)
      raw = raw.map((line) => (line.source === key && !line.edited && line.per_unit ? { ...line, quantity: String(Math.round(line.per_unit * quantity * 1e6) / 1e6) } : line))
    }
    return { ...value, produced, raw }
  })
  const setRaw = (key: string, patch: Partial<Line>) => setForm((value) => ({
    ...value, raw: value.raw.map((line) => (line.key === key ? { ...line, ...patch, edited: patch.quantity !== undefined ? true : line.edited } : line)),
  }))
  const removeProduced = async (line: Line) => {
    const linked = form.raw.filter((row) => row.source === line.key && !row.edited)
    const dropLinked = linked.length ? await confirmYesNo(`حذف "${line.product_name}" — هل تريد حذف مكونات التصنيع التي أُضيفت معه (${linked.length}) من المواد الخام؟`) : false
    setForm((value) => ({
      ...value,
      produced: value.produced.filter((row) => row.key !== line.key),
      raw: value.raw.filter((row) => !(dropLinked && row.source === line.key && !row.edited)).map((row) => (row.source === line.key ? { ...row, source: null } : row)),
    }))
  }

  const addProducts = async (products: any[], target: "produced" | "raw") => {
    setFormError("")
    for (const picked of products) {
      const id = Number(picked?.id || picked?.product_id)
      if (!id) continue
      try {
        const response = await fetch(`/api/production-vouchers?product_id=${id}`, { cache: "no-store" })
        if (!response.ok) throw new Error(await readError(response, "تعذر تحميل الصنف"))
        const { product, components } = await response.json()
        if (product.unsupported) { setFormError(`لا يمكن استخدام "${product.product_name}" في سند الانتاج: ${product.unsupported}`); continue }
        const base = (p: any): Omit<Line, "key"> => ({
          item_id: p.id, product_code: p.product_code, product_name: p.product_name, unit_name: p.unit_name, quantity: "1", price: String(p.price || 0),
          expiry_date: "", batch_no: "", note: "", has_expiry: p.has_expiry, has_batch: p.has_batch,
        })
        if (target === "raw") {
          setForm((value) => ({ ...value, raw: [...value.raw, { ...base(product), key: keyOf(), source: null, edited: true }] }))
          continue
        }
        const key = keyOf()
        const skipped = components.filter((component: any) => component.product.unsupported).map((component: any) => component.product.product_name)
        setForm((value) => ({
          ...value,
          produced: [...value.produced, { ...base(product), key }],
          raw: [
            ...value.raw,
            ...components.filter((component: any) => !component.product.unsupported).map((component: any) => ({
              ...base(component.product), key: keyOf(), quantity: String(component.per_unit), source: key, per_unit: Number(component.per_unit), edited: false,
            })),
          ],
        }))
        if (!components.length) setFormError(`لا توجد مكونات تصنيع معرّفة على "${product.product_name}" — أضف المواد الخام يدوياً`)
        else if (skipped.length) setFormError(`لم تُضف مكونات غير مدعومة في سند الانتاج: ${skipped.join("، ")}`)
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "تعذر إضافة الصنف")
      }
    }
  }

  const totals = useMemo(() => {
    const value = (lines: Line[]) => lines.reduce((sum, line) => sum + num(line.quantity) * num(line.price), 0)
    return { produced: value(form.produced), raw: value(form.raw) }
  }, [form.produced, form.raw])

  // ───── الحفظ والإجراءات ─────
  const payload = () => {
    const producedIndex = new Map(form.produced.map((line, index) => [line.key, index]))
    const shape = (line: Line) => ({ item_id: line.item_id, quantity: num(line.quantity), price: num(line.price), expiry_date: line.expiry_date || null, batch_no: line.batch_no, note: line.note })
    return {
      id: form.id || undefined, branch_id: activeBranchId || undefined, vch_date: form.vch_date,
      finished_store_id: Number(form.finished_store_id) || null, raw_store_id: Number(form.raw_store_id) || null, note: form.note,
      produced: form.produced.map(shape),
      raw: form.raw.map((line) => ({ ...shape(line), source_line: line.source ? producedIndex.get(line.source) ?? null : null })),
    }
  }

  const save = async (post: boolean) => {
    if (!form.finished_store_id || !form.raw_store_id) { setFormError("اختر مستودع المواد الجاهزة ومستودع المواد الخام"); return }
    if (!form.produced.length) { setFormError("أضف صنفاً واحداً على الأقل في المواد المنتجة"); return }
    if (!form.raw.length) { setFormError("أضف صنفاً واحداً على الأقل في المواد الخام"); return }
    if (post && !(await confirmYesNo("ترحيل سند الانتاج؟ سيُنشأ سند إخراج للمواد الخام وسند إدخال للمواد المنتجة."))) return
    setBusy(true); setFormError("")
    try {
      const response = await fetch("/api/production-vouchers", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), post }) })
      if (!response.ok) throw new Error(await readError(response, "تعذر حفظ سند الانتاج"))
      const data = await response.json()
      refresh(data)
      if (data.post_error) setFormError(`حُفظ السند لكن تعذر ترحيله: ${data.post_error}`)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر حفظ سند الانتاج")
    } finally { setBusy(false) }
  }

  const act = async (action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (!form.id) return false
    if (confirmText && !(await confirmYesNo(confirmText))) return false
    setBusy(true); setFormError("")
    try {
      const response = await fetch("/api/production-vouchers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id, action, ...extra }) })
      if (!response.ok) throw new Error(await readError(response, "تعذر تنفيذ الإجراء"))
      const data = await response.json()
      refresh(data.production)
      return true
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء")
      return false
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!form.id || !(await confirmYesNo(`حذف سند الانتاج ${form.code}؟`))) return
    setBusy(true)
    try {
      const response = await fetch(`/api/production-vouchers?id=${form.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await readError(response, "تعذر حذف سند الانتاج"))
      initialRef.current = JSON.stringify(form)
      setOpen(false); void loadList()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر حذف سند الانتاج")
    } finally { setBusy(false) }
  }

  const warehouseName = (id: string) => warehouses.find((w) => String(w.id) === id)?.name || ""
  const showExpiry = form.produced.some((line) => line.has_expiry || line.expiry_date)
  const showBatch = form.produced.some((line) => line.has_batch || line.batch_no)
  const listStats = [
    { label: "عدد السندات", value: rows.length },
    { label: "المعتمدة", value: rows.filter((row) => Number(row.status) === 2).length },
    { label: "قيمة المواد المنتجة", value: money(rows.reduce((sum, row) => sum + num(row.produced_value), 0)) },
    { label: "قيمة المواد الخام", value: money(rows.reduce((sum, row) => sum + num(row.raw_value), 0)) },
  ]

  const grid = (target: "produced" | "raw") => {
    const lines = form[target]
    const update = target === "produced" ? setProduced : setRaw
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${target === "produced" ? "bg-emerald-50/70" : "bg-amber-50/70"}`}>
          <h3 className="flex items-center gap-2 font-bold text-slate-800">
            {target === "produced" ? <PackagePlus className="h-5 w-5 text-emerald-600" /> : <Factory className="h-5 w-5 text-amber-600" />}
            {target === "produced" ? "المواد المنتجة" : "المواد الخام"}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">{lines.length}</span>
            <span className="text-xs font-normal text-slate-500">— {warehouseName(target === "produced" ? form.finished_store_id : form.raw_store_id) || "اختر المستودع"}</span>
          </h3>
          {!locked && <Button size="sm" variant="outline" className="gap-1" onClick={() => setSearch(target)}><Plus className="h-4 w-4" />إضافة صنف</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 p-2 text-right">#</th><th className="p-2 text-right">رمز الصنف</th><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الوحدة</th>
                <th className="w-28 p-2 text-right">الكمية</th><th className="w-28 p-2 text-right">سعر الشراء</th><th className="p-2 text-right">القيمة</th>
                {target === "produced" && showExpiry && <th className="w-36 p-2 text-right">الصلاحية</th>}
                {target === "produced" && showBatch && <th className="w-28 p-2 text-right">الرقم التشغيلي</th>}
                {target === "produced" && locked && <th className="p-2 text-right">المنقول</th>}
                {!locked && <th className="w-12 p-2" />}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">{target === "produced" ? "أضف الأصناف المنتجة — تُضاف مكونات التصنيع للمواد الخام تلقائياً" : "لا توجد مواد خام"}</td></tr>}
              {lines.map((line, index) => (
                <tr key={line.key} className="border-t align-middle">
                  <td className="p-2 text-xs text-slate-400">{index + 1}</td>
                  <td className="p-2 font-mono text-xs">{line.product_code}</td>
                  <td className="p-2 font-medium">
                    {line.product_name}
                    {target === "raw" && line.source && <span className="mr-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">{line.edited ? "مكوّن (معدّل)" : "مكوّن تصنيع"}</span>}
                  </td>
                  <td className="p-2 text-xs text-slate-500">{line.unit_name || "—"}</td>
                  <td className="p-2">
                    {locked ? <span dir="ltr" className="font-mono">{qty(num(line.quantity))}</span>
                      : <Input type="number" min={0} step="any" dir="ltr" className="h-8" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} />}
                  </td>
                  <td className="p-2">
                    {locked ? <span dir="ltr" className="font-mono">{money(num(line.price))}</span>
                      : <Input type="number" min={0} step="any" dir="ltr" className="h-8" value={line.price} onChange={(event) => update(line.key, { price: event.target.value })} />}
                  </td>
                  <td className="p-2 font-mono font-semibold" dir="ltr">{money(num(line.quantity) * num(line.price))}</td>
                  {target === "produced" && showExpiry && (
                    <td className="p-2">{locked ? (line.expiry_date || "—") : (line.has_expiry || line.expiry_date) ? <Input type="date" dir="ltr" className="h-8" value={line.expiry_date} onChange={(event) => update(line.key, { expiry_date: event.target.value })} /> : "—"}</td>
                  )}
                  {target === "produced" && showBatch && (
                    <td className="p-2">{locked ? (line.batch_no || "—") : (line.has_batch || line.batch_no) ? <Input className="h-8" maxLength={30} value={line.batch_no} onChange={(event) => update(line.key, { batch_no: event.target.value })} /> : "—"}</td>
                  )}
                  {target === "produced" && locked && <td className="p-2 font-mono text-xs" dir="ltr">{qty(line.transferred || 0)}</td>}
                  {!locked && (
                    <td className="p-2 text-center">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-600" title="حذف السطر"
                        onClick={() => (target === "produced" ? void removeProduced(line) : setForm((value) => ({ ...value, raw: value.raw.filter((row) => row.key !== line.key) })))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {lines.length > 0 && (
              <tfoot className="border-t bg-slate-50 font-bold">
                <tr><td colSpan={6} className="p-2">الإجمالي</td><td className="p-2 font-mono" dir="ltr">{money(target === "produced" ? totals.produced : totals.raw)}</td><td colSpan={4} /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-5 p-4" dir="rtl">
      <VoucherListHero icon={Factory} title="سند انتاج بضاعة" subtitle="المواد المنتجة تدخل مستودع المواد الجاهزة والمواد الخام تُصرف من مستودع المواد الخام" addLabel="سند انتاج جديد" onNew={openNew} addDisabled={busy} />
      <VoucherStats stats={listStats} />

      <section className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1"><Label>من تاريخ</Label><Input type="date" dir="ltr" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} onKeyDown={searchOnEnter(() => void loadList())} /></div>
        <div className="space-y-1"><Label>إلى تاريخ</Label><Input type="date" dir="ltr" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} onKeyDown={searchOnEnter(() => void loadList())} /></div>
        <div className="space-y-1">
          <Label>حالة السند</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="0">الكل</option><option value="1">غير معتمد</option><option value="2">معتمد</option>
          </select>
        </div>
        <div className="space-y-1"><Label>بحث</Label><Input placeholder="رقم السند، الصنف، الملاحظات" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} onKeyDown={searchOnEnter(() => void loadList())} /></div>
        <div className="flex items-end"><VoucherSearchButton onClick={() => void loadList()} loading={loading} className="w-full" /></div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <VoucherListTable
        loading={loading}
        rows={rows.map((row) => ({ ...row, display_date: String(row.vch_date || "").slice(0, 10), display_amount: money(num(row.produced_value)), display_raw: money(num(row.raw_value)) }))}
        columns={[
          { header: "رقم السند", name: "code", width: 130 },
          { header: "التاريخ", name: "display_date", width: 110 },
          { header: "المواد المنتجة", name: "produced_names", width: "*" },
          { header: "مستودع المواد الجاهزة", name: "finished_store_name", width: 160 },
          { header: "مستودع المواد الخام", name: "raw_store_name", width: 160 },
          { header: "قيمة المنتَج", name: "display_amount", width: 120 },
          { header: "قيمة الخام", name: "display_raw", width: 120 },
        ]}
        onOpen={(row: any) => void openRow(Number(row.id))}
      />

      <Dialog open={open} onOpenChange={(value) => { if (!value) void close() }}>
        <DialogContent dir="rtl" className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0" onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader className="border-b bg-gradient-to-l from-emerald-700 to-teal-600 px-5 py-4 text-right text-white">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Factory className="h-5 w-5" />سند انتاج بضاعة
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-sm">{form.code || "جديد"}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[form.status] || "bg-white/20"}`}>{STATUS_LABEL[form.status] || ""}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" dir="ltr" disabled={locked} value={form.vch_date} onChange={(event) => setForm({ ...form, vch_date: event.target.value })} /></div>
              <div className="space-y-1">
                <Label>مستودع المواد الجاهزة</Label>
                <select disabled={locked} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.finished_store_id} onChange={(event) => setForm({ ...form, finished_store_id: event.target.value })}>
                  <option value="">— اختر —</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>مستودع المواد الخام</Label>
                <select disabled={locked} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.raw_store_id} onChange={(event) => setForm({ ...form, raw_store_id: event.target.value })}>
                  <option value="">— اختر —</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label>ملاحظات</Label><Input disabled={locked} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>
            </div>

            {grid("produced")}
            {grid("raw")}

            <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <div>قيمة المواد المنتجة: <b dir="ltr" className="font-mono">{money(totals.produced)}</b></div>
              <div>قيمة المواد الخام: <b dir="ltr" className="font-mono">{money(totals.raw)}</b></div>
              <div>الفرق: <b dir="ltr" className={`font-mono ${totals.produced - totals.raw < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(totals.produced - totals.raw)}</b></div>
            </div>

            {current && (current.in_vch_code || current.out_vch_code || current.transfers?.length > 0) && (
              <div className="space-y-2 rounded-2xl border p-4 text-sm">
                <p className="font-bold text-slate-700">السندات المرتبطة</p>
                <div className="flex flex-wrap gap-2">
                  {current.out_vch_code && <Button size="sm" variant="outline" className="gap-1" onClick={() => openVoucher(current.out_voucher_id, 9)}><ExternalLink className="h-3.5 w-3.5" />سند اخراج الخام {current.out_vch_code}</Button>}
                  {current.in_vch_code && <Button size="sm" variant="outline" className="gap-1" onClick={() => openVoucher(current.in_voucher_id, 8)}><ExternalLink className="h-3.5 w-3.5" />سند ادخال المنتَج {current.in_vch_code}</Button>}
                </div>
                {current.transfers?.length > 0 && (
                  <table className="mt-2 w-full text-xs">
                    <thead className="text-slate-500"><tr><th className="p-1 text-right">الإرسالية</th><th className="p-1 text-right">إلى مستودع</th><th className="p-1 text-right">الكمية</th><th className="p-1 text-right">الحالة</th><th /></tr></thead>
                    <tbody>
                      {current.transfers.map((transfer: any) => (
                        <tr key={transfer.id} className="border-t">
                          <td className="p-1"><button type="button" className="font-mono text-emerald-700 underline" onClick={() => openVoucher(transfer.voucher_id, 10)}>{transfer.vch_code || "—"}</button></td>
                          <td className="p-1">{transfer.to_store_name}</td>
                          <td className="p-1 font-mono" dir="ltr">{qty(transfer.quantity)}</td>
                          <td className="p-1">{transfer.status === 1 ? "فعّال" : transfer.status === 3 ? "ملغى" : "قيد الإلغاء"}</td>
                          <td className="p-1 text-left">{transfer.status !== 3 && <Button size="sm" variant="ghost" className="h-7 text-rose-600" disabled={busy} onClick={() => void act("cancel_transfer", { transfer_id: transfer.id }, `إلغاء النقل ${transfer.vch_code || ""}؟ ستُلغى الإرسالية الداخلية.`)}>إلغاء النقل</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-wrap gap-2 border-t bg-white px-4 py-3 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {form.status === 1 && <Button disabled={busy} onClick={() => void save(false)} className="gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</Button>}
              {form.status === 1 && <Button disabled={busy} onClick={() => void save(true)} className="gap-1 bg-emerald-700 hover:bg-emerald-800"><CheckCircle2 className="h-4 w-4" />حفظ وترحيل</Button>}
              {form.status === 2 && <Button disabled={busy} onClick={() => setTransferOpen(true)} className="gap-1 bg-sky-700 hover:bg-sky-800"><ArrowLeftRight className="h-4 w-4" />نقل الى مستودع</Button>}
              {(form.status === 2 || form.status === 4) && <Button disabled={busy} variant="outline" className="gap-1" onClick={() => void act("unpost", {}, "إلغاء ترحيل سند الانتاج؟ سيُلغى سند الإدخال وسند الإخراج المرتبطان.")}><Undo2 className="h-4 w-4" />إلغاء الترحيل</Button>}
              {form.status === 1 && form.id && <Button disabled={busy} variant="outline" className="gap-1 text-rose-600" onClick={() => void remove()}><Trash2 className="h-4 w-4" />حذف</Button>}
            </div>
            <div className="flex gap-2">
              {form.status === 1 && !form.id && <Button variant="ghost" disabled={busy} className="gap-1" onClick={() => begin(emptyForm(defaults), null)}><RotateCcw className="h-4 w-4" />تفريغ</Button>}
              <Button variant="outline" disabled={busy} onClick={() => void close()} className="gap-1"><X className="h-4 w-4" />إغلاق</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductSearchPopup
        visible={search !== null}
        onClose={() => setSearch(null)}
        onSelect={(products) => { const target = search || "produced"; setSearch(null); void addProducts(products, target) }}
        priceCategoryId={1}
        ShowSelect
        searchText=""
        productTypes={[1]}
        selectBaseProduct
        title={search === "raw" ? "اختيار مادة خام" : "اختيار صنف منتَج"}
      />

      {transferOpen && current && (
        <TransferDialog
          production={current}
          warehouses={warehouses.filter((w) => w.id !== Number(current.finished_store_id))}
          busy={busy}
          onClose={() => setTransferOpen(false)}
          onSubmit={async (body) => { const ok = await act("transfer", body); if (ok) setTransferOpen(false) }}
        />
      )}
    </div>
  )
}

/** نقل الى مستودع: ارسالية داخلية من مستودع المواد الجاهزة لكميات (جزئية) من المواد المنتجة. */
function TransferDialog({ production, warehouses, busy, onClose, onSubmit }: {
  production: Production; warehouses: Option[]; busy: boolean; onClose: () => void
  onSubmit: (body: { to_store_id: number; vch_date: string; note: string; lines: { production_item_id: number; quantity: number }[] }) => Promise<void>
}) {
  const lines = (production.produced || []).map((line: any) => ({ ...line, remaining: Math.max(0, Math.round((Number(line.quantity) - Number(line.transferred || 0)) * 1e6) / 1e6) }))
  const [store, setStore] = useState("")
  const [date, setDate] = useState(today())
  const [note, setNote] = useState("")
  const [quantities, setQuantities] = useState<Record<number, string>>(() => Object.fromEntries(lines.map((line: any) => [line.id, String(line.remaining)])))
  const [error, setError] = useState("")
  const submit = () => {
    const chosen = lines.map((line: any) => ({ production_item_id: Number(line.id), quantity: num(quantities[line.id]), remaining: line.remaining, name: line.product_name })).filter((line: any) => line.quantity > 0)
    if (!store) { setError("اختر المستودع المستلم"); return }
    if (!chosen.length) { setError("أدخل كمية لصنف واحد على الأقل"); return }
    const over = chosen.find((line: any) => line.quantity > line.remaining + 0.000001)
    if (over) { setError(`${over.name}: الكمية أكبر من المتبقي (${qty(over.remaining)})`); return }
    setError("")
    void onSubmit({ to_store_id: Number(store), vch_date: date, note, lines: chosen.map(({ production_item_id, quantity }: any) => ({ production_item_id, quantity })) })
  }
  return (
    <Dialog open onOpenChange={(value) => { if (!value && !busy) onClose() }}>
      <DialogContent dir="rtl" className="max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="text-right"><DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-sky-600" />نقل الى مستودع — {production.code}</DialogTitle></DialogHeader>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm font-semibold text-rose-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>من مستودع</Label><Input disabled value={production.finished_store_name || ""} /></div>
          <div className="space-y-1">
            <Label>إلى مستودع</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={store} onChange={(event) => setStore(event.target.value)} autoFocus>
              <option value="">— اختر —</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>تاريخ الإرسالية</Label><Input type="date" dir="ltr" value={date} onChange={(event) => setDate(event.target.value)} /></div>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">المنتَج</th><th className="p-2 text-right">المنقول</th><th className="p-2 text-right">المتبقي</th><th className="w-32 p-2 text-right">كمية النقل</th></tr></thead>
            <tbody>
              {lines.map((line: any) => (
                <tr key={line.id} className="border-t">
                  <td className="p-2 font-medium">{line.product_name}</td>
                  <td className="p-2 font-mono" dir="ltr">{qty(line.quantity)}</td>
                  <td className="p-2 font-mono" dir="ltr">{qty(line.transferred || 0)}</td>
                  <td className="p-2 font-mono font-bold" dir="ltr">{qty(line.remaining)}</td>
                  <td className="p-2"><Input type="number" min={0} max={line.remaining} step="any" dir="ltr" className="h-8" disabled={line.remaining <= 0} value={quantities[line.id] ?? ""} onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1"><Label>ملاحظات</Label><Input value={note} onChange={(event) => setNote(event.target.value)} /></div>
        <DialogFooter className="gap-2">
          <Button disabled={busy} onClick={submit} className="gap-1 bg-sky-700 hover:bg-sky-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}إنشاء ارسالية داخلية</Button>
          <Button variant="outline" disabled={busy} onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
