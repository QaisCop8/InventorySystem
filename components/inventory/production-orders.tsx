"use client"
import { tr, appDir } from "@/lib/i18n"
import { amountFractionOptions } from "@/lib/decimals"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Eye, Factory, Loader2, Lock, Play, Plus, RotateCcw, Save, ShoppingCart, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { useAuth } from "@/components/auth/auth-context"
import { useNavigationGuard } from "@/lib/navigation-guard"
import { openSectionWith } from "@/lib/section-intents"
import { VoucherListHero } from "@/components/common/voucher-list-shell"
import { VoucherSearchButton, searchOnEnter } from "@/components/common/voucher-list-table"
import ProductSearchPopup from "@/components/products/ProductSearchPopup"
import TransactionBranchField from "@/components/common/transaction-branch-field"
import type { ProductionOrderIntent } from "@/components/inventory/production-vouchers"

// أوامر الانتاج (lib/production-orders.ts): تخطيط الكميات المطلوب انتاجها وتواريخ تسليمها، فحص توفر المواد الخام
// (احتياج الوصفة مع الهدر مقابل رصيد مستودع الخام ⇐ النواقص)، ثم «تنفيذ» يفتح سند انتاج مرتبطاً بالأمر بالمتبقي.

type Item = {
  key: string; item_id: number; product_code: string; product_name: string; unit_name: string; quantity: string
  produced: number; pending: number; remaining: number; sales_order_id: number | null; sales_order_number: string; note: string
}
type Form = {
  id: number | null; code: string; status: number; order_date: string; due_date: string; branch_id: number | null
  finished_store_id: string; raw_store_id: string; priority: number; note: string; items: Item[]
  vouchers: { id: number; code: string; vch_date: string; status: number; value: number }[]
}
type Requirement = {
  rows: { item_id: number; product_code: string; product_name: string; unit_name: string; required: number; available: number; shortage: number; unit_cost: number; shortage_value: number; used_by: string[] }[]
  no_recipe: string[]; store_checked: boolean; total_cost: number; shortage_count: number; shortage_value: number
}

const today = () => new Date().toISOString().slice(0, 10)
const keyOf = () => Math.random().toString(36).slice(2)
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const money = (value: number) => Number(value || 0).toLocaleString("en-US", amountFractionOptions())
const qty = (value: number) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 })
const STATUS_LABEL: Record<number, string> = { 1: tr("مخطط"), 2: tr("قيد التنفيذ"), 3: tr("منتهي"), 4: tr("ملغى") }
const STATUS_TONE: Record<number, string> = {
  1: "bg-sky-50 text-sky-700 ring-sky-200", 2: "bg-amber-50 text-amber-700 ring-amber-200",
  3: "bg-emerald-50 text-emerald-700 ring-emerald-200", 4: "bg-rose-50 text-rose-700 ring-rose-200",
}
const VOUCHER_STATUS: Record<number, string> = { 1: tr("غير معتمد"), 2: tr("معتمد"), 4: tr("قيد الإلغاء"), 5: tr("قيد الحفظ") }

const emptyForm = (branchId: number | null, defaults?: { finished_store_id: number | null; raw_store_id: number | null }): Form => ({
  id: null, code: "", status: 1, order_date: today(), due_date: "", branch_id: branchId,
  finished_store_id: defaults?.finished_store_id ? String(defaults.finished_store_id) : "",
  raw_store_id: defaults?.raw_store_id ? String(defaults.raw_store_id) : "",
  priority: 1, note: "", items: [], vouchers: [],
})

function fromServer(row: any): Form {
  return {
    id: Number(row.id), code: row.code, status: Number(row.status), order_date: row.order_date, due_date: row.due_date || "",
    branch_id: Number(row.branch_id) || null, finished_store_id: row.finished_store_id ? String(row.finished_store_id) : "",
    raw_store_id: row.raw_store_id ? String(row.raw_store_id) : "", priority: Number(row.priority) || 1, note: row.note || "",
    items: (row.items || []).map((line: any) => ({
      key: keyOf(), item_id: line.item_id, product_code: line.product_code, product_name: line.product_name, unit_name: line.unit_name,
      quantity: String(line.quantity), produced: Number(line.produced) || 0, pending: Number(line.pending) || 0, remaining: Number(line.remaining) || 0,
      sales_order_id: line.sales_order_id, sales_order_number: line.sales_order_number || "", note: line.note || "",
    })),
    vouchers: row.vouchers || [],
  }
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}))
  return data?.error || fallback
}

