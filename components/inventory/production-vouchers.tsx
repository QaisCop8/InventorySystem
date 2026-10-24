"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftRight, CheckCircle2, ExternalLink, Factory, Loader2, PackagePlus, Plus, Undo2, X } from "lucide-react"
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
import { ProductionGrid } from "@/components/inventory/production-grid"
import { UniversalToolbar } from "@/components/ui/universal-toolbar"
import PostVoucherDialog, { type PostVoucherAction } from "@/components/common/post-voucher-dialog"
import TransactionBranchField from "@/components/common/transaction-branch-field"
import { VoucherSearchButton as CodeSearchButton } from "@/components/common/voucher-search-dialog"

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
type Form = { id: number | null; code: string; status: number; vch_date: string; branch_id: number | null; finished_store_id: string; raw_store_id: string; note: string; produced: Line[]; raw: Line[] }

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const keyOf = () => Math.random().toString(36).slice(2)
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const STATUS_LABEL: Record<number, string> = { 1: "غير معتمد", 2: "معتمد", 3: "ملغى", 4: "قيد الإلغاء" }
const STATUS_TONE: Record<number, string> = { 1: "bg-amber-100 text-amber-800", 2: "bg-emerald-100 text-emerald-800", 3: "bg-rose-100 text-rose-700", 4: "bg-orange-100 text-orange-800" }

