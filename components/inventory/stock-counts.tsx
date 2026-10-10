"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight, Barcode, Building2, CheckCircle2, ClipboardCheck, ClipboardList, Download, EyeOff, FileSpreadsheet,
  Hash, Layers, Lock, Plus, RefreshCw, RotateCcw, Ruler, Save, ScanLine, Search, Send, Trash2, Upload, Warehouse, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/components/auth/auth-context"
import { voucherHref } from "@/lib/voucher-links"
import {
  dimensionsLabel, isMeasuredProduct, measurementRequiresHeight, measurementRequiresLength, measurementRequiresWidth, quantityFromMeasurement,
} from "@/lib/measurement-formula"

// جرد المخازن — وثيقة جرد لكل فرع ومستودع وتاريخ قطع: إدخال الكميات المجرودة (يدوي/باركود/Excel، مع جرد
// أعمى اختياري) ⇐ إنهاء ومراجعة الفروقات ⇐ ترحيل (سند ادخال للزيادة + سند اخراج للعجز).
// الأصناف ذات الصلاحية/الرقم التشغيلي/المتغيرات تُعدّ لكل دفعة، وأصناف القياس (طول/عرض/ارتفاع) لكل مقاس
// بعدد القطع، وأصناف السيريال بمسح أرقامها.

type CountSummary = {
  id: number; count_no: string; warehouse_id: number; warehouse_name: string; branch_id: number | null; branch_name: string | null
  count_date: string; status: number; blind: boolean; notes: string; lines: number; counted: number; with_difference: number
  in_voucher_id: number | null; out_voucher_id: number | null; in_voucher_code: string | null; out_voucher_code: string | null
}
type CountSerial = { serial: string; in_system: boolean | null; counted: boolean }
type CountLine = {
  id: number; item_id: number; product_code: string; product_name: string; barcode: string; unit_name: string
  system_qty: number | null; counted_qty: number | null; unit_cost: number | null
  has_serial: boolean; has_expiry: boolean; has_batch: boolean; has_variants: boolean
  measurment_id: number; product_length: number; product_width: number; product_density: number
  expiry_date: string | null; batch_no: string; variant_label: string
  length: number | null; width: number | null; height: number | null
  system_pieces: number | null; counted_pieces: number | null
  manual: boolean; note: string; serials: CountSerial[]
}
type CountDetail = Omit<CountSummary, "lines" | "counted" | "with_difference"> & { system_hidden: boolean; lines: CountLine[] }
type LineEdit = { counted_qty: number | null; counted_pieces: number | null; note: string; text?: string }

const STATUS: Record<number, { label: string; className: string }> = {
  1: { label: "قيد الجرد", className: "bg-sky-100 text-sky-800" },
  2: { label: "منتهي — مراجعة", className: "bg-amber-100 text-amber-800" },
  3: { label: "مرحّل", className: "bg-emerald-100 text-emerald-800" },
  4: { label: "ملغى", className: "bg-slate-200 text-slate-600" },
}
const today = () => new Date().toISOString().slice(0, 10)
const dateOnly = (value?: string | null) => (value ? String(value).slice(0, 10) : "-")
const qty = (value: number | null | undefined) => (value == null ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }))
const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const isMeasured = (line: CountLine) => isMeasuredProduct(line.measurment_id)
const isLotProduct = (line: CountLine) => !line.has_serial && (line.has_expiry || line.has_batch || line.has_variants || isMeasured(line))
const productOf = (line: CountLine) => ({ measurment_id: line.measurment_id, length: line.product_length, width: line.product_width, density: line.product_density })
const piecesToQty = (line: CountLine, pieces: number | null) =>
  pieces == null ? null : Math.round(quantityFromMeasurement(productOf(line), { length: line.length, width: line.width, height: line.height, count: pieces }) * 1e6) / 1e6
const lotLabel = (line: Pick<CountLine, "variant_label" | "expiry_date" | "batch_no" | "length" | "width" | "height">) =>
  [line.variant_label, line.expiry_date ? `صلاحية ${line.expiry_date}` : "", line.batch_no ? `دفعة ${line.batch_no}` : "", dimensionsLabel(line) ? `مقاس ${dimensionsLabel(line)}` : ""]
    .filter(Boolean).join(" — ")

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error || "تعذر تنفيذ العملية")
  return data
}

const openVoucher = (id: number | null, type: number) => {
  if (id) window.open(voucherHref(id, type, sessionStorage.getItem("active_company_id")), "_blank", "noopener,noreferrer")
}

export default function StockCounts() {
  const [openId, setOpenId] = useState<number | null>(null)
  return openId ? <StockCountEditor countId={openId} onBack={() => setOpenId(null)} /> : <StockCountList onOpen={setOpenId} />
}

