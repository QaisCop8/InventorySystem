"use client"

import { useEffect, useMemo, useState } from "react"
import { Archive, CalendarDays, ChevronDown, ChevronUp, Clock3, PackageCheck, RefreshCw, Search, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/components/auth/auth-context"

const actionLabels: Record<string, string> = {
  create: "إنشاء الطلب", update: "تعديل الطلب", delete: "حذف الطلب",
  requestAudit: "تدقيق الطلب", prepare: "تجهيز الطلب", readyAudit: "تدقيق الكمية المجهزة",
  send: "إرسال الطلب", receive: "استلام الطلب", receivedAudit: "تدقيق البضاعة المستلمة",
}
const statusLabels: Record<number, string> = { 1: "مسودة", 2: "تدقيق الطلب", 3: "التجهيز", 4: "تدقيق الجاهز", 5: "الإرسال", 6: "الاستلام", 7: "تدقيق المستلم", 8: "مكتمل" }
const dateValue = (offset = 0) => { const value = new Date(); value.setDate(value.getDate() + offset); return value.toISOString().slice(0, 10) }
const formatDateTime = (value: string) => value ? `\u200E${new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, numberingSystem: "latn" }).format(new Date(value))}` : "-"
const formatDuration = (from?: string, to?: string) => {
  if (!from || !to) return "-"
  const milliseconds = Math.max(0, new Date(to).getTime() - new Date(from).getTime())
  const minutes = Math.floor(milliseconds / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  return [days ? `${days} day${days === 1 ? "" : "s"}` : "", hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "", `${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`].filter(Boolean).join(" ")
}

export default function InternalRequestsArchiveReport() {
  const { activeBranchId } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [from, setFrom] = useState(dateValue(-30))
  const [to, setTo] = useState(dateValue())
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const load = async () => {
    if (!activeBranchId) return
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ from, to, search, branch_id: String(activeBranchId || "") })
      const response = await fetch(`/api/internal-manufacturing-requests/archive?${params}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل التقرير")
      setRows(Array.isArray(data) ? data.map((row: any) => ({ ...row, events: (row.events || []).map((event: any, index: number, events: any[]) => ({ ...event, arrived_at: index > 0 ? events[index - 1].created_at : null })) })) : [])
    } catch (reason: any) { setError(reason.message || "تعذر تحميل التقرير") } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [activeBranchId])

  const totals = useMemo(() => ({
    requests: rows.length,
    completed: rows.filter((row) => Number(row.internal_status) === 8).length,
    events: rows.reduce((sum, row) => sum + (row.events?.length || 0), 0),
    quantities: rows.reduce((sum, row) => sum + (row.items || []).reduce((itemSum: number, item: any) => itemSum + Number(item.requested_quantity || 0), 0), 0),
  }), [rows])

  return <div dir="rtl" className="archive-report min-h-full space-y-5 bg-gradient-to-b from-slate-50/80 to-white p-3 md:p-6">
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 via-green-100 to-teal-50 p-6 text-emerald-950 shadow-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-4"><div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/20"><Archive className="h-7 w-7 text-emerald-300" /></div><div><h1 className="text-2xl font-bold">تقرير أرشفة الطلبات الداخلية</h1><p className="mt-1 text-sm text-slate-300">سجل إداري كامل لجميع المراحل والتغييرات والكميات والمستخدمين.</p></div></div><Button className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث التقرير</Button></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["إجمالي الطلبات", totals.requests, Archive, "text-violet-600 bg-violet-50"], ["الطلبات المكتملة", totals.completed, PackageCheck, "text-emerald-600 bg-emerald-50"], ["الحركات المسجلة", totals.events, Clock3, "text-sky-600 bg-sky-50"], ["إجمالي الكمية المطلوبة", totals.quantities, PackageCheck, "text-amber-600 bg-amber-50"]].map(([label, value, Icon, tone]: any) => <Card key={label} className="border-0 shadow-sm"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div><div className={`rounded-2xl p-3 ${tone}`}><Icon className="h-6 w-6" /></div></CardContent></Card>)}
    </div>

    <Card className="border-0 shadow-sm"><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end"><div><Label>بحث</Label><div className="relative mt-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pr-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="رقم الطلب أو اسم مقدم الطلب" /></div></div><div><Label>من تاريخ الطلب</Label><Input className="mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><Label>إلى تاريخ الطلب</Label><Input className="mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><Button onClick={() => void load()}>تطبيق الفلاتر</Button></CardContent></Card>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-slate-900 text-white"><tr><th className="w-12 p-4"></th><th className="p-4 text-right">رقم الطلب</th><th className="p-4 text-right">تاريخ الطلب</th><th className="p-4 text-right">مقدم الطلب</th><th className="p-4 text-right">المرحلة الحالية</th><th className="p-4 text-right">الأصناف</th><th className="p-4 text-right">الكمية</th><th className="p-4 text-right">آخر حركة</th></tr></thead><tbody>{rows.map((row) => { const isOpen = expanded === row.id; const lastEvent = row.events?.[row.events.length - 1]; const quantity = (row.items || []).reduce((sum: number, item: any) => sum + Number(item.requested_quantity || 0), 0); return <><tr key={row.id} className="border-t transition hover:bg-slate-50"><td className="p-3"><Button size="icon" variant="ghost" onClick={() => setExpanded(isOpen ? null : row.id)}>{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button></td><td className="p-4 font-mono font-bold text-emerald-700">{row.vch_code}</td><td className="p-4"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />{String(row.vch_date).slice(0, 10)}</span></td><td className="p-4">{row.requester_name || "-"}</td><td className="p-4"><Badge variant={Number(row.internal_status) === 8 ? "default" : "secondary"}>{row.status === 3 ? "محذوف" : statusLabels[Number(row.internal_status)] || row.internal_status}</Badge></td><td className="p-4">{row.items?.length || 0}</td><td className="p-4 font-semibold">{quantity}</td><td className="p-4">{lastEvent ? formatDateTime(lastEvent.created_at) : "-"}</td></tr>{isOpen && <tr key={`${row.id}-details`} className="bg-slate-50/80"><td colSpan={8} className="p-5"><ArchiveDetails row={row} /></td></tr>}</> })}</tbody></table></div>
      {!loading && !rows.length && <div className="py-16 text-center text-muted-foreground"><Archive className="mx-auto mb-3 h-12 w-12 opacity-40" /><p>لا توجد طلبات مطابقة للفلاتر</p></div>}
    </div>
    <Dialog open={expanded !== null} onOpenChange={(open) => !open && setExpanded(null)}><DialogContent dir="rtl" className="max-h-[94vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>عرض الطلب وكامل الأرشيف</DialogTitle></DialogHeader>{expanded !== null && (() => { const row = rows.find((item) => Number(item.id) === Number(expanded)); return row ? <div className="space-y-5"><div className="grid gap-3 rounded-2xl bg-black p-5 text-white sm:grid-cols-3"><div>رقم الطلب: <b>{row.vch_code}</b></div><div>التاريخ: <b>{String(row.vch_date).slice(0, 10)}</b></div><div>مقدم الطلب: <b>{row.requester_name || "-"}</b></div></div><ArchiveDetails row={row} /></div> : null })()}</DialogContent></Dialog>
    <style jsx global>{`.archive-report time,.archive-report b{font-variant-numeric:tabular-nums}.archive-report [class*="bg-zinc-100"] b{direction:ltr;unicode-bidi:isolate;display:inline-block}.archive-report>div:first-child .text-slate-300{color:#047857!important}.archive-report>div:first-child .bg-white\/10{background:#fff!important}.archive-report table thead{background:#d1fae5!important;color:#064e3b!important}.archive-report table thead th{border-color:#a7f3d0!important}[role="dialog"] .bg-black{background:#d1fae5!important;color:#064e3b!important;border:1px solid #a7f3d0}`}</style>
  </div>
}

function ArchiveDetails({ row }: { row: any }) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]"><div><h3 className="mb-3 font-bold">سجل المراحل والتغييرات</h3><div className="relative space-y-3 before:absolute before:bottom-4 before:right-[17px] before:top-4 before:w-px before:bg-slate-300">{(row.events || []).map((event: any) => <div key={event.id} className="relative flex gap-3"><div className="z-10 mt-1 h-9 w-9 shrink-0 rounded-full border-4 border-slate-50 bg-emerald-500" /><div className="flex-1 rounded-xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{actionLabels[event.action] || event.action}</b><span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span></div><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{event.user_name || "-"}</span><span>{statusLabels[Number(event.from_status)] || "البداية"} ← {statusLabels[Number(event.to_status)] || "-"}</span></div><QuantityChanges event={event} /></div></div>)}</div></div><div><h3 className="mb-3 font-bold">الأصناف والكميات الحالية</h3><div className="space-y-2">{(row.items || []).map((item: any) => <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-white p-3"><div className="h-12 w-12 overflow-hidden rounded-lg border bg-slate-50">{item.product_image && <img src={item.product_image} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.item_name}</p><p className="text-xs text-muted-foreground">{item.unit_name || "بدون وحدة"}</p></div><div className="grid grid-cols-3 gap-3 text-center text-xs"><div><b className="block text-base">{item.requested_quantity}</b>مطلوب</div><div><b className="block text-base text-sky-700">{item.prepared_quantity}</b>مجهز</div><div><b className="block text-base text-emerald-700">{item.received_quantity}</b>مستلم</div></div></div>)}</div></div></div>
}

function QuantityChanges({ event }: { event: any }) {
  const before = Array.isArray(event.before_snapshot) ? event.before_snapshot : []
  const after = Array.isArray(event.after_snapshot) ? event.after_snapshot : []
  const changes = after.map((item: any) => { const old = before.find((entry: any) => Number(entry.id) === Number(item.id) || Number(entry.item_id) === Number(item.item_id)); return { ...item, old } }).filter((item: any) => !item.old || Number(item.old.requested_quantity) !== Number(item.requested_quantity) || Number(item.old.prepared_quantity) !== Number(item.prepared_quantity) || Number(item.old.received_quantity) !== Number(item.received_quantity))
  const isCreation = event.action === "create"
  const arrivalValue = isCreation ? "0" : formatDateTime(event.arrived_at)
  const executionValue = isCreation ? "0" : formatDateTime(event.created_at)
  const durationValue = isCreation ? "0" : formatDuration(event.arrived_at, event.created_at)
  return <div className="mt-3 space-y-2 border-t pt-3 text-xs"><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-zinc-100 p-2"><span className="block text-zinc-500">وقت الوصول</span><b>{arrivalValue}</b></div><div className="rounded-lg bg-zinc-100 p-2"><span className="block text-zinc-500">وقت التنفيذ</span><b>{executionValue}</b></div><div className="rounded-lg bg-zinc-100 p-2"><span className="block text-zinc-500">المدة</span><b>{durationValue}</b></div></div>{changes.map((item: any, index: number) => <div key={`${item.item_id}-${index}`} className="rounded bg-slate-50 px-2 py-1"><b>{item.item_name || `صنف ${item.item_id}`}</b>: مطلوب {item.old?.requested_quantity ?? 0} ← {item.requested_quantity}، مجهز {item.old?.prepared_quantity ?? 0} ← {item.prepared_quantity}، مستلم {item.old?.received_quantity ?? 0} ← {item.received_quantity}</div>)}</div>
}
