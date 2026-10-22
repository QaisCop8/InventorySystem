"use client"
import { amountFractionOptions } from "@/lib/decimals"

import { useEffect, useMemo, useState } from "react"
import { Archive, Copy, Eye, FilePen, Loader2, Printer, RefreshCw, Search, Trash2 } from "lucide-react"
import { ReportHeader, ReportPage } from "@/components/reports/report-page"
import { ReportFilters } from "@/components/reports/report-filters"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AuditRow = {
  id: number
  source: "voucher" | "order" | "purchase_order"
  voucher_id: number | null
  vch_type: number | null
  vch_type_name: string | null
  vch_code: string | null
  vch_date: string | null
  branch_name: string | null
  amount: string | number | null
  action: string
  user_id: string | null
  user_name: string | null
  details: Record<string, any> | null
  created_at: string
  has_before: boolean
  has_after: boolean
}
type Snapshot = { header: Record<string, any>; items: any[]; journal?: any[] }
type AuditDetail = AuditRow & { before_data: Snapshot | null; after_data: Snapshot | null }

const ACTION_LABELS: Record<string, string> = {
  create: "إدخال السند", update: "تعديل السند", post: "ترحيل السند", cancel: "إلغاء السند", delete: "حذف السند",
  print: "طباعة", print_original: "طباعة نسخة أصلية", print_copy: "طباعة نسخة", print_review: "طباعة نسخة للتدقيق",
  clone: "نسخ السند", whatsapp: "إرسال واتساب", pdf: "حفظ PDF",
}
const ACTION_TONES: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800", update: "bg-amber-100 text-amber-800", post: "bg-blue-100 text-blue-800",
  cancel: "bg-orange-100 text-orange-800", delete: "bg-red-100 text-red-800", clone: "bg-violet-100 text-violet-800",
  whatsapp: "bg-green-100 text-green-800", pdf: "bg-slate-100 text-slate-800",
}
const toneFor = (action: string) => ACTION_TONES[action] || (action.startsWith("print") ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700")

// أسماء أعمدة رأس السند/الطلبية الأكثر أهمية — بقية الحقول تُعرض باسمها التقني
const HEADER_LABELS: Record<string, string> = {
  vch_code: "رقم السند", vch_date: "التاريخ", order_number: "رقم الطلبية", order_date: "تاريخ الطلبية", amount: "المبلغ",
  total_amount: "الإجمالي", account_id: "الحساب", customer_name: "اسم العميل", customer_id: "العميل", supplier_id: "المورد",
  to_account_id: "الحساب المقابل", currency_id: "العملة", rate: "سعر الصرف", exchange_rate: "سعر الصرف", note: "ملاحظات",
  general_notes: "ملاحظات", notes: "ملاحظات", status: "الحالة", vch_book_id: "الدفتر", branch_id: "الفرع", salesman_id: "المندوب",
  discount: "الخصم", discount_amount: "الخصم", vat: "الضريبة", vat_amount: "الضريبة", manual_voucher: "رقم يدوي",
  manual_date: "تاريخ يدوي", due_date: "تاريخ الاستحقاق", delivery_date: "تاريخ التسليم", store_id: "المستودع",
  to_store_id: "إلى مستودع", insert_user: "مستخدم الإدخال", is_printed: "مطبوع", order_status: "حالة الطلبية",
}
const HIDDEN_HEADER = new Set(["id", "company_id", "last_update_date", "updated_at", "created_at", "insert_date", "vch_status", "update_user"])

const STATUS_TEXT: Record<string, string> = { "1": "فعال", "2": "معتمد", "3": "ملغي" }
const dateTime = (value?: string | null) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const part = (number: number) => String(number).padStart(2, "0")
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
}
const day = (value?: string | null) => (value ? String(value).slice(0, 10) : "-")
const money = (value: unknown) => (value == null || value === "" ? "-" : Number(value).toLocaleString("en-US", amountFractionOptions()))
const today = (offset = 0) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }
const show = (key: string, value: unknown) => {
  if (value == null || value === "") return ""
  if (key === "status") return STATUS_TEXT[String(value)] || String(value)
  if (typeof value === "boolean") return value ? "نعم" : "لا"
  if (typeof value === "object") return JSON.stringify(value)
  const text = String(value)
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text
}