const emptyForm = (defaults?: { finished_store_id?: number | null; raw_store_id?: number | null }, branchId: number | null = null): Form => ({
  id: null, code: "", status: 1, vch_date: today(), branch_id: branchId,
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
    id: Number(row.id), code: row.code, status: Number(row.status), vch_date: row.vch_date, branch_id: Number(row.branch_id) || null,
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
  const [searchRow, setSearchRow] = useState<number | undefined>(undefined)
  const [transferOpen, setTransferOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [codeSearchOpen, setCodeSearchOpen] = useState(false)
  const [notice, setNotice] = useState("")
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
  const newForm = (branchId: number | null = form.branch_id ?? activeBranchId ?? null) => emptyForm(defaults, branchId)
  const openNew = () => { setNotice(""); begin(newForm(activeBranchId ?? null), null) }

  // تعبئة تلقائية (رقم السند/الفرع) لسند جديد لم يُعدَّل بعد لا تُعدّ تغييراً غير محفوظ
  const autoPatch = (patch: Partial<Form>) => setForm((value) => {
    const next = { ...value, ...patch }
    if (JSON.stringify(value) === initialRef.current) initialRef.current = JSON.stringify(next)
    return next
  })
  // رقم السند التالي لفرع السند (10 خانات: P + رمز الفرع + تسلسل) — عند فتح سند جديد وعند تغيير فرعه
  useEffect(() => {
    if (!open || form.id || !form.branch_id || form.code) return
    let cancelled = false
    fetch(`/api/production-vouchers?next_code=1&branch_id=${form.branch_id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!cancelled && data?.code) autoPatch({ code: data.code }) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [open, form.id, form.branch_id, form.code]) // eslint-disable-line react-hooks/exhaustive-deps

  // كتابة رقم السند يدوياً: رقم موجود ⇒ يُفتح ذلك السند، رقم تسلسلي ⇒ يُكمَّل بصيغة الفرع
  const handleCodeBlur = async () => {
    const typed = form.code.trim()
    if (!typed || (current && typed === current.code)) return
    try {
      const query = new URLSearchParams({ resolve_code: typed, branch_id: String(form.branch_id || activeBranchId || "") })
      const response = await fetch(`/api/production-vouchers?${query}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, "تعذر قراءة رقم السند"))
      const data = await response.json()
      if (data.id && data.id !== form.id) { await guarded(() => void openRow(Number(data.id))); return }
      if (!form.id) autoPatch({ code: data.code })
      else setForm((value) => ({ ...value, code: current?.code || value.code }))
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر قراءة رقم السند")
    }
  }

  // نافذة الحفظ (مثل باقي السندات): حفظ / حفظ وطباعة / حفظ وترحيل / ترحيل وطباعة
  const handlePostAction = (action: PostVoucherAction) => {
    setPostOpen(false)
    void save(action === "post" || action === "post_print", action === "save_print" || action === "post_print")
  }
  const openRow = async (id: number) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/production-vouchers?id=${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, "تعذر فتح سند الانتاج"))
      const row = await response.json()
      begin(fromServer(row), row)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر فتح سند الانتاج")
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

  // اختيار صنف من البحث أو بكتابة رقمه في سطر الجدول: atIndex = السطر المستهدف (يُستبدل صنفه، أو يُضاف إن كان السطر الفارغ الأخير)
  const addProducts = async (products: any[], target: "produced" | "raw", atIndex?: number): Promise<boolean> => {
    setFormError("")
    let added = false
    for (const [position, picked] of products.entries()) {
      const id = Number(picked?.id || picked?.product_id)
      if (!id) continue
      const replaceAt = position === 0 && atIndex !== undefined && atIndex < form[target].length ? atIndex : null
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
          setForm((value) => {
            const raw = [...value.raw]
            const line = { ...base(product), key: keyOf(), source: null, edited: true }
            if (replaceAt !== null && raw[replaceAt]) raw[replaceAt] = { ...line, quantity: raw[replaceAt].quantity || "1" }
            else raw.push(line)
            return { ...value, raw }
          })
          added = true
          continue
        }
        const key = keyOf()
        const skipped = components.filter((component: any) => component.product.unsupported).map((component: any) => component.product.product_name)
        setForm((value) => {
          const produced = [...value.produced]
          const previous = replaceAt !== null ? produced[replaceAt] : null
          const quantity = previous ? num(previous.quantity) || 1 : 1
          const line = { ...base(product), key, quantity: String(quantity) }
          if (previous) produced[replaceAt!] = line
          else produced.push(line)
          // تغيير الصنف المنتَج في سطر: تُستبدل مكوناته غير المعدّلة بمكونات الصنف الجديد
          const raw = value.raw
            .filter((row) => !(previous && row.source === previous.key && !row.edited))
            .map((row) => (previous && row.source === previous.key ? { ...row, source: null } : row))
          return {
            ...value,
            produced,
            raw: [
              ...raw,
              ...components.filter((component: any) => !component.product.unsupported).map((component: any) => ({
                ...base(component.product), key: keyOf(), quantity: String(Math.round(Number(component.per_unit) * quantity * 1e6) / 1e6), source: key, per_unit: Number(component.per_unit), edited: false,
              })),
            ],
          }
        })
        added = true
        if (!components.length) setFormError(`لا توجد مكونات تصنيع معرّفة على "${product.product_name}" — أضف المواد الخام يدوياً`)
        else if (skipped.length) setFormError(`لم تُضف مكونات غير مدعومة في سند الانتاج: ${skipped.join("، ")}`)
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "تعذر إضافة الصنف")
      }
    }
    return added
  }

  // رقم صنف مكتوب في الجدول (نفس بحث رقم/باركود الصنف في إرسالية المبيعات)
  const lookupCode = async (target: "produced" | "raw", row: number, code: string) => {
    try {
      const response = await fetch(`/api/inventory/products/search?query=${encodeURIComponent(code)}&priceCategoryId=1`, { cache: "no-store" })
      const product = await response.json().catch(() => null)
      if (!response.ok || !product?.id) throw new Error(`لا يوجد صنف برقم ${code}`)
      return await addProducts([product], target, row)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "تعذر البحث عن الصنف")
      return false
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
      id: form.id || undefined, branch_id: form.branch_id || activeBranchId || undefined, code: form.id ? undefined : form.code, vch_date: form.vch_date,
      finished_store_id: Number(form.finished_store_id) || null, raw_store_id: Number(form.raw_store_id) || null, note: form.note,
      produced: form.produced.map(shape),
      raw: form.raw.map((line) => ({ ...shape(line), source_line: line.source ? producedIndex.get(line.source) ?? null : null })),
    }
  }

  const save = async (post: boolean, print = false) => {
    if (!form.branch_id) { setFormError("اختر الفرع"); return }
    if (!form.finished_store_id || !form.raw_store_id) { setFormError("اختر مستودع المواد الجاهزة ومستودع المواد الخام"); return }
    if (!form.produced.length) { setFormError("أضف صنفاً واحداً على الأقل في المواد المنتجة"); return }
    if (!form.raw.length) { setFormError("أضف صنفاً واحداً على الأقل في المواد الخام"); return }
    setBusy(true); setFormError("")
    try {
      const response = await fetch("/api/production-vouchers", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), post }) })
      if (!response.ok) throw new Error(await readError(response, "تعذر حفظ سند الانتاج"))
      const data = await response.json()
      if (data.post_error) {
        // حُفظ ولم يُرحَّل: يبقى السند مفتوحاً ليصحّح المستخدم السبب
        refresh(data)
        setFormError(`حُفظ السند ${data.code} لكن تعذر ترحيله: ${data.post_error}`)
        return
      }
      // كباقي السندات: بعد الحفظ يُفتح سند جديد بنفس الفرع
      setNotice(`تم ${post ? "حفظ وترحيل" : "حفظ"} سند الانتاج ${data.code}${data.posted ? ` — سند الإخراج ${data.posted.out_voucher?.vch_code || ""} وسند الإدخال ${data.posted.in_voucher?.vch_code || ""}` : ""}${print ? " (لا يوجد نموذج طباعة لسند الانتاج بعد)" : ""}`)
      begin(newForm(form.branch_id), null)
      void loadList()
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

  // ───── شريط الأدوات الموحّد: التنقل بين سندات القائمة، جديد، نسخ ─────
  const recordIndex = form.id ? rows.findIndex((row) => Number(row.id) === form.id) : -1
  const guarded = async (action: () => void) => {
    if (dirty && !(await confirmYesNo("توجد تغييرات غير محفوظة على سند الانتاج. هل تريد المتابعة دون حفظ؟"))) return
    action()
  }
  const navigate = async (index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))]
    if (!target || Number(target.id) === form.id) return
    await guarded(() => void openRow(Number(target.id)))
  }
  // نسخ: سند جديد غير معتمد بنفس المستودعات والأصناف والكميات والأسعار (بتاريخ اليوم)
  const cloneCurrent = () => {
    const keys = new Map(form.produced.map((line) => [line.key, keyOf()]))
    const strip = (line: Line): Line => ({ ...line, id: undefined, transferred: 0 })
    begin({
      ...form, id: null, code: "", status: 1, vch_date: today(),
      produced: form.produced.map((line) => ({ ...strip(line), key: keys.get(line.key)! })),
      raw: form.raw.map((line) => ({ ...strip(line), key: keyOf(), source: line.source ? keys.get(line.source) ?? null : null })),
    }, null)
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
          <div className="flex items-center gap-3">
            <span className="text-sm">الإجمالي: <b dir="ltr" className="font-mono">{money(target === "produced" ? totals.produced : totals.raw)}</b></span>
            {!locked && <Button size="sm" variant="outline" className="gap-1" onClick={() => { setSearchRow(lines.length); setSearch(target) }}><Plus className="h-4 w-4" />إضافة صنف</Button>}
          </div>
        </div>
        <ProductionGrid
          gridKey={`${target}-${form.id ?? "new"}-${form.status}`}
          lines={lines}
          locked={locked}
          produced={target === "produced"}
          showExpiry={target === "produced" && showExpiry}
          showBatch={target === "produced" && showBatch}
          onCode={(row, code) => lookupCode(target, row, code)}
          onSearch={(row) => { setSearchRow(row); setSearch(target) }}
          onPatch={(key, patch) => update(key, patch)}
          onRemove={(row) => { const line = lines[row]; if (!line) return; if (target === "produced") void removeProduced(line); else setForm((value) => ({ ...value, raw: value.raw.filter((item) => item.key !== line.key) })) }}
        />
        {!locked && <p className="border-t bg-slate-50 px-4 py-1.5 text-[11px] text-slate-500">اكتب رقم الصنف ثم Enter — F10 بحث الأصناف، F7 حذف السطر{target === "produced" ? "، مكونات التصنيع تُضاف للمواد الخام تلقائياً" : ""}</p>}
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
        <DialogContent
          dir="rtl"
          className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          // نافذة بحث الأصناف/النقل تُفتح خارج هذه النافذة: التركيز أو النقر فيها يُعدّ "خارجها" فكانت تُغلق السند
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (search !== null || transferOpen || busy) event.preventDefault() }}
        >
          <UniversalToolbar
            currentRecord={recordIndex >= 0 ? recordIndex + 1 : rows.length + 1}
            totalRecords={rows.length}
            onNew={() => void guarded(() => { setNotice(""); begin(newForm(), null) })}
            onSave={() => { if (form.status === 1 && !busy) setPostOpen(true) }}
            onDelete={() => void remove()}
            onClone={() => void guarded(() => cloneCurrent())}
            onFirst={() => void navigate(0)}
            onPrevious={() => void navigate(recordIndex - 1)}
            onNext={() => void navigate(recordIndex + 1)}
            onLast={() => void navigate(rows.length - 1)}
            isSaving={busy}
            canSave={form.status === 1}
            canDelete={Boolean(form.id) && form.status === 1}
            canClone={form.produced.length > 0}
            canPrint={false}
            isFirstRecord={recordIndex <= 0}
            isLastRecord={recordIndex < 0 || recordIndex >= rows.length - 1}
            isNewRecord={!form.id}
            hotkeys={{ print: null }}
          />
          <DialogHeader className="border-b bg-gradient-to-l from-emerald-700 to-teal-600 px-5 py-4 text-right text-white">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Factory className="h-5 w-5" />سند انتاج بضاعة
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-sm">{form.code || "جديد"}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[form.status] || "bg-white/20"}`}>{STATUS_LABEL[form.status] || ""}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{formError}</p>}
            {notice && !formError && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{notice}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="production-code">رقم السند *</Label>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Input id="production-code" dir="ltr" maxLength={10} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} onBlur={() => void handleCodeBlur()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleCodeBlur() } }} />
                  <CodeSearchButton onClick={() => setCodeSearchOpen(true)} />
                </div>
              </div>
              <div className="space-y-1"><Label>التاريخ</Label><Input type="date" dir="ltr" disabled={locked} value={form.vch_date} onChange={(event) => setForm({ ...form, vch_date: event.target.value })} /></div>
              <TransactionBranchField family="production" action={form.id ? "update" : "create"} value={form.branch_id} disabled={locked}
                onChange={(id) => {
                  if (id === form.branch_id) return
                  // سند جديد: تغيير الفرع يعيد توليد رقم السند برمز الفرع الجديد
                  if (form.branch_id == null) autoPatch({ branch_id: id, code: form.id ? form.code : "" })
                  else setForm((value) => ({ ...value, branch_id: id, code: value.id ? value.code : "" }))
                }} />
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
              {form.status === 1 && <Button disabled={busy} onClick={() => setPostOpen(true)} className="gap-1 bg-emerald-700 hover:bg-emerald-800">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}حفظ (F3)</Button>}
              {form.status === 2 && <Button disabled={busy} onClick={() => setTransferOpen(true)} className="gap-1 bg-sky-700 hover:bg-sky-800"><ArrowLeftRight className="h-4 w-4" />نقل الى مستودع</Button>}
              {(form.status === 2 || form.status === 4) && <Button disabled={busy} variant="outline" className="gap-1" onClick={() => void act("unpost", {}, "إلغاء ترحيل سند الانتاج؟ سيُلغى سند الإدخال وسند الإخراج المرتبطان.")}><Undo2 className="h-4 w-4" />إلغاء الترحيل</Button>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => void close()} className="gap-1"><X className="h-4 w-4" />إغلاق</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductSearchPopup
        visible={search !== null}
        onClose={() => setSearch(null)}
        onSelect={(products) => { const target = search || "produced"; setSearch(null); void addProducts(products, target, searchRow) }}
        priceCategoryId={1}
        ShowSelect
        searchText=""
        productTypes={[1]}
        selectBaseProduct
        title={search === "raw" ? "اختيار مادة خام" : "اختيار صنف منتَج"}
      />

      <PostVoucherDialog visible={postOpen} isSaving={busy} onSelect={handlePostAction} onCancel={() => setPostOpen(false)} />

      {codeSearchOpen && (
        <ProductionCodeSearch
          branchId={form.branch_id || activeBranchId || null}
          onClose={() => setCodeSearchOpen(false)}
          onPick={(id) => { setCodeSearchOpen(false); if (id !== form.id) void guarded(() => void openRow(id)) }}
        />
      )}

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

