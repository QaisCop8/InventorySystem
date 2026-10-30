"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, EyeOff, Lock, RefreshCw, RotateCcw, Search, Send, Users, Warehouse, XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ConfirmDialogYesNo from "@/components/ui/ConfirmDialogYesNo"
import { useToast } from "@/hooks/use-toast"
import {
  PostDialog, SESSION_STATUS, STATUS, api, dateOnly, lotLabel, money, openVoucher, partsLabel, qty,
  type CountDetail, type CountSummary,
} from "@/components/inventory/stock-counts"

// اعتماد الجرد — مراجعة وثيقة جرد بكل جلساتها وترحيل الفروقات:
//   • كمية كل سطر (صنف/دفعة/مقاس) = مجموع ما عدّته كل الجلسات (مستخدم1 + مستخدم2 لنفس الصنف).
//   • الاعتماد ممنوع ما دامت جلسة مفتوحة ⇐ "يجب انهاء الجرد للجلسة رقم - N".
//   • من له صلاحية ترحيل الجرد يستطيع إنهاء/إعادة فتح/إلغاء جلسة مستخدم آخر من هنا.

export default function StockCountApproval() {
  const [openId, setOpenId] = useState<number | null>(null)
  return openId ? <ApprovalDetail countId={openId} onBack={() => setOpenId(null)} /> : <ApprovalList onOpen={setOpenId} />
}

function ApprovalList({ onOpen }: { onOpen: (id: number) => void }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<CountSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<"pending" | "posted">("pending")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api<CountSummary[]>("/api/stock-counts?status=0"))
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const visible = rows.filter((row) => (tab === "pending" ? row.status === 1 || row.status === 2 : row.status === 3))
  const ready = rows.filter((row) => (row.status === 1 || row.status === 2) && row.open_sessions === 0 && row.sessions > 0).length
  const blocked = rows.filter((row) => (row.status === 1 || row.status === 2) && row.open_sessions > 0).length

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-2xl bg-gradient-to-l from-indigo-700 via-indigo-600 to-violet-600 px-5 py-5 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"><CheckCircle2 className="h-6 w-6" /></span>
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">اعتماد الجرد</h1>
              <p className="text-xs text-indigo-50/90 sm:text-sm">مراجعة جلسات الجرد وتجميع كمياتها ثم ترحيل الفروقات — بعد إنهاء كل الجلسات</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="h-10 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
            <RefreshCw className={`ml-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["جاهزة للاعتماد", ready, CheckCircle2, "text-emerald-600"],
          ["بجلسات مفتوحة", blocked, AlertTriangle, "text-amber-600"],
          ["معتمدة", rows.filter((row) => row.status === 3).length, Lock, "text-indigo-600"],
        ].map(([label, value, Icon, color]: any) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border bg-white p-5 shadow-sm">
            <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>
            <Icon className={`h-7 w-7 ${color}`} />
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {([["pending", "بانتظار الاعتماد"], ["posted", "معتمدة"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === value ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-indigo-50 text-indigo-950">
              <tr>
                {["رقم الجرد", "الفرع", "المستودع", "تاريخ القطع", "الحالة", "الجلسات", "المجرود", "أسطر بفروقات", tab === "posted" ? "سندات التسوية" : "الاعتماد", ""].map((header) => (
                  <th key={header} className="p-3 text-right">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t hover:bg-indigo-50/40" onDoubleClick={() => onOpen(row.id)}>
                  <td className="p-3 font-mono font-bold text-indigo-700">{row.count_no}{row.blind && <EyeOff className="mr-1 inline h-3.5 w-3.5 text-slate-400" aria-label="جرد أعمى" />}</td>
                  <td className="p-3">{row.branch_name || "—"}</td>
                  <td className="p-3 font-semibold">{row.warehouse_name}</td>
                  <td className="p-3 font-mono" dir="ltr">{dateOnly(row.count_date)}</td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[row.status]?.className}`}>{STATUS[row.status]?.label}</span></td>
                  <td className="p-3">{row.sessions}</td>
                  <td className="p-3 text-xs text-slate-600">{row.counted}/{row.lines}</td>
                  <td className="p-3">{row.with_difference > 0 ? <span className="font-bold text-amber-700">{row.with_difference}</span> : "0"}</td>
                  <td className="p-3 text-xs">
                    {tab === "posted" ? (
                      <div className="flex flex-wrap gap-1">
                        {row.out_voucher_id && <button type="button" className="rounded bg-rose-50 px-2 py-0.5 font-mono text-rose-700 hover:underline" onClick={(event) => { event.stopPropagation(); openVoucher(row.out_voucher_id, 9) }}>{row.out_voucher_code}</button>}
                        {row.in_voucher_id && <button type="button" className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700 hover:underline" onClick={(event) => { event.stopPropagation(); openVoucher(row.in_voucher_id, 8) }}>{row.in_voucher_code}</button>}
                        {!row.out_voucher_id && !row.in_voucher_id && <span className="text-slate-400">—</span>}
                      </div>
                    ) : row.open_sessions > 0 ? (
                      <span className="font-bold text-amber-700">يجب انهاء الجرد للجلسة رقم - {row.open_session_nos}</span>
                    ) : row.sessions > 0 ? (
                      <span className="font-bold text-emerald-700">جاهز للاعتماد</span>
                    ) : <span className="text-slate-400">لا توجد جلسات</span>}
                  </td>
                  <td className="p-3 text-left"><Button size="sm" variant="outline" className="rounded-lg" onClick={() => onOpen(row.id)}>فتح</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visible.length && <div className="py-14 text-center text-muted-foreground">{tab === "pending" ? "لا توجد وثائق جرد بانتظار الاعتماد" : "لا توجد وثائق معتمدة"}</div>}
        </div>
      </div>
    </div>
  )
}

