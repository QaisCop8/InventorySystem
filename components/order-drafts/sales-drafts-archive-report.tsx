"use client"

import { useEffect, useMemo, useState } from "react"
import { Archive, CalendarDays, CheckCircle2, Clock3, ExternalLink, PackageSearch, RefreshCw, Search, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const today = (offset = 0) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }
const dateTime = (value?: string) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  const part = (number: number) => String(number).padStart(2, "0")
  return `${part(date.getDate())}/${part(date.getMonth() + 1)}/${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`
}
const statusLabel = (row: any) => row.status === "confirmed" ? "تحولت إلى طلبية مبيعات" : row.status === "cancelled" ? "ملغاة" : "مسودة"
const eventLabels: Record<string, string> = { created: "إنشاء المسودة", updated: "تعديل المسودة", production_availability_checked: "تفحص كميات الإنتاج", confirmed: "تأكيد وتحويل إلى طلبية مبيعات", cancelled: "إلغاء المسودة" }

export default function SalesDraftsArchiveReport() {
  const [rows, setRows] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [from, setFrom] = useState(today(-90))
  const [to, setTo] = useState(today())
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams({ from, to, search, status })
      const response = await fetch(`/api/order-drafts/archive?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(Array.isArray(data) ? data : [])
    } catch (reason: any) { setError(reason.message || "تعذر تحميل التقرير") } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const totals = useMemo(() => ({
    drafts: rows.length,
    confirmed: rows.filter((row) => row.status === "confirmed").length,
    checks: rows.reduce((sum, row) => sum + (row.events || []).filter((event: any) => event.event_type === "production_availability_checked").length, 0),
    value: rows.reduce((sum, row) => sum + (row.items || []).reduce((itemSum: number, item: any) => itemSum + Number(item.quantity) * Number(item.price) - Number(item.discount || 0), 0), 0),
  }), [rows])

  const openOrder = (row: any) => {
    if (!row.confirmed_order_id) return
    window.open(`/?section=sales-orders&open_order_id=${encodeURIComponent(row.confirmed_order_id)}`, "_blank", "noopener,noreferrer")
  }

  return <div dir="rtl" className="min-h-full space-y-5 bg-gradient-to-b from-slate-50/80 to-white p-3 md:p-6">
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 via-green-100 to-teal-50 p-6 text-emerald-950 shadow-lg"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><div className="rounded-2xl bg-white p-3 ring-1 ring-emerald-200"><Archive className="h-7 w-7 text-emerald-600" /></div><div><h1 className="text-2xl font-bold">تقرير ارشفة مسودات طلبيات المبيعات</h1><p className="mt-1 text-sm text-emerald-800">تتبع المسودة منذ إنشائها وحتى فحص الإنتاج وتحويلها إلى طلبية مبيعات.</p></div></div><Button onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث التقرير</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["إجمالي المسودات", totals.drafts, Archive], ["تحولت إلى طلبيات", totals.confirmed, CheckCircle2], ["مرات تفحص الإنتاج", totals.checks, PackageSearch], ["إجمالي القيمة", totals.value.toFixed(2), Clock3]].map(([label, value, Icon]: any) => <Card key={label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><Icon className="h-7 w-7 text-emerald-600" /></CardContent></Card>)}</div>
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_170px_170px_180px_auto] md:items-end"><div><Label>بحث</Label><div className="relative mt-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="رقم المسودة أو العميل أو الطلبية" /></div></div><div><Label>من تاريخ</Label><Input className="mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><Label>إلى تاريخ</Label><Input className="mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><div><Label>الحالة</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">الكل</option><option value="draft">مسودة</option><option value="confirmed">تحولت إلى طلبية</option><option value="cancelled">ملغاة</option></select></div><Button onClick={() => void load()}>تطبيق</Button></CardContent></Card>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-sm"><thead className="bg-emerald-100 text-emerald-950"><tr><th className="p-4 text-right">رقم المسودة</th><th className="p-4 text-right">العميل</th><th className="p-4 text-right">الحالة</th><th className="p-4 text-right">مستخدم الإدخال</th><th className="p-4 text-right">تاريخ الإدخال</th><th className="p-4 text-right">مستخدم التحويل إلى طلبية</th><th className="p-4 text-right">تاريخ التحويل إلى طلبية</th><th className="p-4 text-right">رقم طلبية المبيعات</th><th className="p-4 text-right">الأصناف</th><th className="p-4 text-right">تفحص الإنتاج</th><th className="p-4 text-right">آخر تغيير</th></tr></thead><tbody>{rows.map((row) => { const checks = (row.events || []).filter((event: any) => event.event_type === "production_availability_checked").length; const last = row.events?.[row.events.length - 1]; return <tr key={row.id} className="cursor-pointer border-t hover:bg-emerald-50/40" onDoubleClick={() => row.confirmed_order_id ? openOrder(row) : setSelected(row)} onClick={() => setSelected(row)}><td className="p-4 font-mono font-bold text-emerald-700">{row.draft_number}</td><td className="p-4">{row.customer_name}</td><td className="p-4"><Badge variant={row.status === "confirmed" ? "default" : "secondary"}>{statusLabel(row)}</Badge></td><td className="p-4">{row.created_by_name || row.created_by || "-"}</td><td className="p-4 whitespace-nowrap font-mono" dir="ltr">{dateTime(row.created_at)}</td><td className="p-4">{row.confirmed_order_id ? row.converted_by_name || "-" : "-"}</td><td className="p-4 whitespace-nowrap font-mono" dir="ltr">{dateTime(row.converted_at)}</td><td className="p-4">{row.order_number ? <button className="font-mono font-bold text-blue-700 underline" onDoubleClick={(event) => { event.stopPropagation(); openOrder(row) }}>{row.order_number}</button> : "-"}</td><td className="p-4">{row.items?.length || 0}</td><td className="p-4"><Badge variant={checks > 0 ? "default" : "secondary"}>{checks > 0 ? "نعم" : "لا"}</Badge></td><td className="p-4 whitespace-nowrap font-mono" dir="ltr">{last ? dateTime(last.created_at) : dateTime(row.updated_at)}</td></tr> })}</tbody></table></div>{!loading && !rows.length && <div className="py-16 text-center text-muted-foreground">لا توجد مسودات مطابقة للفلاتر</div>}</div>
    <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl" className="max-h-[94vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>أرشيف المسودة {selected?.draft_number}</DialogTitle></DialogHeader>{selected && <DraftArchiveDetails row={selected} onOpenOrder={() => openOrder(selected)} />}</DialogContent></Dialog>
  </div>
}

function DraftArchiveDetails({ row, onOpenOrder }: { row: any; onOpenOrder: () => void }) {
  const baseline = (row.events || []).length ? row.events : [{ id: "created", event_type: "created", user_id: row.created_by, created_at: row.created_at, details: {} }, ...(row.confirmed_order_id ? [{ id: "confirmed", event_type: "confirmed", created_at: row.updated_at, details: { order_number: row.order_number } }] : [])]
  return <div className="space-y-5"><div className="grid gap-3 rounded-2xl bg-emerald-50 p-5 sm:grid-cols-4"><div>العميل: <b>{row.customer_name}</b></div><div>تاريخ الطلب: <b>{String(row.order_date).slice(0, 10)}</b></div><div>التسليم: <b>{String(row.requested_delivery_date).slice(0, 10)}</b></div><div>العربون: <b>{Number(row.deposit_amount || 0).toFixed(2)}</b></div>{row.order_number && <Button className="sm:col-span-4" onClick={onOpenOrder}><ExternalLink className="ml-2 h-4 w-4" />فتح طلبية المبيعات {row.order_number}</Button>}</div><div className="grid gap-5 xl:grid-cols-2"><div><h3 className="mb-3 font-bold">الأصناف</h3><div className="space-y-2">{(row.items || []).map((item: any) => <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-xl border p-3"><span className="font-semibold">{item.product_name}</span><span>الكمية: {Number(item.quantity)}</span><span>القيمة: {(Number(item.quantity) * Number(item.price) - Number(item.discount || 0)).toFixed(2)}</span></div>)}</div><h3 className="mb-2 mt-5 font-bold">قائمة التحقق عند التأكيد</h3><pre className="max-h-56 overflow-auto rounded-xl border bg-slate-50 p-3 text-xs">{JSON.stringify(row.checklist_values || {}, null, 2)}</pre></div><div><h3 className="mb-3 font-bold">سجل التغييرات والتفحص</h3><div className="space-y-3">{baseline.map((event: any) => { const unavailable = (event.details?.items || event.details?.availability || []).filter((item: any) => !item.available); return <div key={event.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><b>{eventLabels[event.event_type] || event.event_type}</b><span className="text-xs text-muted-foreground">{dateTime(event.created_at)}</span></div><div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5" />{event.user_name || event.user_id || "-"}</div>{event.event_type === "production_availability_checked" && <div className={`mt-3 rounded-lg p-2 text-sm ${unavailable.length ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{unavailable.length ? `مواد غير متوفرة: ${unavailable.map((item: any) => item.product_name).join("، ")}` : "جميع مواد الإنتاج متوفرة"}</div>}{event.details?.continued_with_shortage && <div className="mt-2 text-sm font-semibold text-amber-700">تمت متابعة التأكيد رغم وجود نقص وفق إعدادات النظام.</div>}</div> })}</div></div></div></div>
}