export default function VoucherAuditReport() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [users, setUsers] = useState<Array<{ user_id: string; user_name: string | null }>>([])
  const [voucherTypes, setVoucherTypes] = useState<Array<{ id: number; name: string }>>([])
  const [from, setFrom] = useState(today(-30))
  const [to, setTo] = useState(today())
  const [action, setAction] = useState("")
  const [vchType, setVchType] = useState("")
  const [userId, setUserId] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<AuditRow | null>(null)

  const load = async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ from, to, action, vch_type: vchType, user_id: userId, q: search })
      const response = await fetch(`/api/voucher-audit?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    void fetch("/api/vouchers/voucher-types", { cache: "no-store" }).then(r => r.ok ? r.json() : []).then((data: any[]) => {
      setVoucherTypes((Array.isArray(data) ? data : []).map(row => ({ id: Number(row.id), name: String(row.name || "") })).filter(row => row.id && row.name))
    }).catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => ({
    all: rows.length,
    changes: rows.filter(row => row.action === "update").length,
    deletes: rows.filter(row => row.action === "delete" || row.action === "cancel").length,
    prints: rows.filter(row => row.action.startsWith("print")).length,
  }), [rows])

  return <ReportPage loading={loading}>
    <ReportHeader title="تقرير ارشفة السندات" icon={Archive} category="الرقابة والتدقيق"
      description="كل ما حدث على السندات: الإدخال، التعديل، الترحيل، الإلغاء، الحذف، الطباعة (أصلية/نسخة/للتدقيق) والنسخ — مع نسخة السند قبل التعديل أو الحذف."
      actions={<Button onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {([["إجمالي العمليات", totals.all, Archive], ["تعديلات", totals.changes, FilePen], ["حذف وإلغاء", totals.deletes, Trash2], ["طباعة", totals.prints, Printer]] as const).map(([label, value, Icon]) =>
        <Card key={label} className="report-summary-card"><CardContent className="flex items-center justify-between p-5"><div><p className="report-summary-label text-sm text-muted-foreground">{label}</p><p className="report-summary-value mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-7 w-7 text-indigo-600" /></CardContent></Card>)}
    </div>

    <ReportFilters>
      <CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-[150px_150px_1fr_1fr_1fr_1.3fr_auto] xl:items-end">
        <div><Label htmlFor="va-from">من تاريخ</Label><Input id="va-from" className="mt-1" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
        <div><Label htmlFor="va-to">إلى تاريخ</Label><Input id="va-to" className="mt-1" type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
        <div><Label htmlFor="va-action">العملية</Label>
          <select id="va-action" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={action} onChange={event => setAction(event.target.value)}>
            <option value="">الكل</option>
            <option value="print_any">كل أنواع الطباعة</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div><Label htmlFor="va-type">نوع السند</Label>
          <select id="va-type" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={vchType} onChange={event => setVchType(event.target.value)}>
            <option value="">الكل</option>
            {voucherTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select></div>
        <div><Label htmlFor="va-user">المستخدم</Label>
          <select id="va-user" className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={userId} onChange={event => setUserId(event.target.value)}>
            <option value="">الكل</option>
            {users.map(user => <option key={user.user_id} value={user.user_id}>{user.user_name || user.user_id}</option>)}
          </select></div>
        <div><Label htmlFor="va-search">رقم السند / المستخدم</Label>
          <div className="relative mt-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="va-search" data-report-apply-on-enter className="pr-9" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === "Enter" && void load()} /></div></div>
        <Button data-report-apply onClick={() => void load()}>عرض</Button>
      </CardContent>
    </ReportFilters>

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-indigo-50 text-indigo-950"><tr>
            <th className="p-3 text-right">الوقت</th><th className="p-3 text-right">المستخدم</th><th className="p-3 text-right">العملية</th>
            <th className="p-3 text-right">نوع السند</th><th className="p-3 text-right">رقم السند</th><th className="p-3 text-right">تاريخ السند</th>
            <th className="p-3 text-right">الفرع</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">ملاحظة</th><th className="p-3 text-right print:hidden">التفاصيل</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="cursor-pointer border-t hover:bg-indigo-50/40" onDoubleClick={() => setSelected(row)}>
            <td className="p-3 whitespace-nowrap font-mono" dir="ltr">{dateTime(row.created_at)}</td>
            <td className="p-3">{row.user_name || row.user_id || "-"}</td>
            <td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneFor(row.action)}`}>{ACTION_LABELS[row.action] || row.action}</span></td>
            <td className="p-3">{row.vch_type_name || (row.source === "purchase_order" ? "طلبية مشتريات" : row.source === "order" ? "طلبية مبيعات" : row.vch_type ?? "-")}</td>
            <td className="p-3 font-mono font-bold text-indigo-700">{row.vch_code || "-"}</td>
            <td className="p-3 whitespace-nowrap">{day(row.vch_date)}</td>
            <td className="p-3">{row.branch_name || "-"}</td>
            <td className="p-3 font-mono" dir="ltr">{money(row.amount)}</td>
            <td className="p-3 text-xs text-muted-foreground">{[row.details?.channel === "pos" ? "نقطة البيع" : row.details?.channel, row.details?.copy_label, row.details?.phone].filter(Boolean).join(" · ") || "-"}</td>
            <td className="p-3 print:hidden"><Button size="sm" variant="ghost" onClick={() => setSelected(row)}><Eye className="ml-1 h-4 w-4" />عرض</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!loading && !rows.length && <div className="py-16 text-center text-muted-foreground">لا توجد عمليات مطابقة للفلاتر</div>}
    </div>

    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
      {/* الارتفاع/العرض نسبةً لمساحة العمل الحاوية (لا للشاشة) — 94vh كان يتجاوزها فيُقصّ أسفل النافذة */}
      <DialogContent dir="rtl" className="max-h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] max-w-6xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>أرشيف السند {selected?.vch_code || ""} — {selected ? ACTION_LABELS[selected.action] || selected.action : ""}</DialogTitle></DialogHeader>
        {selected && <AuditDetails row={selected} />}
      </DialogContent>
    </Dialog>
  </ReportPage>
}