function ApprovalDetail({ countId, onBack }: { countId: number; onBack: () => void }) {
  const { toast } = useToast()
  const [count, setCount] = useState<CountDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [posting, setPosting] = useState(false)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "difference" | "uncounted">("difference")
  const [confirm, setConfirm] = useState<null | { message: string; run: () => void }>(null)

  const load = useCallback(async () => {
    try {
      setCount(await api<CountDetail>(`/api/stock-counts/${countId}?view=approval`))
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
    }
  }, [countId, toast])
  useEffect(() => { void load() }, [load])

  const run = async (action: string, extra: Record<string, any> = {}, success?: string) => {
    setBusy(true)
    try {
      const result = await api(`/api/stock-counts/${countId}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) })
      if (success || result?.message) toast({ title: "تم", description: result?.message || success })
      await load()
      return result
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" })
      await load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const openSessions = (count?.sessions || []).filter((session) => session.status === 1)
  const activeSessions = (count?.sessions || []).filter((session) => session.status !== 3)
  const editable = count?.status === 1 || count?.status === 2
  const blockMessage = openSessions.map((session) => `يجب انهاء الجرد للجلسة رقم - ${session.session_no}${session.user_name ? ` (${session.user_name})` : ""}`).join("، ")

  const diffOf = (line: CountDetail["lines"][number]) => (line.counted_qty == null ? null : Number(line.counted_qty) - Number(line.system_qty || 0))
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (count?.lines || []).filter((line) => {
      if (term && !`${line.product_code} ${line.product_name} ${line.barcode} ${lotLabel(line)}`.toLowerCase().includes(term)) return false
      const diff = diffOf(line)
      if (filter === "uncounted") return line.counted_qty == null
      if (filter === "difference") return diff != null && Math.abs(diff) > 0.000001
      return true
    })
  }, [count, search, filter])

  const summary = useMemo(() => {
    const lines = count?.lines || []
    let counted = 0, surplusValue = 0, shortageValue = 0, surplusLines = 0, shortageLines = 0
    for (const line of lines) {
      const diff = diffOf(line)
      if (diff == null) continue
      counted++
      if (diff > 0.000001) { surplusLines++; surplusValue += diff * Number(line.unit_cost || 0) }
      if (diff < -0.000001) { shortageLines++; shortageValue += -diff * Number(line.unit_cost || 0) }
    }
    return { total: lines.length, counted, surplusValue, shortageValue, surplusLines, shortageLines }
  }, [count])

  if (!count) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground" dir="rtl">جاري تحميل الجرد...</div>

  const startApprove = () => {
    if (openSessions.length) { toast({ title: "لا يمكن الاعتماد", description: blockMessage, variant: "destructive" }); return }
    if (!activeSessions.length) { toast({ title: "لا يمكن الاعتماد", description: "لا توجد جلسات جرد لهذه الوثيقة", variant: "destructive" }); return }
    setPosting(true)
  }

  const RENDER_LIMIT = 500
  return (
    <div className="space-y-4" dir="rtl">
      <div className="rounded-2xl bg-gradient-to-l from-indigo-700 via-indigo-600 to-violet-600 px-5 py-4 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 hover:bg-white/25" aria-label="رجوع">
              <ArrowRight className="h-5 w-5" />
            </button>
            <div>
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                اعتماد جرد رقم <span className="font-mono">{count.count_no}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs ring-1 ring-white/25">{STATUS[count.status]?.label}</span>
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-indigo-50/90">
                {count.branch_name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{count.branch_name}</span>}
                <span className="inline-flex items-center gap-1"><Warehouse className="h-3 w-3" />{count.warehouse_name}</span>
                <span>تاريخ القطع {dateOnly(count.count_date)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <>
                <HeaderButton icon={RefreshCw} label="تحديث الدفترية" disabled={busy} onClick={() => void run("refresh", {}, "أُعيد احتساب الكميات الدفترية بتاريخ القطع")} />
                {count.status === 2 && <HeaderButton icon={RotateCcw} label="إعادة فتح الجرد" disabled={busy} onClick={() => void run("reopen", {}, "أُعيد فتح الجرد للعدّ")} />}
                <HeaderButton icon={Send} label="اعتماد وترحيل الفروقات" primary disabled={busy} onClick={startApprove} />
              </>
            )}
            {count.status === 3 && (
              <>
                {count.out_voucher_id && <HeaderButton icon={Lock} label={`سند اخراج ${count.out_voucher_code}`} onClick={() => openVoucher(count.out_voucher_id, 9)} />}
                {count.in_voucher_id && <HeaderButton icon={Lock} label={`سند ادخال ${count.in_voucher_code}`} onClick={() => openVoucher(count.in_voucher_id, 8)} />}
              </>
            )}
          </div>
        </div>
      </div>

      {editable && openSessions.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>{openSessions.map((session) => (
            <div key={session.id}>يجب انهاء الجرد للجلسة رقم - {session.session_no}{session.user_name ? ` (${session.user_name})` : ""}</div>
          ))}</div>
        </div>
      )}

      {/* الجلسات */}
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700"><Users className="h-4 w-4 text-indigo-600" />جلسات الجرد</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-slate-500">
              <tr>{["رقم الجلسة", "المستخدم", "الحالة", "بدأت", "انتهت", "أسطر مجرودة", "إجمالي الكميات", ""].map((header) => <th key={header} className="p-2.5 text-right text-xs">{header}</th>)}</tr>
            </thead>
            <tbody>
              {count.sessions.map((session) => (
                <tr key={session.id} className={`border-t ${session.status === 3 ? "opacity-50" : ""}`}>
                  <td className="p-2.5 font-mono font-bold">{session.session_no}</td>
                  <td className="p-2.5">{session.user_name || "—"}</td>
                  <td className="p-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SESSION_STATUS[session.status]?.className}`}>{SESSION_STATUS[session.status]?.label}</span></td>
                  <td className="p-2.5 font-mono text-xs" dir="ltr">{session.started_at ? String(session.started_at).slice(0, 16).replace("T", " ") : "—"}</td>
                  <td className="p-2.5 font-mono text-xs" dir="ltr">{session.finished_at && session.status === 2 ? String(session.finished_at).slice(0, 16).replace("T", " ") : "—"}</td>
                  <td className="p-2.5">{session.lines_counted}</td>
                  <td className="p-2.5 tabular-nums">{qty(session.total_qty)}</td>
                  <td className="whitespace-nowrap p-2.5 text-left">
                    {count.status === 1 && session.status === 1 && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={busy}
                        onClick={() => setConfirm({ message: `إنهاء الجلسة رقم - ${session.session_no} (${session.user_name || "مستخدم"}) نيابة عنه؟`, run: () => void run("finish_session", { session_id: session.id }) })}>
                        <CheckCircle2 className="ml-1 h-3.5 w-3.5" />إنهاء
                      </Button>
                    )}
                    {count.status === 1 && session.status === 2 && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" disabled={busy} onClick={() => void run("reopen_session", { session_id: session.id })}>
                        <RotateCcw className="ml-1 h-3.5 w-3.5" />إعادة فتح
                      </Button>
                    )}
                    {count.status === 1 && session.status !== 3 && (
                      <Button size="sm" variant="outline" className="mr-1 h-7 rounded-lg text-xs text-rose-600" disabled={busy}
                        onClick={() => setConfirm({ message: `إلغاء الجلسة رقم - ${session.session_no} وحذف كل كمياتها من الجرد؟`, run: () => void run("cancel_session", { session_id: session.id }) })}>
                        <XCircle className="ml-1 h-3.5 w-3.5" />إلغاء
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!count.sessions.length && <div className="py-8 text-center text-sm text-muted-foreground">لم يُدخل أي مستخدم كميات بعد</div>}
        </div>
        {count.status === 2 && <p className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-500">الوثيقة منتهية — لتعديل الجلسات أعد فتح الجرد أولاً.</p>}
      </div>

      {/* الملخص */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="المجرود" value={`${summary.counted}/${summary.total}`} />
        <SummaryCard label={`زيادة (${summary.surplusLines})`} value={money(summary.surplusValue)} tone="text-emerald-700" />
        <SummaryCard label={`عجز (${summary.shortageLines})`} value={money(summary.shortageValue)} tone="text-rose-700" />
        <SummaryCard label="صافي الفرق" value={money(summary.surplusValue - summary.shortageValue)} tone={summary.surplusValue - summary.shortageValue < 0 ? "text-rose-700" : "text-emerald-700"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pr-9" placeholder="بحث برقم أو اسم أو باركود الصنف أو الدفعة" />
        </div>
        {([["difference", "بفروقات"], ["uncounted", "غير مجرود"], ["all", "الكل"]] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === value ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="sticky top-0 z-[1] bg-indigo-50 text-indigo-950">
              <tr>
                {["#", "رقم الصنف", "اسم الصنف / الدفعة", "الوحدة", "الدفترية", "تفصيل الجلسات", "إجمالي المجرود", "الفرق", "قيمة الفرق", "ملاحظات"].map((header) => (
                  <th key={header} className="p-3 text-right">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, RENDER_LIMIT).map((line, index) => {
                const diff = diffOf(line)
                const diffClass = diff == null || Math.abs(diff) < 0.000001 ? "text-slate-400" : diff > 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700"
                const label = lotLabel(line)
                const serialParts = line.has_serial
                  ? Object.entries(line.serials.filter((serial) => serial.counted).reduce<Record<string, number>>((acc, serial) => {
                      const key = serial.session_no == null ? "—" : String(serial.session_no)
                      acc[key] = (acc[key] || 0) + 1
                      return acc
                    }, {})).map(([session, n]) => `ج${session}: ${n}`).join(" + ")
                  : ""
                return (
                  <tr key={line.id} className="border-t align-top">
                    <td className="p-3 text-xs text-slate-400">{index + 1}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{line.product_code}</td>
                    <td className="p-3">
                      <div className="font-semibold">{line.product_name}</div>
                      {(label || line.has_serial) && <div className="mt-0.5 text-[11px] text-slate-500">{line.has_serial ? "سيريال" : label}</div>}
                    </td>
                    <td className="p-3 text-slate-600">{line.unit_name}</td>
                    <td className="p-3 tabular-nums">{qty(line.system_qty)}</td>
                    <td className="p-3 text-xs text-slate-600">{line.has_serial ? serialParts || "—" : line.parts.length ? partsLabel(line.parts) : "—"}</td>
                    <td className="p-3 font-bold tabular-nums">{qty(line.counted_qty)}</td>
                    <td className={`p-3 tabular-nums ${diffClass}`}>{diff == null ? "—" : `${diff > 0 ? "+" : ""}${qty(diff)}`}</td>
                    <td className={`p-3 tabular-nums ${diffClass}`}>{diff == null ? "—" : money(diff * Number(line.unit_cost || 0))}</td>
                    <td className="p-3 text-xs text-slate-500">{line.note || ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!visible.length && <div className="py-12 text-center text-muted-foreground">لا توجد أسطر مطابقة</div>}
          {visible.length > RENDER_LIMIT && <div className="border-t bg-amber-50 py-2 text-center text-xs text-amber-800">يُعرض أول {RENDER_LIMIT} من {visible.length} — استخدم البحث للوصول لصنف</div>}
        </div>
      </div>

      <PostDialog open={posting} onOpenChange={setPosting} summary={summary}
        onPost={async (options) => {
          const result = await run("approve", options)
          if (result?.ok) {
            setPosting(false)
            const parts = [result.out_voucher && `اخراج ${result.out_voucher.vch_code}`, result.in_voucher && `ادخال ${result.in_voucher.vch_code}`].filter(Boolean)
            toast({ title: "تم اعتماد الجرد", description: parts.length ? `سندات التسوية: ${parts.join("، ")}` : result.message })
          }
        }} />

      <ConfirmDialogYesNo useAppDialog visible={!!confirm} title="تأكيد" message={confirm?.message || ""}
        onConfirm={() => { const action = confirm?.run; setConfirm(null); action?.() }}
        onCancel={() => setConfirm(null)} />
    </div>
  )
}

function SummaryCard({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function HeaderButton({ icon: Icon, label, onClick, disabled, primary }: { icon: any; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled}
      className={primary ? "h-9 rounded-xl bg-white font-bold text-indigo-700 hover:bg-indigo-50" : "h-9 rounded-xl border border-white/30 bg-white/10 text-white hover:bg-white/20"}>
      <Icon className="ml-1.5 h-4 w-4" />{label}
    </Button>
  )
}