// ── قائمة وثائق الجرد ─────────────────────────────────────────────────────────────────────
function StockCountList({ onOpen }: { onOpen: (id: number) => void }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<CountSummary[]>([])
  const [status, setStatus] = useState(0)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api<CountSummary[]>(`/api/stock-counts?status=${status}`))
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [status, toast])
  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => ({
    open: rows.filter((row) => row.status === 1).length,
    review: rows.filter((row) => row.status === 2).length,
    posted: rows.filter((row) => row.status === 3).length,
  }), [rows])

  return (
    <div className="space-y-5" dir="rtl">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><ClipboardCheck className="h-6 w-6" /></span>
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">جرد المخازن</h1>
              <p className="text-xs text-emerald-50/90 sm:text-sm">عدّ فعلي لكل فرع ومستودع بتاريخ قطع — بالدفعات والمقاسات والأرقام التسلسلية — ثم ترحيل الفروقات بسندات تسوية</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-10 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث
            </Button>
            <Button onClick={() => setCreating(true)} className="h-10 rounded-xl bg-white font-bold text-emerald-700 hover:bg-emerald-50">
              <Plus className="ml-2 h-4 w-4" />جرد جديد
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["قيد الجرد", totals.open, ClipboardList, "text-sky-600"],
          ["بانتظار المراجعة والترحيل", totals.review, ClipboardCheck, "text-amber-600"],
          ["مرحّلة", totals.posted, CheckCircle2, "text-emerald-600"],
        ].map(([label, value, Icon, color]: any) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm">
            <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
            <Icon className={`h-7 w-7 ${color}`} />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[[0, "الكل"], [1, "قيد الجرد"], [2, "منتهي"], [3, "مرحّل"], [4, "ملغى"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(Number(value))}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${status === value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-emerald-100 text-emerald-950">
              <tr>
                {["رقم الجرد", "الفرع", "المستودع", "تاريخ القطع", "الحالة", "الأسطر", "المجرود", "أسطر بفروقات", "سندات التسوية", ""].map((header) => (
                  <th key={header} className="p-3 text-right">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t hover:bg-emerald-50/40" onDoubleClick={() => onOpen(row.id)}>
                  <td className="p-3 font-mono font-bold text-emerald-700">{row.count_no}{row.blind && <EyeOff className="mr-1 inline h-3.5 w-3.5 text-slate-400" aria-label="جرد أعمى" />}</td>
                  <td className="p-3">{row.branch_name || "—"}</td>
                  <td className="p-3 font-semibold">{row.warehouse_name}</td>
                  <td className="p-3 font-mono" dir="ltr">{dateOnly(row.count_date)}</td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[row.status]?.className}`}>{STATUS[row.status]?.label}</span></td>
                  <td className="p-3">{row.lines.toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${row.lines ? Math.round((row.counted / row.lines) * 100) : 0}%` }} /></div>
                      <span className="text-xs text-slate-500">{row.counted}/{row.lines}</span>
                    </div>
                  </td>
                  <td className="p-3">{row.with_difference > 0 ? <span className="font-bold text-amber-700">{row.with_difference}</span> : "0"}</td>
                  <td className="p-3 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {row.out_voucher_id && <button type="button" className="rounded bg-rose-50 px-2 py-0.5 font-mono text-rose-700 hover:underline" onClick={(event) => { event.stopPropagation(); openVoucher(row.out_voucher_id, 9) }}>{row.out_voucher_code}</button>}
                      {row.in_voucher_id && <button type="button" className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700 hover:underline" onClick={(event) => { event.stopPropagation(); openVoucher(row.in_voucher_id, 8) }}>{row.in_voucher_code}</button>}
                      {!row.out_voucher_id && !row.in_voucher_id && <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="p-3 text-left"><Button size="sm" variant="outline" className="rounded-lg" onClick={() => onOpen(row.id)}>فتح</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && <div className="py-14 text-center text-muted-foreground">لا توجد وثائق جرد — ابدأ بـ«جرد جديد»</div>}
        </div>
      </div>

      <NewCountDialog open={creating} onOpenChange={setCreating} onCreated={(id) => { setCreating(false); onOpen(id) }} />
    </div>
  )
}

function NewCountDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: number) => void }) {
  const { toast } = useToast()
  const { activeBranchId } = useAuth()
  const [warehouses, setWarehouses] = useState<{ id: number; warehouse_name: string }[]>([])
  const [branches, setBranches] = useState<{ id: number; branch_name: string; branch_code: string }[]>([])
  const blank = () => ({ branch_id: activeBranchId ? String(activeBranchId) : "", warehouse_id: "", count_date: today(), blind: true, include_zero: false, notes: "" })
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(blank())
    api<any[]>("/api/warehouses").then((rows) => setWarehouses(Array.isArray(rows) ? rows.filter((row) => row.is_active !== false) : [])).catch(() => setWarehouses([]))
    api<any[]>("/api/branches").then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      setBranches(list)
      // فرع وحيد ⇐ يُختار تلقائياً
      if (list.length === 1) setForm((current) => ({ ...current, branch_id: current.branch_id || String(list[0].id) }))
    }).catch(() => setBranches([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const create = async () => {
    if (!form.branch_id) { toast({ title: "تنبيه", description: "اختر الفرع", variant: "destructive" }); return }
    if (!form.warehouse_id) { toast({ title: "تنبيه", description: "اختر المستودع", variant: "destructive" }); return }
    setSaving(true)
    try {
      const result = await api<{ id: number; lines: number }>("/api/stock-counts", {
        method: "POST",
        body: JSON.stringify({ ...form, warehouse_id: Number(form.warehouse_id), branch_id: Number(form.branch_id) }),
      })
      toast({ title: "تم إنشاء الجرد", description: `تم توليد ${result.lines} سطراً للجرد` })
      onCreated(result.id)
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const selectClass = "mt-1 h-10 w-full rounded-lg border bg-background px-3"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-emerald-600" />جرد مخزن جديد</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>الفرع *</Label>
              <select className={selectClass} value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>
                <option value="">اختر الفرع</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}
              </select>
            </div>
            <div>
              <Label>المستودع *</Label>
              <select className={selectClass} value={form.warehouse_id} onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })}>
                <option value="">اختر المستودع</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.warehouse_name}</option>)}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">الكمية الدفترية تُحسب من حركات هذا الفرع على هذا المستودع فقط، وتُنشأ سندات التسوية على الفرع نفسه.</p>
          <div>
            <Label>تاريخ القطع (تاريخ الجرد) *</Label>
            <Input className="mt-1" type="date" value={form.count_date} onChange={(event) => setForm({ ...form, count_date: event.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">الكمية الدفترية = الرصيد بنهاية هذا اليوم؛ الحركات بعده لا تؤثر على الفروقات.</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={form.blind} onChange={(event) => setForm({ ...form, blind: event.target.checked })} />
            <span><b className="block text-sm">جرد أعمى</b><span className="text-xs text-muted-foreground">إخفاء الكميات والسيريالات الدفترية عن العدّادين أثناء الجرد، وإظهارها عند المراجعة فقط</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-600" checked={form.include_zero} onChange={(event) => setForm({ ...form, include_zero: event.target.checked })} />
            <span><b className="block text-sm">تضمين الأصناف ذات الرصيد صفر</b><span className="text-xs text-muted-foreground">وإلا تُضاف عند مسحها بالباركود إن وُجدت فعلياً</span></span>
          </label>
          <div>
            <Label>ملاحظات</Label>
            <Input className="mt-1" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="مثال: جرد نهاية الربع" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={() => void create()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "جاري الإنشاء..." : "إنشاء وبدء الجرد"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── وثيقة الجرد ───────────────────────────────────────────────────────────────────────────
function StockCountEditor({ countId, onBack }: { countId: number; onBack: () => void }) {
  const { toast } = useToast()
  const [count, setCount] = useState<CountDetail | null>(null)
  // text: النص الخام أثناء الكتابة (يسمح بكتابة كسور مثل "1." قبل اكتمال الرقم)
  const [edits, setEdits] = useState<Record<number, LineEdit>>({})
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "uncounted" | "difference" | "tracked">("all")
  const [scanCode, setScanCode] = useState("")
  const [scanQty, setScanQty] = useState("1")
  const [highlight, setHighlight] = useState<number | null>(null)
  const [posting, setPosting] = useState(false)
  const [serialLineId, setSerialLineId] = useState<number | null>(null)
  const [lotItemId, setLotItemId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<null | { message: string; run: () => void }>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<CountDetail>(`/api/stock-counts/${countId}`)
      setCount(data)
      setEdits({})
      return data
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
      return null
    }
  }, [countId, toast])
  useEffect(() => { void load() }, [load])

  const counting = count?.status === 1
  const hidden = Boolean(count?.system_hidden)
  const dirty = Object.keys(edits).length > 0

  const lineValue = (line: CountLine) => (edits[line.id] ? edits[line.id].counted_qty : line.counted_qty)
  const linePieces = (line: CountLine) => (edits[line.id] ? edits[line.id].counted_pieces : line.counted_pieces)
  const lineNote = (line: CountLine) => (edits[line.id] ? edits[line.id].note : line.note || "")
  const setLine = (line: CountLine, patch: Partial<LineEdit>) =>
    setEdits((current) => ({
      ...current,
      [line.id]: { ...(current[line.id] ?? { counted_qty: line.counted_qty, counted_pieces: line.counted_pieces, note: line.note || "" }), ...patch },
    }))
  const setPieces = (line: CountLine, pieces: number | null, text?: string) => setLine(line, { counted_pieces: pieces, counted_qty: piecesToQty(line, pieces), text })

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (count?.lines || []).filter((line) => {
      if (term && !`${line.product_code} ${line.product_name} ${line.barcode} ${lotLabel(line)} ${line.serials.map((s) => s.serial).join(" ")}`.toLowerCase().includes(term)) return false
      const value = lineValue(line)
      if (filter === "uncounted") return value == null
      if (filter === "tracked") return line.has_serial || isLotProduct(line)
      if (filter === "difference") return !hidden && value != null && Math.abs(Number(value) - Number(line.system_qty || 0)) > 0.000001
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, edits, search, filter, hidden])

  const summary = useMemo(() => {
    const lines = count?.lines || []
    let counted = 0, surplusValue = 0, shortageValue = 0, surplusLines = 0, shortageLines = 0
    for (const line of lines) {
      const value = lineValue(line)
      if (value == null) continue
      counted++
      if (hidden) continue
      const diff = Number(value) - Number(line.system_qty || 0)
      if (diff > 0.000001) { surplusLines++; surplusValue += diff * Number(line.unit_cost || 0) }
      if (diff < -0.000001) { shortageLines++; shortageValue += -diff * Number(line.unit_cost || 0) }
    }
    return { total: lines.length, counted, surplusValue, shortageValue, surplusLines, shortageLines }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, edits, hidden])

  const saveEdits = async (silent = false) => {
    if (!dirty) return true
    try {
      await api(`/api/stock-counts/${countId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "save_counts",
          lines: Object.entries(edits).map(([id, value]) => ({ id: Number(id), counted_qty: value.counted_qty, counted_pieces: value.counted_pieces, note: value.note })),
        }),
      })
      if (!silent) toast({ title: "تم الحفظ", description: "تم حفظ الكميات المجرودة" })
      await load()
      return true
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
      return false
    }
  }

  const runAction = async (action: string, extra: Record<string, any> = {}, success?: string) => {
    setBusy(true)
    try {
      if (!(await saveEdits(true))) return
      const result = await api(`/api/stock-counts/${countId}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) })
      if (success || result?.message) toast({ title: "تم", description: result?.message || success })
      await load()
      return result
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  const focusLine = (lineId: number) => {
    setHighlight(lineId)
    window.requestAnimationFrame(() => document.getElementById(`count-line-${lineId}`)?.scrollIntoView({ block: "center" }))
  }

  const resetScan = () => {
    setScanCode("")
    setScanQty("1")
    scanRef.current?.focus()
  }

  // مسح باركود/رقم صنف/رقم تسلسلي:
  //  • صنف بسطر واحد ⇐ تُضاف الكمية (أو عدد القطع لصنف القياس) للمجرود.
  //  • صنف بعدة دفعات/مقاسات ⇐ يُصفّى الجدول عليه لاختيار الدفعة، مع زر إضافة دفعة.
  //  • صنف سيريال ⇐ تُفتح نافذة السيريالات؛ رقم تسلسلي ⇐ يُعلَّم مجروداً على صنفه مباشرة.
  //  • غير موجود بالوثيقة ⇐ يُضاف (صنف دفعات ⇐ نافذة تحديد الدفعة).
  const handleScan = async () => {
    const code = scanCode.trim()
    if (!code || !count) return
    const amount = Number(scanQty || 1)
    if (!(amount > 0)) { toast({ title: "تنبيه", description: "الكمية يجب أن تكون أكبر من صفر", variant: "destructive" }); return }
    const upper = code.toUpperCase()
    const matches = count.lines.filter((item) => item.product_code?.toUpperCase() === upper || item.barcode === code)

    if (matches.length) {
      const first = matches[0]
      if (first.has_serial) { setSerialLineId(first.id); resetScan(); return }
      if (matches.length > 1) {
        setSearch(first.product_code)
        setFilter("all")
        toast({ title: "اختر الدفعة", description: `${first.product_name}: ${matches.length} دفعات/مقاسات — أدخل الكمية بالسطر الصحيح أو أضف دفعة جديدة` })
        resetScan()
        return
      }
      if (isMeasured(first)) {
        const nextPieces = Number(linePieces(first) || 0) + amount
        setPieces(first, nextPieces, String(nextPieces))
      } else {
        const nextCounted = Number(lineValue(first) || 0) + amount
        setLine(first, { counted_qty: nextCounted, text: String(nextCounted) })
      }
      focusLine(first.id)
      resetScan()
      return
    }

    try {
      if (!(await saveEdits(true))) return
      const serial = await api<{ line_id?: number; extra?: boolean; not_found?: boolean }>(`/api/stock-counts/${countId}`, { method: "PATCH", body: JSON.stringify({ action: "scan_serial", code }) })
      if (!serial.not_found && serial.line_id) {
        await load()
        focusLine(serial.line_id)
        toast({ title: "تم جرد الرقم التسلسلي", description: serial.extra ? `${code} — غير موجود دفترياً بهذا المستودع (زيادة)` : code })
        return
      }
      const result = await api<{ line_id?: number; need_lot?: boolean; item_id?: number }>(`/api/stock-counts/${countId}`, { method: "PATCH", body: JSON.stringify({ action: "add_item", code }) })
      if (result.need_lot && result.item_id) { setLotItemId(result.item_id); return }
      const data = await load()
      const line = data?.lines.find((item) => item.id === result.line_id)
      if (!line) return
      if (line.has_serial) { setSerialLineId(line.id); return }
      setEdits({ [line.id]: { counted_qty: Number(line.counted_qty || 0) + amount, counted_pieces: null, note: line.note || "" } })
      focusLine(line.id)
      toast({ title: "أُضيف صنف للجرد", description: `${line.product_code} — ${line.product_name}` })
    } catch (error: any) {
      toast({ title: "غير موجود", description: error.message, variant: "destructive" })
    } finally {
      resetScan()
    }
  }

  const exportExcel = async () => {
    if (!count) return
    const XLSX = await import("xlsx")
    const rows = count.lines.map((line) => ({
      "رقم الصنف": line.product_code,
      "اسم الصنف": line.product_name,
      "الباركود": line.barcode,
      "الوحدة": line.unit_name,
      "المتغير": line.variant_label,
      "تاريخ الصلاحية": line.expiry_date || "",
      "الرقم التشغيلي": line.batch_no,
      "الطول": line.length ?? "",
      "العرض": line.width ?? "",
      "الارتفاع": line.height ?? "",
      ...(hidden ? {} : { "الكمية الدفترية": line.system_qty, "القطع الدفترية": line.system_pieces ?? "" }),
      "عدد القطع المجرود": isMeasured(line) ? linePieces(line) ?? "" : "",
      "الكمية المجرودة": lineValue(line) ?? "",
      "الأرقام التسلسلية المجرودة": line.serials.filter((s) => s.counted).map((s) => s.serial).join(", "),
    }))
    const sheet = XLSX.utils.json_to_sheet(rows)
    ;(sheet as any)["!cols"] = [{ wch: 14 }, { wch: 36 }, { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }]
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "الجرد")
    XLSX.writeFile(book, `جرد-${count.count_no}-${count.warehouse_name}.xlsx`)
  }

  const importExcel = async (file: File) => {
    try {
      const XLSX = await import("xlsx")
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" })
      const pick = (row: Record<string, any>, keys: string[]) => {
        const key = Object.keys(row).find((name) => keys.includes(String(name).trim()))
        return key ? row[key] : ""
      }
      const asDate = (value: any) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10))
      const parsed = rows
        .map((row) => ({
          code: String(pick(row, ["رقم الصنف", "الكود", "code", "product_code"]) || pick(row, ["الباركود", "barcode"]) || "").trim(),
          counted_qty: pick(row, ["الكمية المجرودة", "الكمية", "counted", "counted_qty", "qty"]),
          counted_pieces: pick(row, ["عدد القطع المجرود", "عدد القطع", "العدد", "pieces"]),
          expiry_date: asDate(pick(row, ["تاريخ الصلاحية", "الصلاحية", "expiry_date"])),
          batch_no: String(pick(row, ["الرقم التشغيلي", "الدفعة", "batch_no"]) || ""),
          variant: String(pick(row, ["المتغير", "variant"]) || ""),
          length: pick(row, ["الطول", "length"]),
          width: pick(row, ["العرض", "width"]),
          height: pick(row, ["الارتفاع", "height"]),
        }))
        .filter((row) => row.code && (row.counted_qty !== "" || row.counted_pieces !== ""))
      if (!parsed.length) { toast({ title: "لا توجد بيانات", description: "الملف يجب أن يحوي عمودي «رقم الصنف» و«الكمية المجرودة» (أو «عدد القطع المجرود» لأصناف القياس)", variant: "destructive" }); return }
      const result = await runAction("import", { rows: parsed })
      if (result) {
        toast({
          title: "تم الاستيراد",
          description: `حُدِّث ${result.updated} سطراً${result.not_found?.length ? ` — لم يُطابَق: ${result.not_found.slice(0, 8).join("، ")}${result.not_found.length > 8 ? "…" : ""}` : ""}`,
        })
      }
    } catch (error: any) {
      toast({ title: "تعذر قراءة الملف", description: error.message, variant: "destructive" })
    }
  }

  if (!count) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground" dir="rtl">جاري تحميل الجرد...</div>

  const RENDER_LIMIT = 400
  const rendered = visible.slice(0, RENDER_LIMIT)
  const status = STATUS[count.status]
  const serialLine = count.lines.find((line) => line.id === serialLineId) || null

  const moveNext = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("[data-count-input]"))
    inputs[inputs.indexOf(event.currentTarget) + 1]?.focus()
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* الرأس */}
      <div className="rounded-2xl bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-5 py-4 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => (dirty ? setConfirm({ message: "توجد كميات غير محفوظة، هل تريد الخروج دون حفظ؟", run: onBack }) : onBack())}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 hover:bg-white/25" aria-label="رجوع">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                جرد رقم <span className="font-mono">{count.count_no}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs ring-1 ring-white/25">{status?.label}</span>
                {count.blind && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs ring-1 ring-white/25"><EyeOff className="h-3 w-3" />جرد أعمى</span>}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-emerald-50/90">
                {count.branch_name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{count.branch_name}</span>}
                <span className="inline-flex items-center gap-1"><Warehouse className="h-3 w-3" />{count.warehouse_name}</span>
                <span>تاريخ القطع {dateOnly(count.count_date)}</span>
                {count.notes && <span>— {count.notes}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {counting && (
              <>
                <HeaderButton icon={Save} label={dirty ? "حفظ*" : "حفظ"} onClick={() => void saveEdits()} disabled={busy || !dirty} />
                <HeaderButton icon={FileSpreadsheet} label="تصدير Excel" onClick={() => void exportExcel()} />
                <HeaderButton icon={Upload} label="استيراد Excel" onClick={() => fileRef.current?.click()} disabled={busy} />
                <HeaderButton icon={CheckCircle2} label="إنهاء الجرد" primary disabled={busy}
                  onClick={() => setConfirm({
                    message: summary.counted < summary.total
                      ? `لم يُجرد ${summary.total - summary.counted} سطراً بعد. إنهاء الجرد يُظهر الفروقات للمراجعة. هل تريد المتابعة؟`
                      : "إنهاء الجرد وعرض الفروقات للمراجعة؟",
                    run: () => void runAction("finish", {}, "انتهى الجرد — راجع الفروقات ثم رحّل"),
                  })} />
              </>
            )}
            {count.status === 2 && (
              <>
                <HeaderButton icon={RefreshCw} label="تحديث الدفترية" onClick={() => void runAction("refresh", {}, "أُعيد احتساب الكميات الدفترية بتاريخ القطع")} disabled={busy} />
                <HeaderButton icon={Download} label="تصدير Excel" onClick={() => void exportExcel()} />
                <HeaderButton icon={RotateCcw} label="إعادة فتح" onClick={() => void runAction("reopen", {}, "أُعيد فتح الجرد")} disabled={busy} />
                <HeaderButton icon={Send} label="ترحيل الفروقات" primary onClick={() => setPosting(true)} disabled={busy} />
              </>
            )}
            {count.status === 3 && (
              <>
                {count.out_voucher_id && <HeaderButton icon={Lock} label={`سند اخراج ${count.out_voucher_code}`} onClick={() => openVoucher(count.out_voucher_id, 9)} />}
                {count.in_voucher_id && <HeaderButton icon={Lock} label={`سند ادخال ${count.in_voucher_code}`} onClick={() => openVoucher(count.in_voucher_id, 8)} />}
                <HeaderButton icon={Download} label="تصدير Excel" onClick={() => void exportExcel()} />
              </>
            )}
            {(count.status === 1 || count.status === 2) && (
              <HeaderButton icon={XCircle} label="إلغاء الجرد" onClick={() => setConfirm({ message: "إلغاء وثيقة الجرد؟ لن تُرحَّل أي فروقات.", run: () => void runAction("cancel", {}, "أُلغي الجرد") })} disabled={busy} />
            )}
            {count.status !== 3 && (
              <HeaderButton icon={Trash2} label="حذف" onClick={() => setConfirm({
                message: "حذف وثيقة الجرد نهائياً بكل كمياتها المجرودة؟",
                run: async () => {
                  try { await api(`/api/stock-counts/${countId}`, { method: "DELETE" }); onBack() }
                  catch (error: any) { toast({ title: "خطأ", description: error.message, variant: "destructive" }) }
                },
              })} disabled={busy} />
            )}
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importExcel(file) }} />

      {/* شريط المسح + الملخص */}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        {counting ? (
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-white p-3 shadow-sm">
            <div className="min-w-[220px] flex-1">
              <Label className="text-xs text-slate-500">باركود / رقم الصنف / رقم تسلسلي (Enter للإضافة)</Label>
              <div className="relative mt-1">
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <Input ref={scanRef} autoFocus value={scanCode} onChange={(event) => setScanCode(event.target.value)} className="h-10 pr-9 font-mono"
                  placeholder="امسح الباركود أو الرقم التسلسلي أو اكتب رقم الصنف"
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleScan() } }} />
              </div>
            </div>
            <div className="w-24">
              <Label className="text-xs text-slate-500">الكمية / القطع</Label>
              <Input value={scanQty} onChange={(event) => setScanQty(event.target.value)} inputMode="decimal" className="mt-1 h-10 text-center"
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleScan() } }} />
            </div>
            <Button onClick={() => void handleScan()} className="h-10 bg-emerald-600 hover:bg-emerald-700"><Plus className="ml-1 h-4 w-4" />إضافة</Button>
          </div>
        ) : <div />}
        <div className="grid grid-cols-3 gap-2 rounded-2xl border bg-white p-3 text-center shadow-sm">
          <div className="px-2"><p className="text-[11px] text-slate-500">المجرود</p><p className="text-lg font-extrabold">{summary.counted}<span className="text-xs font-normal text-slate-400">/{summary.total}</span></p></div>
          {hidden ? (
            <div className="col-span-2 flex items-center justify-center gap-2 text-xs text-slate-500"><EyeOff className="h-4 w-4" />الفروقات تظهر بعد إنهاء الجرد</div>
          ) : (
            <>
              <div className="px-2"><p className="text-[11px] text-emerald-700">زيادة ({summary.surplusLines})</p><p className="text-lg font-extrabold text-emerald-700">{money(summary.surplusValue)}</p></div>
              <div className="px-2"><p className="text-[11px] text-rose-700">عجز ({summary.shortageLines})</p><p className="text-lg font-extrabold text-rose-700">{money(summary.shortageValue)}</p></div>
            </>
          )}
        </div>
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pr-9" placeholder="بحث برقم أو اسم أو باركود الصنف، الدفعة، أو رقم تسلسلي" />
        </div>
        {([["all", "الكل"], ["uncounted", "غير مجرود"], ["tracked", "دفعات / مقاسات / سيريال"], ...(hidden ? [] : [["difference", "بفروقات"]])] as [typeof filter, string][]).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === value ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* الأسطر */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="sticky top-0 z-[1] bg-emerald-100 text-emerald-950">
              <tr>
                <th className="p-3 text-right">#</th>
                <th className="p-3 text-right">رقم الصنف</th>
                <th className="p-3 text-right">اسم الصنف / الدفعة</th>
                <th className="p-3 text-right">الوحدة</th>
                {!hidden && <th className="p-3 text-center">الدفترية</th>}
                <th className="p-3 text-center">المجرودة</th>
                {!hidden && <th className="p-3 text-center">الفرق</th>}
                {!hidden && <th className="p-3 text-center">قيمة الفرق</th>}
                <th className="p-3 text-right">ملاحظة</th>
                {counting && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {rendered.map((line, index) => {
                const value = lineValue(line)
                const diff = value == null || hidden ? null : Number(value) - Number(line.system_qty || 0)
                const diffClass = diff == null || Math.abs(diff) < 0.000001 ? "text-slate-400" : diff > 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"
                const measured = isMeasured(line)
                const label = lotLabel(line)
                return (
                  <tr key={line.id} id={`count-line-${line.id}`}
                    className={`border-t align-top ${highlight === line.id ? "bg-emerald-50" : value == null ? "" : "bg-slate-50/40"} ${edits[line.id] ? "shadow-[inset_-3px_0_0_0_rgb(245_158_11)]" : ""}`}>
                    <td className="p-3 text-xs text-slate-400">{index + 1}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{line.product_code}</td>
                    <td className="p-3">
                      <div className="font-semibold">{line.product_name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {line.has_serial && <Tag icon={Hash} tone="violet">سيريال</Tag>}
                        {line.variant_label && <Tag icon={Layers} tone="sky">{line.variant_label}</Tag>}
                        {line.expiry_date && <Tag tone="amber">صلاحية {line.expiry_date}</Tag>}
                        {line.batch_no && <Tag tone="amber">دفعة {line.batch_no}</Tag>}
                        {measured && <Tag icon={Ruler} tone="teal">{dimensionsLabel(line) ? `مقاس ${dimensionsLabel(line)}` : "بلا أبعاد"}</Tag>}
                        {isLotProduct(line) && !label && <Tag tone="slate">بلا دفعة</Tag>}
                        {line.manual && <Tag tone="emerald">أُضيف أثناء الجرد</Tag>}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">{line.unit_name}</td>
                    {!hidden && (
                      <td className="p-3 text-center tabular-nums">
                        {qty(line.system_qty)}
                        {measured && line.system_pieces != null && <div className="text-[11px] text-slate-400">{qty(line.system_pieces)} قطعة</div>}
                      </td>
                    )}
                    <td className="p-2 text-center">
                      {line.has_serial ? (
                        <button type="button" onClick={() => setSerialLineId(line.id)}
                          className="mx-auto flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100">
                          <ScanLine className="h-3.5 w-3.5" />{value == null ? "مسح الأرقام" : `${qty(value)} رقم`}
                        </button>
                      ) : measured ? (
                        counting ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Input value={edits[line.id]?.text ?? (linePieces(line) ?? "")} inputMode="decimal" className="h-8 w-24 text-center tabular-nums" placeholder="القطع"
                              onChange={(event) => {
                                const raw = event.target.value.trim()
                                const parsed = Number(raw)
                                setPieces(line, raw === "" || !Number.isFinite(parsed) ? null : parsed, event.target.value)
                              }}
                              onKeyDown={moveNext} data-count-input />
                            <span className="text-[11px] text-slate-500">{value == null ? "عدد القطع" : `= ${qty(value)} ${line.unit_name}`}</span>
                          </div>
                        ) : (
                          <span className="tabular-nums">{qty(value)}{linePieces(line) != null && <div className="text-[11px] text-slate-400">{qty(linePieces(line))} قطعة</div>}</span>
                        )
                      ) : counting ? (
                        <Input value={edits[line.id]?.text ?? (value ?? "")} inputMode="decimal" className="mx-auto h-8 w-24 text-center tabular-nums"
                          onChange={(event) => {
                            const raw = event.target.value.trim()
                            const parsed = Number(raw)
                            setLine(line, { text: event.target.value, counted_qty: raw === "" || !Number.isFinite(parsed) ? null : parsed })
                          }}
                          onKeyDown={moveNext} data-count-input />
                      ) : <span className="tabular-nums">{qty(value)}</span>}
                    </td>
                    {!hidden && <td className={`p-3 text-center tabular-nums ${diffClass}`}>{diff == null ? "—" : `${diff > 0 ? "+" : ""}${qty(diff)}`}</td>}
                    {!hidden && <td className={`p-3 text-center tabular-nums ${diffClass}`}>{diff == null ? "—" : money(diff * Number(line.unit_cost || 0))}</td>}
                    <td className="p-2">
                      {counting
                        ? <Input value={lineNote(line)} onChange={(event) => setLine(line, { note: event.target.value })} className="h-8 min-w-[140px]" />
                        : <span className="text-xs text-slate-500">{line.note || ""}</span>}
                    </td>
                    {counting && (
                      <td className="whitespace-nowrap p-2 text-left">
                        {isLotProduct(line) && (
                          <button type="button" title="إضافة دفعة / مقاس / متغير لهذا الصنف" onClick={() => setLotItemId(line.item_id)}
                            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"><Plus className="h-4 w-4" /></button>
                        )}
                        {line.manual && !Number(line.system_qty || 0) && (
                          <button type="button" title="حذف السطر المضاف" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                            onClick={() => setConfirm({ message: "حذف هذا السطر المضاف أثناء الجرد؟", run: () => void runAction("remove_line", { line_id: line.id }) })}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!visible.length && <div className="py-12 text-center text-muted-foreground">لا توجد أصناف مطابقة</div>}
          {visible.length > RENDER_LIMIT && <div className="border-t bg-amber-50 py-2 text-center text-xs text-amber-800">يُعرض أول {RENDER_LIMIT} من {visible.length} — استخدم البحث أو الباركود للوصول لصنف</div>}
        </div>
      </div>

      <SerialDialog
        line={serialLine}
        countId={countId}
        editable={counting}
        hidden={hidden}
        onClose={() => setSerialLineId(null)}
        onChanged={async () => { if (await saveEdits(true)) await load() }}
      />

      <AddLotDialog
        countId={countId}
        itemId={lotItemId}
        onClose={() => setLotItemId(null)}
        onAdded={async (lineId) => {
          setLotItemId(null)
          await load()
          focusLine(lineId)
        }}
        beforeAdd={() => saveEdits(true)}
      />

      <PostDialog open={posting} onOpenChange={setPosting} summary={summary}
        onPost={async (options) => {
          const result = await runAction("post", options)
          if (result?.ok) {
            setPosting(false)
            const parts = [result.out_voucher && `اخراج ${result.out_voucher.vch_code}`, result.in_voucher && `ادخال ${result.in_voucher.vch_code}`].filter(Boolean)
            toast({ title: "تم الترحيل", description: parts.length ? `سندات التسوية: ${parts.join("، ")}` : result.message })
          }
        }} />

      <ConfirmDialogYesNo useAppDialog visible={!!confirm} title="تأكيد" message={confirm?.message || ""}
        onConfirm={() => { const action = confirm?.run; setConfirm(null); action?.() }}
        onCancel={() => setConfirm(null)} />
    </div>
  )
}

const TAG_TONES: Record<string, string> = {
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-800",
  teal: "bg-teal-50 text-teal-700",
  slate: "bg-slate-100 text-slate-500",
  emerald: "bg-emerald-50 text-emerald-700",
}
function Tag({ icon: Icon, tone, children }: { icon?: any; tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${TAG_TONES[tone]}`}>
      {Icon && <Icon className="h-3 w-3" />}{children}
    </span>
  )
}

function HeaderButton({ icon: Icon, label, onClick, disabled, primary }: { icon: any; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled}
      className={primary ? "h-9 rounded-xl bg-white font-bold text-emerald-700 hover:bg-emerald-50" : "h-9 rounded-xl border border-white/30 bg-white/10 text-white hover:bg-white/20"}>
      <Icon className="ml-1.5 h-4 w-4" />{label}
    </Button>
  )
}

// ── نافذة السيريالات: الدفترية (إن لم يكن الجرد أعمى) مع علامة المجرود، ومسح أرقام جديدة ─────────
function SerialDialog({ line, countId, editable, hidden, onClose, onChanged }: {
  line: CountLine | null; countId: number; editable: boolean; hidden: boolean; onClose: () => void; onChanged: () => Promise<void>
}) {
  const { toast } = useToast()
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [term, setTerm] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (line) { setCode(""); setTerm(""); window.setTimeout(() => inputRef.current?.focus(), 80) } }, [line?.id])

  const toggle = async (serial: string, counted: boolean) => {
    if (!line) return
    setBusy(true)
    try {
      await api(`/api/stock-counts/${countId}`, { method: "PATCH", body: JSON.stringify({ action: "set_serial", line_id: line.id, serial, counted }) })
      await onChanged()
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const scan = async () => {
    const serial = code.trim()
    if (!serial) return
    setCode("")
    await toggle(serial, true)
  }

  const serials = (line?.serials || []).filter((s) => !term.trim() || s.serial.toLowerCase().includes(term.trim().toLowerCase()))
  const countedCount = (line?.serials || []).filter((s) => s.counted).length
  const systemCount = (line?.serials || []).filter((s) => s.in_system).length
  return (
    <Dialog open={!!line} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-violet-600" />الأرقام التسلسلية — {line?.product_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm">
            <div><p className="text-[11px] text-slate-500">المجرودة</p><p className="text-lg font-extrabold text-violet-700">{countedCount}</p></div>
            <div><p className="text-[11px] text-slate-500">الدفترية</p><p className="text-lg font-extrabold">{hidden ? "—" : systemCount}</p></div>
            <div><p className="text-[11px] text-slate-500">زائدة (غير دفترية)</p><p className="text-lg font-extrabold text-emerald-700">{hidden ? "—" : (line?.serials || []).filter((s) => s.counted && !s.in_system).length}</p></div>
          </div>
          {editable && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-600" />
                <Input ref={inputRef} value={code} onChange={(event) => setCode(event.target.value)} disabled={busy} className="h-10 pr-9 font-mono" placeholder="امسح الرقم التسلسلي ثم Enter"
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void scan() } }} />
              </div>
              <Button onClick={() => void scan()} disabled={busy || !code.trim()} className="h-10 bg-violet-600 hover:bg-violet-700"><Plus className="ml-1 h-4 w-4" />جرد</Button>
            </div>
          )}
          <Input value={term} onChange={(event) => setTerm(event.target.value)} className="h-9" placeholder="بحث في الأرقام" />
          <div className="max-h-[45vh] overflow-auto rounded-xl border">
            {serials.length ? serials.map((s) => (
              <label key={s.serial} className={`flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0 ${s.counted ? "bg-violet-50/50" : ""}`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={s.counted} disabled={!editable || busy} onChange={(event) => void toggle(s.serial, event.target.checked)} />
                  <span className="font-mono">{s.serial}</span>
                </span>
                {!hidden && (
                  s.in_system
                    ? (s.counted ? <span className="text-[11px] font-bold text-emerald-700">موجود</span> : <span className="text-[11px] font-bold text-rose-600">مفقود</span>)
                    : <span className="text-[11px] font-bold text-amber-700">زائد — غير دفتري</span>
                )}
              </label>
            )) : <div className="py-8 text-center text-sm text-muted-foreground">{hidden ? "لم يُمسح أي رقم بعد" : "لا توجد أرقام"}</div>}
          </div>
          <p className="text-xs text-muted-foreground">عند الترحيل: الأرقام الدفترية غير المجرودة تُخرَج بسند الإخراج، والأرقام الزائدة تُدخَل بسند الإدخال.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── نافذة إضافة دفعة / مقاس / متغير لصنف أثناء الجرد ───────────────────────────────────────
type ItemOptions = {
  product: { id: number; product_code: string; product_name: string; has_expiry: boolean; has_batch: boolean; has_variants: boolean; measurment_id: number }
  attributes: { id: number; name: string; values: { id: number; name: string }[] }[]
}
function AddLotDialog({ countId, itemId, onClose, onAdded, beforeAdd }: {
  countId: number; itemId: number | null; onClose: () => void; onAdded: (lineId: number) => Promise<void>; beforeAdd: () => Promise<boolean>
}) {
  const { toast } = useToast()
  const [options, setOptions] = useState<ItemOptions | null>(null)
  const [form, setForm] = useState({ expiry_date: "", batch_no: "", length: "", width: "", height: "" })
  const [values, setValues] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!itemId) return
    setOptions(null)
    setForm({ expiry_date: "", batch_no: "", length: "", width: "", height: "" })
    setValues({})
    api<ItemOptions>(`/api/stock-counts/${countId}?item_options=${itemId}`).then(setOptions).catch((error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
      onClose()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, countId])

  const product = options?.product
  const measurement = Number(product?.measurment_id || 1)
  const add = async () => {
    if (!product) return
    setSaving(true)
    try {
      if (!(await beforeAdd())) return
      const result = await api<{ line_id: number; existed?: boolean }>(`/api/stock-counts/${countId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "add_lot",
          item_id: product.id,
          ...form,
          attribute_value_ids: Object.values(values).map(Number).filter((id) => id > 0),
        }),
      })
      toast({ title: result.existed ? "الدفعة موجودة" : "أُضيفت الدفعة", description: result.existed ? "انتقل للسطر الموجود لإدخال كميته" : "أدخل الكمية المجرودة بالسطر الجديد" })
      await onAdded(result.line_id)
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!itemId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-emerald-600" />إضافة دفعة / مقاس للجرد</DialogTitle></DialogHeader>
        {!product ? <div className="py-10 text-center text-sm text-muted-foreground">جاري التحميل...</div> : (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="font-mono text-slate-500">{product.product_code}</span> — <b>{product.product_name}</b></div>
            {options!.attributes.map((attribute) => (
              <div key={attribute.id}>
                <Label>{attribute.name} *</Label>
                <select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={values[attribute.id] || ""} onChange={(event) => setValues({ ...values, [attribute.id]: event.target.value })}>
                  <option value="">اختر {attribute.name}</option>
                  {attribute.values.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}
                </select>
              </div>
            ))}
            {(product.has_expiry || product.has_batch) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {product.has_expiry && <div><Label>تاريخ الصلاحية *</Label><Input className="mt-1" type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} /></div>}
                {product.has_batch && <div><Label>الرقم التشغيلي *</Label><Input className="mt-1" value={form.batch_no} onChange={(event) => setForm({ ...form, batch_no: event.target.value })} /></div>}
              </div>
            )}
            {isMeasuredProduct(measurement) && (
              <div className="grid gap-3 sm:grid-cols-3">
                {measurementRequiresLength(measurement) && <div><Label>الطول *</Label><Input className="mt-1" inputMode="decimal" value={form.length} onChange={(event) => setForm({ ...form, length: event.target.value })} /></div>}
                {measurementRequiresWidth(measurement) && <div><Label>العرض *</Label><Input className="mt-1" inputMode="decimal" value={form.width} onChange={(event) => setForm({ ...form, width: event.target.value })} /></div>}
                {measurementRequiresHeight(measurement) && <div><Label>الارتفاع *</Label><Input className="mt-1" inputMode="decimal" value={form.height} onChange={(event) => setForm({ ...form, height: event.target.value })} /></div>}
                <p className="text-xs text-muted-foreground sm:col-span-3">يُعدّ هذا المقاس بعدد القطع، والكمية = معادلة نوع قياس الصنف.</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>إلغاء</Button>
              <Button onClick={() => void add()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "جاري الإضافة..." : "إضافة للجرد"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PostDialog({ open, onOpenChange, summary, onPost }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: { total: number; counted: number; surplusValue: number; shortageValue: number; surplusLines: number; shortageLines: number }
  onPost: (options: { in_book_id: number | null; out_book_id: number | null; uncounted: "skip" | "zero" }) => Promise<void>
}) {
  const [books, setBooks] = useState<{ id: number; name: string }[]>([])
  const [inBook, setInBook] = useState("")
  const [outBook, setOutBook] = useState("")
  const [uncounted, setUncounted] = useState<"skip" | "zero">("skip")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    api<any[]>("/api/vouchers/voucher-books").then((rows) => {
      const list = Array.isArray(rows) ? rows : []
      setBooks(list)
      if (list[0]) { setInBook((value) => value || String(list[0].id)); setOutBook((value) => value || String(list[0].id)) }
    }).catch(() => setBooks([]))
  }, [open])

  const uncountedLines = summary.total - summary.counted
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-emerald-600" />ترحيل فروقات الجرد</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <div>زيادة: <b className="text-emerald-700">{summary.surplusLines} سطر — {money(summary.surplusValue)}</b></div>
            <div>عجز: <b className="text-rose-700">{summary.shortageLines} سطر — {money(summary.shortageValue)}</b></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>دفتر سندات الإدخال (الزيادة)</Label>
              <select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={inBook} onChange={(event) => setInBook(event.target.value)}>
                {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
              </select>
            </div>
            <div>
              <Label>دفتر سندات الإخراج (العجز)</Label>
              <select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={outBook} onChange={(event) => setOutBook(event.target.value)}>
                {books.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
              </select>
            </div>
          </div>
          {uncountedLines > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-bold text-amber-900">{uncountedLines} سطراً لم يُجرد — كيف يُعامَل؟</p>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" className="accent-emerald-600" checked={uncounted === "skip"} onChange={() => setUncounted("skip")} />تجاهلها (تبقى أرصدتها كما هي)</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" className="accent-emerald-600" checked={uncounted === "zero"} onChange={() => setUncounted("zero")} />اعتبار كميتها صفراً (تُخرَج كعجز)</label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">يُنشأ سند اخراج بضاعة للعجز وسند ادخال بضاعة للزيادة على فرع الجرد وبتاريخ القطع ومرحّلين، بتكلفة متوسط الصنف بذلك التاريخ — كل سطر بدفعته (صلاحية/رقم تشغيلي/متغير) ومقاسه وعدد قطعه وأرقامه التسلسلية.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button disabled={saving} className="bg-emerald-600 hover:bg-emerald-700"
              onClick={async () => {
                setSaving(true)
                try { await onPost({ in_book_id: Number(inBook) || null, out_book_id: Number(outBook) || null, uncounted }) }
                finally { setSaving(false) }
              }}>
              {saving ? "جاري الترحيل..." : "ترحيل"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