function AuditDetails({ row }: { row: AuditRow }) {
  const [detail, setDetail] = useState<AuditDetail | null>(null)
  const [timeline, setTimeline] = useState<AuditRow[]>([])
  const [error, setError] = useState("")
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(`/api/voucher-audit?id=${row.id}`, { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "تعذر تحميل التفاصيل")
        if (!cancelled) setDetail(data)
        if (row.voucher_id) {
          const history = await fetch(`/api/voucher-audit?voucher_id=${row.voucher_id}&source=${row.source}&limit=300`, { cache: "no-store" }).then(r => r.json())
          if (!cancelled) setTimeline(Array.isArray(history.rows) ? [...history.rows].reverse() : [])
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "تعذر تحميل التفاصيل")
      }
    })()
    return () => { cancelled = true }
  }, [row])

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
  if (!detail) return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />جاري التحميل...</div>

  const before = detail.before_data
  const after = detail.after_data
  // @container: الأعمدة تتبع عرض النافذة نفسها لا عرض الشاشة (النافذة داخل مساحة عمل قد تكون أضيق بكثير)
  return <div className="@container min-w-0 space-y-6">
    <div className="grid gap-3 rounded-2xl bg-indigo-50 p-4 text-sm @md:grid-cols-2 @3xl:grid-cols-4">
      <div>المستخدم: <b>{detail.user_name || detail.user_id || "-"}</b></div>
      <div>الوقت: <b dir="ltr">{dateTime(detail.created_at)}</b></div>
      <div>نوع السند: <b>{detail.vch_type_name || "-"}</b></div>
      <div>الفرع: <b>{detail.branch_name || "-"}</b></div>
    </div>

    {(before || after) ? <>
      {before && after && <HeaderDiff before={before.header} after={after.header} />}
      {before && !after && <SnapshotView title={detail.action === "delete" ? "نسخة السند قبل الحذف" : "نسخة السند قبل العملية"} snapshot={before} tone="red" />}
      {!before && after && <SnapshotView title="السند كما حُفظ" snapshot={after} tone="emerald" />}
      {before && after && <div className="grid gap-4 @5xl:grid-cols-2">
        <SnapshotView title="قبل التعديل" snapshot={before} tone="red" hideHeader />
        <SnapshotView title="بعد التعديل" snapshot={after} tone="emerald" hideHeader />
      </div>}
    </> : <p className="rounded-xl border bg-slate-50 p-4 text-sm text-muted-foreground">هذه العملية ({ACTION_LABELS[detail.action] || detail.action}) لا تغيّر محتوى السند، لذا لا تُحفظ لها نسخة.</p>}

    {timeline.length > 0 && <div>
      <h3 className="mb-3 font-bold">سجل السند الكامل</h3>
      <ol className="relative space-y-2 border-r-2 border-indigo-100 pr-4">
        {timeline.map(event => <li key={event.id} className={`rounded-xl border p-3 text-sm ${event.id === detail.id ? "border-indigo-400 bg-indigo-50" : "bg-white"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${toneFor(event.action)}`}>{ACTION_LABELS[event.action] || event.action}</span>
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">{dateTime(event.created_at)}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{event.user_name || event.user_id || "-"}{event.details?.copy_label ? ` · ${event.details.copy_label}` : ""}</div>
        </li>)}
      </ol>
    </div>}
  </div>
}