/** بحث سندات الانتاج (زر البحث بجانب رقم السند): بالرقم أو الصنف أو الملاحظات — Enter/نقر مزدوج يفتح السند. */
function ProductionCodeSearch({ branchId, onClose, onPick }: { branchId: number | null; onClose: () => void; onPick: (id: number) => void }) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<Production[]>([])
  const [loading, setLoading] = useState(false)
  const run = useCallback(async (text: string) => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ q: text.trim() })
      if (branchId) query.set("branch_id", String(branchId))
      const response = await fetch(`/api/production-vouchers?${query}`, { cache: "no-store" })
      setRows(response.ok ? await response.json() : [])
    } finally { setLoading(false) }
  }, [branchId])
  useEffect(() => { void run("") }, [run])
  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose() }}>
      <DialogContent dir="rtl" className="max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-3xl overflow-hidden" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="text-right"><DialogTitle>بحث سندات الانتاج</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input autoFocus value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(q) } }} placeholder="رقم السند، الصنف، الملاحظات" />
          <Button onClick={() => void run(q)} disabled={loading} className="gap-1">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}بحث</Button>
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="p-2 text-right">رقم السند</th><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">المواد المنتجة</th><th className="p-2 text-right">الحالة</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} tabIndex={0} className="cursor-pointer border-t hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none"
                  onDoubleClick={() => onPick(Number(row.id))} onKeyDown={(event) => { if (event.key === "Enter") onPick(Number(row.id)) }}>
                  <td className="p-2 font-mono font-bold text-emerald-700">{row.code}</td>
                  <td className="p-2" dir="ltr">{String(row.vch_date || "").slice(0, 10)}</td>
                  <td className="max-w-[320px] truncate p-2">{row.produced_names || "—"}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[Number(row.status)] || ""}`}>{STATUS_LABEL[Number(row.status)] || ""}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && <p className="p-6 text-center text-muted-foreground">لا توجد سندات</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