export default function ProductionOrders() {
  const { activeBranchId } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [filters, setFilters] = useState({ status: "open", q: "" })
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([])
  const [defaults, setDefaults] = useState<{ finished_store_id: number | null; raw_store_id: number | null }>({ finished_store_id: null, raw_store_id: null })

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm(null))
  const [initial, setInitial] = useState("")
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [salesOpen, setSalesOpen] = useState(false)
  const [requirements, setRequirements] = useState<Requirement | null>(null)
  const [requirementsLoading, setRequirementsLoading] = useState(false)

  const editable = form.status === 1 || form.status === 2
  const dirty = open && editable && JSON.stringify(form) !== initial
  useNavigationGuard(() => dirty, (continueNavigation) => {
    void confirmYesNo(tr("توجد تغييرات غير محفوظة على أمر الانتاج. هل تريد المتابعة دون حفظ؟")).then((ok) => { if (ok) { setOpen(false); continueNavigation() } })
  })

  const loadList = useCallback(async () => {
    setLoading(true); setError("")
    try {
      // كل الحالات من الخادم — التبويبات (وأعدادها) تُصفّى في الشاشة
      const query = new URLSearchParams({ q: filters.q, status: "0" })
      if (activeBranchId) query.set("branch_id", String(activeBranchId))
      const response = await fetch(`/api/production-orders?${query}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر تحميل أوامر الانتاج")))
      setRows(await response.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذر تحميل أوامر الانتاج"))
    } finally { setLoading(false) }
  }, [filters.q, activeBranchId])

  useEffect(() => { void loadList() }, [activeBranchId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const query = activeBranchId ? `&branch_id=${activeBranchId}` : ""
    fetch(`/api/production-orders?meta=1${query}`, { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (!data) return
      setWarehouses(data.warehouses || [])
      setDefaults(data.defaults || { finished_store_id: null, raw_store_id: null })
    }).catch(() => undefined)
  }, [activeBranchId])

  const begin = (value: Form) => { setForm(value); setInitial(JSON.stringify(value)); setFormError(""); setRequirements(null); setOpen(true) }
  const openNew = () => begin(emptyForm(activeBranchId ?? null, defaults))
  const openRow = async (id: number) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/production-orders?id=${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر فتح أمر الانتاج")))
      begin(fromServer(await response.json()))
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذر فتح أمر الانتاج"))
    } finally { setBusy(false) }
  }
  const close = async () => {
    if (dirty && !(await confirmYesNo(tr("توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟")))) return
    setOpen(false); void loadList()
  }

  // رقم الأمر التالي لعرضه لأمر جديد
  useEffect(() => {
    if (!open || form.id || !form.branch_id) return
    let cancelled = false
    fetch(`/api/production-orders?next_code=1&branch_id=${form.branch_id}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data?.code) return
        setForm((value) => {
          const next = { ...value, code: data.code }
          setInitial((current) => (current === JSON.stringify(value) ? JSON.stringify(next) : current))
          return next
        })
      }).catch(() => undefined)
    return () => { cancelled = true }
  }, [open, form.id, form.branch_id])

  const addItems = (products: any[], salesLink?: { sales_order_id: number; sales_order_number: string; quantity: number }[]) => {
    setForm((value) => ({
      ...value,
      items: [
        ...value.items,
        ...products.map((product, index) => ({
          key: keyOf(), item_id: Number(product.id || product.item_id), product_code: product.product_code || "", product_name: String(product.product_name || "").replace(/\s*\([^)]*\)\s*$/, ""),
          unit_name: product.unit_name || product.first_unit || product.main_unit || "", quantity: String(salesLink?.[index]?.quantity || 1),
          produced: 0, pending: 0, remaining: 0,
          sales_order_id: salesLink?.[index]?.sales_order_id ?? null, sales_order_number: salesLink?.[index]?.sales_order_number || "", note: "",
        })).filter((line) => line.item_id > 0),
      ],
    }))
    setRequirements(null)
  }
  const patchItem = (key: string, patch: Partial<Item>) => { setForm((value) => ({ ...value, items: value.items.map((line) => (line.key === key ? { ...line, ...patch } : line)) })); setRequirements(null) }

  const payload = () => ({
    id: form.id || undefined, branch_id: form.branch_id || activeBranchId || undefined, order_date: form.order_date, due_date: form.due_date || null,
    finished_store_id: Number(form.finished_store_id) || null, raw_store_id: Number(form.raw_store_id) || null, priority: form.priority, note: form.note,
    items: form.items.map((line) => ({ item_id: line.item_id, quantity: num(line.quantity), sales_order_id: line.sales_order_id, sales_order_number: line.sales_order_number, note: line.note })),
  })

  const save = async (): Promise<Form | null> => {
    if (!form.items.length) { setFormError(tr("أضف صنفاً منتَجاً واحداً على الأقل")); return null }
    setBusy(true); setFormError("")
    try {
      const response = await fetch("/api/production-orders", { method: form.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر حفظ أمر الانتاج")))
      const value = fromServer(await response.json())
      setForm(value); setInitial(JSON.stringify(value))
      void loadList()
      return value
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("تعذر حفظ أمر الانتاج"))
      return null
    } finally { setBusy(false) }
  }

  const act = async (action: "cancel" | "close" | "reopen", question: string) => {
    if (!form.id || !(await confirmYesNo(question))) return
    setBusy(true); setFormError("")
    try {
      const response = await fetch("/api/production-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id, action }) })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر تنفيذ الإجراء")))
      const value = fromServer(await response.json())
      setForm(value); setInitial(JSON.stringify(value)); void loadList()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("تعذر تنفيذ الإجراء"))
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!form.id || !(await confirmYesNo(tr("حذف أمر الانتاج {0}؟", form.code)))) return
    setBusy(true)
    try {
      const response = await fetch(`/api/production-orders?id=${form.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر حذف أمر الانتاج")))
      setInitial(JSON.stringify(form)); setOpen(false); void loadList()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("تعذر حذف أمر الانتاج"))
    } finally { setBusy(false) }
  }

  // فحص توفر المواد: للأمر المحفوظ بلا تغييرات ⇐ المتبقي من الخادم؛ وإلا الكميات المكتوبة في الشاشة
  const checkMaterials = async () => {
    if (!form.items.length) { setFormError(tr("أضف صنفاً منتَجاً واحداً على الأقل")); return }
    setRequirementsLoading(true); setFormError("")
    try {
      const store = form.raw_store_id ? `&raw_store_id=${form.raw_store_id}` : ""
      const url = form.id && !dirty
        ? `/api/production-orders?requirements=${form.id}${store}`
        : `/api/production-orders?plan_lines=${encodeURIComponent(JSON.stringify(form.items.map((line) => ({ item_id: line.item_id, quantity: Math.max(0, num(line.quantity) - line.produced - line.pending) }))))}${store}&date=${today()}`
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر فحص توفر المواد")))
      setRequirements(await response.json())
    } catch (e) {
      setFormError(e instanceof Error ? e.message : tr("تعذر فحص توفر المواد"))
    } finally { setRequirementsLoading(false) }
  }

  // تنفيذ: يحفظ التغييرات أولاً ثم يفتح سند انتاج جديداً بالمتبقي من كل صنف
  const execute = async (fromList?: Form) => {
    let current: Form | null = fromList || form
    if (!fromList && (!form.id || dirty)) current = await save()
    if (!current?.id) return
    const items = current.items.filter((line) => line.remaining > 0).map((line) => ({ item_id: line.item_id, quantity: line.remaining }))
    if (!items.length) { if (fromList) setError(tr("لا توجد كميات متبقية للانتاج في الأمر {0}", current.code)); else setFormError(tr("لا توجد كميات متبقية للانتاج في هذا الأمر")); return }
    const intent: ProductionOrderIntent = {
      order_id: current.id, order_code: current.code, branch_id: current.branch_id,
      finished_store_id: Number(current.finished_store_id) || null, raw_store_id: Number(current.raw_store_id) || null, items,
    }
    setOpen(false)
    openSectionWith("production-vouchers", intent)
  }

  const executeRow = async (id: number) => {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/production-orders?id=${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(await readError(response, tr("تعذر فتح أمر الانتاج")))
      await execute(fromServer(await response.json()))
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذر فتح أمر الانتاج"))
    } finally { setBusy(false) }
  }

  const exportShortages = async () => {
    if (!requirements) return
    const XLSX = await import("xlsx")
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(requirements.rows.map((row) => ({
      [tr("رقم الصنف")]: row.product_code, [tr("المادة الخام")]: row.product_name, [tr("الوحدة")]: row.unit_name,
      [tr("المطلوب")]: row.required, [tr("المتوفر")]: row.available, [tr("النقص")]: row.shortage,
      [tr("الكلفة")]: row.unit_cost, [tr("قيمة النقص")]: row.shortage_value, [tr("يدخل في")]: row.used_by.join("، "),
    }))), tr("احتياج المواد"))
    XLSX.writeFile(book, `احتياج-المواد-${form.code || "أمر-جديد"}.xlsx`)
  }

  const counts = {
    open: rows.filter((row) => row.status === 1 || row.status === 2).length,
    1: rows.filter((row) => row.status === 1).length,
    2: rows.filter((row) => row.status === 2).length,
    late: rows.filter((row) => row.late).length,
    3: rows.filter((row) => row.status === 3).length,
    4: rows.filter((row) => row.status === 4).length,
    0: rows.length,
  } as Record<string, number>
  const visibleRows = useMemo(() => rows.filter((row) =>
    filters.status === "open" ? row.status === 1 || row.status === 2
      : filters.status === "late" ? row.late
        : filters.status === "0" ? true : row.status === Number(filters.status)), [rows, filters.status])
  const TABS: { key: string; label: string; tone: string }[] = [
    { key: "open", label: tr("المفتوحة"), tone: "emerald" }, { key: "1", label: tr("مخطط"), tone: "sky" }, { key: "2", label: tr("قيد التنفيذ"), tone: "amber" },
    { key: "late", label: tr("متأخرة"), tone: "rose" }, { key: "3", label: tr("منتهية"), tone: "emerald" }, { key: "4", label: tr("ملغاة"), tone: "slate" }, { key: "0", label: tr("الكل"), tone: "slate" },
  ]
  const isLate = editable && form.due_date && form.due_date < today()
  const plannedTotal = form.items.reduce((sum, line) => sum + num(line.quantity), 0)
  const producedTotal = form.items.reduce((sum, line) => sum + line.produced, 0)
  const progress = plannedTotal > 0 ? Math.min(100, Math.round((producedTotal / plannedTotal) * 100)) : 0
  const daysLeft = form.due_date ? Math.round((new Date(`${form.due_date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000) : null
  const fieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900"

  return (
    <div className="space-y-5 p-4" dir={appDir()}>
      <VoucherListHero icon={ClipboardList} title={tr("أوامر الانتاج")} subtitle={tr("خطط ما ستنتجه، افحص توفر المواد الخام، ثم نفّذ الأمر بسند انتاج")} addLabel={tr("أمر انتاج جديد")} onNew={openNew} addDisabled={busy} />

      {/* شريط الحالات + البحث */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => {
            const active = filters.status === tab.key
            return (
              <button key={tab.key} type="button" onClick={() => setFilters({ ...filters, status: tab.key })}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${active ? "border-emerald-600 bg-emerald-600 text-white shadow" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}>
                {tab.label}
                <span className={`min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums ${active ? "bg-white/25" : tab.key === "late" && counts.late ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>{counts[tab.key] ?? 0}</span>
              </button>
            )
          })}
          <div className="ms-auto flex min-w-[240px] flex-1 items-center gap-2 sm:max-w-md">
            <Input className="h-10 rounded-xl" placeholder={tr("ابحث برقم الأمر، الصنف، رقم الطلبية")} value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} onKeyDown={searchOnEnter(() => void loadList())} />
            <VoucherSearchButton onClick={() => void loadList()} loading={loading} className="h-10 rounded-xl px-4" />
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {/* بطاقات الأوامر */}
      {loading && !rows.length ? (
        <div className="grid h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
      ) : !visibleRows.length ? (
        <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center dark:border-slate-700 dark:bg-slate-950">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><ClipboardList className="h-7 w-7" /></span>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{tr("لا توجد أوامر انتاج هنا")}</p>
          <p className="text-sm text-slate-500">{tr("أنشئ أمراً جديداً أو غيّر الحالة المختارة في الأعلى")}</p>
          <Button onClick={openNew} className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4" />{tr("أمر انتاج جديد")}</Button>
        </div>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          {visibleRows.map((row) => {
            const open = row.status === 1 || row.status === 2
            return (
              <article key={row.id} onDoubleClick={() => void openRow(row.id)}
                className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-950 ${row.late ? "border-rose-200 dark:border-rose-900/50" : "border-slate-200 dark:border-slate-800"}`}>
                <span className={`absolute inset-y-0 start-0 w-1 ${row.late ? "bg-rose-500" : row.status === 2 ? "bg-amber-400" : row.status === 3 ? "bg-emerald-500" : row.status === 4 ? "bg-slate-300" : "bg-sky-400"}`} />
                <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{row.code}</span>
                      {row.priority === 2 && <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{tr("عاجل")}</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{row.product_names || "—"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${STATUS_TONE[row.status] || ""}`}>{STATUS_LABEL[row.status]}</span>
                </div>
                <div className="space-y-1.5 px-4 pt-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{tr("الإنجاز")}</span>
                    <span className="font-mono tabular-nums" dir="ltr">{qty(row.produced)} / {qty(row.planned)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full transition-all ${row.progress >= 100 ? "bg-emerald-500" : "bg-gradient-to-l from-emerald-500 to-teal-400"}`} style={{ width: `${row.progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 pt-2.5 text-xs text-slate-500">
                  <span>{tr("التاريخ")} <b className="font-mono font-medium text-slate-600 dark:text-slate-300">{row.order_date}</b></span>
                  <span className={row.late ? "font-bold text-rose-600" : ""}>{tr("التسليم")} <b className="font-mono font-medium">{row.due_date || "—"}</b>{row.late ? ` · ${tr("متأخر")}` : ""}</span>
                  {row.sales_orders && <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" /><b className="font-mono font-medium">{row.sales_orders}</b></span>}
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                  <Button size="sm" variant="ghost" className="h-8 flex-1 gap-1.5 rounded-lg text-slate-700" onClick={() => void openRow(row.id)}><Eye className="h-4 w-4" />{tr("فتح وتعديل")}</Button>
                  {open && <Button size="sm" disabled={busy} className="h-8 flex-1 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700" onClick={(event) => { event.stopPropagation(); void executeRow(row.id) }}><Play className="h-4 w-4" />{tr("تنفيذ")}</Button>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => { if (!value) void close() }}>
        <DialogContent
          dir={appDir()}
          className="flex max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (searchOpen || salesOpen || busy) event.preventDefault() }}
        >
          {/* رأس: الرقم والحالة والإنجاز */}
          <DialogHeader className="space-y-0 bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 pb-4 pt-4 text-start text-white">
            <div className="flex flex-wrap items-center gap-3 pe-8">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15"><ClipboardList className="h-6 w-6" /></span>
              <div className="min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-bold">
                  {form.id ? tr("أمر انتاج") : tr("أمر انتاج جديد")}
                  <span className="rounded-lg bg-white/15 px-2 py-0.5 font-mono text-sm">{form.code || "—"}</span>
                </DialogTitle>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-0.5 font-bold text-emerald-800">{STATUS_LABEL[form.status]}</span>
                  {form.priority === 2 && <span className="rounded-full bg-rose-500 px-2.5 py-0.5 font-bold">{tr("عاجل")}</span>}
                  {isLate && <span className="rounded-full bg-rose-500 px-2.5 py-0.5 font-bold">{tr("متأخر")}</span>}
                  {daysLeft !== null && !isLate && editable && <span className="rounded-full bg-white/15 px-2.5 py-0.5">{daysLeft === 0 ? tr("التسليم اليوم") : tr("باقي {0} يوم للتسليم", daysLeft)}</span>}
                </div>
              </div>
              {form.items.length > 0 && (
                <div className="ms-auto w-full min-w-[180px] sm:w-56">
                  <div className="mb-1 flex justify-between text-xs text-white/80"><span>{tr("الإنجاز")}</span><b className="font-mono" dir="ltr">{progress}%</b></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 dark:bg-slate-950">
            {formError && <p role="alert" className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{formError}</p>}
            <div className="grid gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
              {/* تفاصيل الأمر */}
              <aside className="space-y-4 self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-0">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{tr("تفاصيل الأمر")}</h3>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                  <div className="space-y-1"><Label className="text-xs text-slate-500">{tr("تاريخ الأمر")}</Label><Input type="date" dir="ltr" disabled={!editable} className="h-10 rounded-xl" value={form.order_date} onChange={(event) => setForm({ ...form, order_date: event.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-slate-500">{tr("تاريخ التسليم المطلوب")}</Label><Input type="date" dir="ltr" disabled={!editable} className="h-10 rounded-xl" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{tr("الأولوية")}</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {[{ value: 1, label: tr("عادي") }, { value: 2, label: tr("عاجل") }].map((option) => (
                      <button key={option.value} type="button" disabled={!editable} onClick={() => setForm({ ...form, priority: option.value })}
                        className={`rounded-lg py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed ${form.priority === option.value ? option.value === 2 ? "bg-rose-600 text-white shadow" : "bg-white text-emerald-700 shadow dark:bg-slate-700 dark:text-emerald-300" : "text-slate-500"}`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <TransactionBranchField family="production" action={form.id ? "update" : "create"} value={form.branch_id} disabled={!editable || Boolean(form.vouchers.length)}
                  onChange={(id) => setForm((value) => ({ ...value, branch_id: id, code: value.id ? value.code : "" }))} />
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{tr("مستودع المواد الجاهزة")}</Label>
                  <select disabled={!editable} className={fieldClass} value={form.finished_store_id} onChange={(event) => setForm({ ...form, finished_store_id: event.target.value })}>
                    <option value="">{tr("— اختر —")}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{tr("مستودع المواد الخام")}</Label>
                  <select disabled={!editable} className={fieldClass} value={form.raw_store_id} onChange={(event) => { setForm({ ...form, raw_store_id: event.target.value }); setRequirements(null) }}>
                    <option value="">{tr("— اختر —")}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label className="text-xs text-slate-500">{tr("ملاحظات")}</Label><textarea disabled={!editable} rows={2} className={`${fieldClass} h-auto py-2`} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div>
              </aside>

              <div className="min-w-0 space-y-4">
                {/* الأصناف */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><Factory className="h-4 w-4" /></span>
                      {tr("المطلوب انتاجه")}
                      <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-500 dark:bg-slate-800">{form.items.length}</span>
                    </h3>
                    {editable && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => setSalesOpen(true)}><ShoppingCart className="h-4 w-4" />{tr("من طلبيات المبيعات")}</Button>
                        <Button size="sm" className="gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700" onClick={() => setSearchOpen(true)}><Plus className="h-4 w-4" />{tr("إضافة صنف")}</Button>
                      </div>
                    )}
                  </div>
                  {!form.items.length ? (
                    <button type="button" disabled={!editable} onClick={() => setSearchOpen(true)} className="m-4 grid w-[calc(100%-2rem)] place-items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-10 text-sm text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700">
                      <Plus className="h-6 w-6" />{tr("أضف الأصناف المطلوب انتاجها أو اسحبها من طلبيات المبيعات المفتوحة")}
                    </button>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {form.items.map((line) => {
                        const planned = num(line.quantity)
                        const done = line.produced + line.pending
                        const remaining = Math.max(0, planned - done)
                        const percent = planned > 0 ? Math.min(100, (line.produced / planned) * 100) : 0
                        const pendingPercent = planned > 0 ? Math.min(100 - percent, (line.pending / planned) * 100) : 0
                        return (
                          <li key={line.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{line.product_name}</span>
                                {line.sales_order_number && <span className="flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[11px] text-sky-700"><ShoppingCart className="h-3 w-3" />{line.sales_order_number}</span>}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">{line.product_code}{line.unit_name ? ` · ${line.unit_name}` : ""}</div>
                              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
                                <div className="h-full bg-amber-400" style={{ width: `${pendingPercent}%` }} />
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                                <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />{tr("منتَج")} <b className="font-mono">{qty(line.produced)}</b></span>
                                {line.pending > 0 && <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-amber-400" />{tr("بسندات غير معتمدة")} <b className="font-mono">{qty(line.pending)}</b></span>}
                                <span>{tr("المتبقي")} <b className="font-mono text-slate-700 dark:text-slate-200">{qty(remaining)}</b></span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-slate-500">{tr("الكمية المخططة")}</Label>
                              <Input type="number" min={0} step="any" dir="ltr" className="h-10 rounded-xl text-center font-mono text-base font-semibold" disabled={!editable} value={line.quantity} onChange={(event) => patchItem(line.key, { quantity: event.target.value })} />
                            </div>
                            <div className="flex justify-end">
                              {editable && done <= 0 && <Button size="sm" variant="ghost" className="h-9 w-9 rounded-lg p-0 text-rose-600 hover:bg-rose-50" onClick={() => setForm((value) => ({ ...value, items: value.items.filter((row) => row.key !== line.key) }))} aria-label={tr("حذف")}><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                {/* توفر المواد */}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10"><AlertTriangle className="h-4 w-4" /></span>
                      {tr("توفر المواد الخام")}
                    </h3>
                    <div className="flex gap-2">
                      {requirements && requirements.rows.length > 0 && <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => void exportShortages()}><Download className="h-4 w-4" />{tr("Excel")}</Button>}
                      <Button size="sm" variant="outline" className="gap-1.5 rounded-lg border-amber-300 text-amber-700 hover:bg-amber-50" disabled={requirementsLoading || !form.items.length} onClick={() => void checkMaterials()}>
                        {requirementsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{requirements ? tr("إعادة الفحص") : tr("فحص توفر المواد")}
                      </Button>
                    </div>
                  </div>
                  {requirements ? <RequirementsTable data={requirements} /> : <p className="px-4 py-6 text-center text-sm text-slate-500">{tr("يحسب المواد الخام اللازمة للكميات المتبقية (مع نسبة الهدر) ويقارنها برصيد مستودع المواد الخام")}</p>}
                </section>

                {form.vouchers.length > 0 && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-100">{tr("سندات الانتاج المنفذة")}</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {form.vouchers.map((voucher) => (
                        <div key={voucher.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-800/50">
                          <div><b className="font-mono text-sm text-slate-700 dark:text-slate-200">{voucher.code}</b><div className="text-slate-500">{voucher.vch_date}</div></div>
                          <div className="text-end">
                            <span className={`rounded-full px-2 py-0.5 font-bold ${voucher.status === 2 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{VOUCHER_STATUS[voucher.status] || ""}</span>
                            <div className="mt-0.5 font-mono text-slate-600" dir="ltr">{money(voucher.value)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-between dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap gap-2">
              {editable && <Button disabled={busy || !form.items.length} onClick={() => void execute()} className="h-10 gap-1.5 rounded-xl bg-emerald-600 px-5 hover:bg-emerald-700"><Play className="h-4 w-4" />{tr("تنفيذ (سند انتاج)")}</Button>}
              {editable && <Button variant="outline" disabled={busy} onClick={() => void save()} className="h-10 gap-1.5 rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tr("حفظ")}{dirty && <span className="h-2 w-2 rounded-full bg-amber-500" />}</Button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {form.id && editable && <Button variant="ghost" disabled={busy} className="h-10 gap-1.5 rounded-xl text-slate-600" onClick={() => void act("close", tr("إغلاق أمر الانتاج {0} كمنتهٍ؟ لن تُضاف له سندات جديدة.", form.code))}><Lock className="h-4 w-4" />{tr("إغلاق الأمر")}</Button>}
              {form.id && editable && !form.vouchers.length && <Button variant="ghost" disabled={busy} className="h-10 gap-1.5 rounded-xl text-rose-600 hover:bg-rose-50" onClick={() => void act("cancel", tr("إلغاء أمر الانتاج {0}؟", form.code))}><XCircle className="h-4 w-4" />{tr("إلغاء الأمر")}</Button>}
              {form.id && !editable && <Button variant="outline" disabled={busy} className="h-10 gap-1.5 rounded-xl" onClick={() => void act("reopen", tr("إعادة فتح أمر الانتاج {0}؟", form.code))}><RotateCcw className="h-4 w-4" />{tr("إعادة فتح")}</Button>}
              {form.id && !form.vouchers.length && <Button variant="ghost" disabled={busy} className="h-10 gap-1.5 rounded-xl text-rose-600 hover:bg-rose-50" onClick={() => void remove()}><Trash2 className="h-4 w-4" />{tr("حذف")}</Button>}
              <Button variant="outline" disabled={busy} className="h-10 rounded-xl" onClick={() => void close()}>{tr("إغلاق")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductSearchPopup
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(products) => { setSearchOpen(false); addItems(products || []) }}
        priceCategoryId={1}
        ShowSelect
        searchText=""
        productTypes={[1]}
        selectBaseProduct
        title={tr("اختيار صنف منتَج")}
      />

      {salesOpen && (
        <SalesOrderLinesDialog
          onClose={() => setSalesOpen(false)}
          onPick={(lines) => {
            setSalesOpen(false)
            addItems(
              lines.map((line) => ({ id: line.item_id, product_code: line.product_code, product_name: line.product_name })),
              lines.map((line) => ({ sales_order_id: line.sales_order_id, sales_order_number: line.order_number, quantity: line.to_plan || line.remaining })),
            )
          }}
        />
      )}
    </div>
  )
}

function RequirementsTable({ data }: { data: Requirement }) {
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr("كلفة المواد المطلوبة")}: <b dir="ltr">{money(data.total_cost)}</b></span>
        {data.shortage_count > 0
          ? <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">{tr("نواقص")}: {data.shortage_count} · {tr("قيمتها")} <b dir="ltr">{money(data.shortage_value)}</b></span>
          : data.store_checked && data.rows.length > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">{tr("كل المواد متوفرة")}</span>}
        {!data.store_checked && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{tr("اختر مستودع المواد الخام لمقارنة الرصيد")}</span>}
      </div>
      {data.no_recipe.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{tr("أصناف بلا مكونات تصنيع (لا يمكن حساب احتياجها)")}: {data.no_recipe.join("، ")}</p>}
      {data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="p-2 text-start">{tr("المادة الخام")}</th><th className="p-2 text-start">{tr("المطلوب")}</th><th className="p-2 text-start">{tr("المتوفر")}</th><th className="p-2 text-start">{tr("النقص")}</th><th className="p-2 text-start">{tr("قيمة النقص")}</th><th className="p-2 text-start">{tr("يدخل في")}</th></tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.item_id} className={`border-t ${row.shortage > 0 ? "bg-rose-50/60" : ""}`}>
                  <td className="p-2"><div className="font-medium">{row.product_name}</div><div className="font-mono text-[11px] text-slate-400">{row.product_code} · {row.unit_name}</div></td>
                  <td className="p-2 font-mono">{qty(row.required)}</td>
                  <td className="p-2 font-mono">{data.store_checked ? qty(row.available) : "—"}</td>
                  <td className={`p-2 font-mono font-bold ${row.shortage > 0 ? "text-rose-700" : "text-emerald-700"}`} dir="ltr">{row.shortage > 0 ? qty(row.shortage) : "✓"}</td>
                  <td className="p-2 font-mono">{row.shortage > 0 ? money(row.shortage_value) : "—"}</td>
                  <td className="max-w-[200px] truncate p-2 text-xs text-slate-500">{row.used_by.join("، ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type SalesLine = { sales_order_id: number; order_number: string; order_date: string; delivery_date: string; customer_name: string; item_id: number; product_code: string; product_name: string; remaining: number; planned: number; to_plan: number }

/** أسطر طلبيات المبيعات المفتوحة لأصناف لها وصفة تصنيع — يُختار منها ما يُضاف لأمر الانتاج (الكمية = غير المخطط بعد). */
function SalesOrderLinesDialog({ onClose, onPick }: { onClose: () => void; onPick: (lines: SalesLine[]) => void }) {
  const [q, setQ] = useState("")
  const [rows, setRows] = useState<SalesLine[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const keyFor = (row: SalesLine) => `${row.sales_order_id}:${row.item_id}`
  const run = useCallback(async (text: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/production-orders?sales_lines=1&q=${encodeURIComponent(text.trim())}`, { cache: "no-store" })
      const data: SalesLine[] = response.ok ? await response.json() : []
      setRows(data)
      setPicked(new Set(data.filter((row) => row.to_plan > 0).map(keyFor)))
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void run("") }, [run])
  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose() }}>
      <DialogContent dir={appDir()} className="max-h-[calc(100%-1.5rem)] w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="text-start"><DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-emerald-600" />{tr("طلبيات المبيعات المفتوحة")}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input autoFocus value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void run(q) } }} placeholder={tr("رقم الطلبية، العميل، الصنف")} />
          <Button onClick={() => void run(q)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("بحث")}</Button>
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr><th className="w-8 p-2" /><th className="p-2 text-start">{tr("الطلبية")}</th><th className="p-2 text-start">{tr("العميل")}</th><th className="p-2 text-start">{tr("الصنف")}</th><th className="p-2 text-start">{tr("المتبقي")}</th><th className="p-2 text-start">{tr("مخطط سابقاً")}</th><th className="p-2 text-start">{tr("التسليم")}</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = keyFor(row)
                return (
                  <tr key={key} className={`cursor-pointer border-t hover:bg-emerald-50 ${row.to_plan <= 0 ? "opacity-50" : ""}`} onClick={() => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })}>
                    <td className="p-2"><input type="checkbox" readOnly checked={picked.has(key)} className="h-4 w-4 accent-emerald-600" /></td>
                    <td className="p-2 font-mono text-xs">{row.order_number}<div className="text-[11px] text-slate-400">{row.order_date}</div></td>
                    <td className="max-w-[160px] truncate p-2">{row.customer_name || "—"}</td>
                    <td className="p-2">{row.product_name}</td>
                    <td className="p-2 font-mono">{qty(row.remaining)}</td>
                    <td className="p-2 font-mono text-slate-500">{row.planned ? qty(row.planned) : "—"}</td>
                    <td className="p-2 text-xs">{row.delivery_date || "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && !rows.length && <p className="p-6 text-center text-muted-foreground">{tr("لا توجد طلبيات مفتوحة لأصناف لها مكونات تصنيع")}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button disabled={!picked.size} onClick={() => onPick(rows.filter((row) => picked.has(keyFor(row))))} className="gap-1"><Plus className="h-4 w-4" />{tr("إضافة المختار ({0})", picked.size)}</Button>
          <Button variant="outline" onClick={onClose}>{tr("إلغاء")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