function HeaderDiff({ before, after }: { before: Record<string, any>; after: Record<string, any> }) {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter(key => !HIDDEN_HEADER.has(key))
    .filter(key => show(key, before?.[key]) !== show(key, after?.[key]))
  if (!keys.length) return <p className="rounded-xl border bg-slate-50 p-3 text-sm text-muted-foreground">لا تغيير على بيانات رأس السند — راجع الأصناف/القيد أدناه.</p>
  return <div>
    <h3 className="mb-2 font-bold">الحقول التي تغيّرت</h3>
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm">
      <thead className="bg-slate-100"><tr><th className="p-2 text-right">الحقل</th><th className="p-2 text-right">قبل</th><th className="p-2 text-right">بعد</th></tr></thead>
      <tbody>{keys.map(key => <tr key={key} className="border-t">
        <td className="p-2 font-semibold">{HEADER_LABELS[key] || key}</td>
        <td className="p-2 text-red-700 line-through decoration-red-300">{show(key, before?.[key]) || "—"}</td>
        <td className="p-2 font-semibold text-emerald-700">{show(key, after?.[key]) || "—"}</td>
      </tr>)}</tbody>
    </table></div>
  </div>
}

const ITEM_COLUMNS: Array<[string[], string]> = [
  [["item_name", "product_name"], "الصنف"], [["qnty", "quantity"], "الكمية"], [["bonus", "bonus_quantity", "free_quantity"], "بونص"],
  [["price", "unit_price"], "السعر"], [["discount"], "الخصم"], [["batch_no", "batch_number"], "التشغيلة"], [["expiry_date"], "الانتهاء"], [["note", "notes"], "ملاحظة"],
]
const pick = (row: any, keys: string[]) => { for (const key of keys) if (row?.[key] != null && row[key] !== "") return row[key]; return "" }

function SnapshotView({ title, snapshot, tone, hideHeader = false }: { title: string; snapshot: Snapshot; tone: "red" | "emerald"; hideHeader?: boolean }) {
  const header = snapshot.header || {}
  const headerKeys = Object.keys(header).filter(key => !HIDDEN_HEADER.has(key) && show(key, header[key]) !== "")
  const itemColumns = ITEM_COLUMNS.filter(([keys]) => (snapshot.items || []).some(item => pick(item, keys) !== ""))
  return <div className={`min-w-0 rounded-2xl border-2 p-3 @md:p-4 ${tone === "red" ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
    <h3 className="mb-3 flex items-center gap-2 font-bold"><Copy className="h-4 w-4" />{title}</h3>
    {!hideHeader && <div className="mb-4 grid gap-x-4 gap-y-1 text-sm @md:grid-cols-2 @3xl:grid-cols-3">
      {headerKeys.map(key => <div key={key} className="flex gap-2"><span className="text-muted-foreground">{HEADER_LABELS[key] || key}:</span><b className="break-all">{show(key, header[key])}</b></div>)}
    </div>}
    {(snapshot.items || []).length > 0 && <>
      <h4 className="mb-1 text-sm font-bold">الأصناف ({snapshot.items.length})</h4>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs">
        <thead className="bg-white/70"><tr><th className="p-1.5 text-right">#</th>{itemColumns.map(([, label]) => <th key={label} className="p-1.5 text-right">{label}</th>)}</tr></thead>
        <tbody>{snapshot.items.map((item, index) => <tr key={item.id ?? index} className="border-t">
          <td className="p-1.5">{index + 1}</td>
          {itemColumns.map(([keys, label]) => <td key={label} className="p-1.5">{show(keys[0], pick(item, keys))}</td>)}
        </tr>)}</tbody>
      </table></div>
    </>}
    {(snapshot.journal || []).length > 0 && <>
      <h4 className="mb-1 mt-3 text-sm font-bold">القيد المحاسبي</h4>
      <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-xs">
        <thead className="bg-white/70"><tr><th className="p-1.5 text-right">الحساب</th><th className="p-1.5 text-right">مدين</th><th className="p-1.5 text-right">دائن</th><th className="p-1.5 text-right">ملاحظة</th></tr></thead>
        <tbody>{(snapshot.journal || []).map((line, index) => <tr key={line.id ?? index} className="border-t">
          <td className="p-1.5">{[line.account_code, line.account_name].filter(Boolean).join(" - ") || line.account_id}</td>
          <td className="p-1.5 font-mono" dir="ltr">{Number(line.credit_debit) === 1 ? money(line.amount) : ""}</td>
          <td className="p-1.5 font-mono" dir="ltr">{Number(line.credit_debit) === 2 ? money(line.amount) : ""}</td>
          <td className="p-1.5">{line.note || ""}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </div>
}
