"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Ban, Bell, BellOff, CheckCircle2, ChefHat, Clock, Eye, Loader2, Maximize2, Minimize2, PencilLine, RefreshCw, RotateCcw, ShoppingBag, UtensilsCrossed, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { VoucherListHero, VoucherStats } from "@/components/common/voucher-list-shell"
import PrimeDropdown from "@/components/common/FocusDropdown"

// شاشة المطبخ (lib/restaurant-kitchen.ts): بطاقة لكل طلب أُرسل للمطبخ. المعدّل بعد أن رآه المطبخ بلون آخر مع إبراز
// الفرق، والملغى من الصالة بالأحمر. «تم» ينهي الطلب، «إلغاء» يرفضه بسبب يظهر للصالة.

type Change = "same" | "added" | "increased" | "decreased" | "modified" | "removed"
type Line = { id: number; name: string; unit: string; quantity: number; previous_quantity?: number; addons: { group: string; value: string }[]; note: string; change: Change }
type Card = {
  order_id: number; order_no: string; order_status: string; order_type: string; takeaway_name: string | null
  location_id: number; location_name: string; tables: string; waiter_name: string | null; guests: number; note: string | null
  kitchen_status: "new" | "changed" | "done" | "rejected" | "cancelled" | "dismissed"
  kitchen_sent_at: string | null; kitchen_changed_at: string | null; kitchen_done_at: string | null
  kitchen_reason: string | null; cancel_reason: string | null; lines: Line[]
}

const POLL_MS = 5000
const QUICK_REASONS = ["نفد الصنف", "خطأ في الطلب", "طلب الزبون", "عطل في المطبخ"]
const store = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* وضع خاص */ } },
}
const qtyText = (value: number) => String(Math.round(value * 1000) / 1000)
const minutesSince = (value: string | null, now: number) => value ? Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000)) : 0
const clock = (value: string | null) => value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""
const cardKey = (card: Card) => `${card.order_id}:${card.kitchen_status}:${card.kitchen_changed_at || ""}`

function beep() {
  try {
    const Context = window.AudioContext || (window as any).webkitAudioContext
    const context = new Context()
    const tone = (at: number, frequency: number) => {
      const oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.25, context.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + at + 0.25)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + at)
      oscillator.stop(context.currentTime + at + 0.26)
    }
    tone(0, 880); tone(0.3, 1175)
    window.setTimeout(() => void context.close(), 1000)
  } catch { /* بلا صوت */ }
}

export default function KitchenDisplay() {
  const [view, setView] = useState<"active" | "done">("active")
  const [locationId, setLocationId] = useState<number>(() => Number(store.get("kitchen-display-location")) || 0)
  const [sound, setSound] = useState(() => store.get("kitchen-display-sound") !== "0")
  const [cards, setCards] = useState<Card[]>([])
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rejecting, setRejecting] = useState<Card | null>(null)
  const [reason, setReason] = useState("")
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const seenRef = useRef<Set<string> | null>(null)
  const soundRef = useRef(sound)
  soundRef.current = sound

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch(`/api/restaurant/kitchen-display?view=${view}${locationId ? `&location_id=${locationId}` : ""}`, { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || tr("تعذر تحميل شاشة المطبخ"))
      const next: Card[] = body.cards || []
      setCards(next)
      setLocations(body.locations || [])
      setError("")
      if (view === "active") {
        // طلب جديد/تعديل/إلغاء لم تره الشاشة ⇐ تنبيه صوتي (لا عند أول تحميل)
        const keys = new Set(next.map(cardKey))
        if (seenRef.current && soundRef.current && next.some((card) => !seenRef.current!.has(cardKey(card)))) beep()
        seenRef.current = keys
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تحميل شاشة المطبخ"))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [view, locationId])

  useEffect(() => { seenRef.current = null; void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true) }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const act = async (card: Card, action: "done" | "reject" | "dismiss" | "recall", extra: Record<string, unknown> = {}) => {
    setBusyId(card.order_id)
    try {
      const response = await fetch("/api/restaurant/kitchen-display", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, order_id: card.order_id, ...(action === "done" || action === "reject" ? { seen: card.kitchen_changed_at } : {}), ...extra }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || tr("تعذر تنفيذ العملية"))
      setCards((list) => list.filter((row) => row.order_id !== card.order_id))
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("تعذر تنفيذ العملية"))
      return false
    } finally {
      setBusyId(null)
      void load(true)
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  const counts = useMemo(() => ({
    new: cards.filter((card) => card.kitchen_status === "new").length,
    changed: cards.filter((card) => card.kitchen_status === "changed").length,
    cancelled: cards.filter((card) => card.kitchen_status === "cancelled").length,
    late: cards.filter((card) => (card.kitchen_status === "new" || card.kitchen_status === "changed") && minutesSince(card.kitchen_sent_at, now) >= 20).length,
  }), [cards, now])

  const locationOptions = [{ label: tr("كل المواقع"), value: 0 }, ...locations.map((row) => ({ label: row.name, value: row.id }))]

  return (
    <div ref={rootRef} dir={appDir()} className={`space-y-4 ${fullscreen ? "h-screen overflow-y-auto bg-slate-100 p-4 dark:bg-slate-950" : ""}`}>
      {!fullscreen && <VoucherListHero title={tr("شاشة المطبخ")} subtitle={tr("الطلبات المرسلة للمطبخ — المعدّلة بلون مختلف، «تم» عند التجهيز أو «إلغاء» بسبب")} category={tr("نظام ادارة المطاعم")} icon={ChefHat} />}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 dark:bg-slate-950">
        <div className="inline-flex rounded-xl border bg-slate-50 p-1 dark:bg-slate-900">
          {([["active", tr("قيد التحضير"), ChefHat], ["done", tr("المنجزة"), CheckCircle2]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" onClick={() => setView(value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${view === value ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="fa-field w-52">
          <PrimeDropdown value={locationId} options={locationOptions} optionLabel="label" optionValue="value" className="invoice-currency-dropdown w-full" panelClassName="invoice-currency-dropdown-panel"
            appendTo={() => document.body} onChange={(e: any) => { const value = Number(e.value) || 0; setLocationId(value); store.set("kitchen-display-location", String(value)) }} />
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="outline" size="icon" title={sound ? tr("إيقاف التنبيه الصوتي") : tr("تشغيل التنبيه الصوتي")}
            onClick={() => { const next = !sound; setSound(next); store.set("kitchen-display-sound", next ? "1" : "0"); if (next) beep() }}>
            {sound ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-slate-400" />}
          </Button>
          <Button variant="outline" size="icon" title={tr("تحديث")} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          <Button variant="outline" size="icon" title={fullscreen ? tr("الخروج من ملء الشاشة") : tr("ملء الشاشة")} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {view === "active" && <VoucherStats stats={[
        { label: tr("طلبات جديدة"), value: counts.new },
        { label: tr("طلبات معدّلة"), value: counts.changed },
        { label: tr("ألغتها الصالة"), value: counts.cancelled },
        { label: tr("متأخرة (+20 دقيقة)"), value: counts.late },
      ]} />}

      {error && <p className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}

      <div className="relative min-h-40">
        {loading && !cards.length && (
          <div className="flex h-40 items-center justify-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" />{tr("جاري تحميل البيانات...")}</div>
        )}
        {!loading && !cards.length && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-slate-400">
            <ChefHat className="h-10 w-10" />
            <span className="text-sm font-semibold">{view === "active" ? tr("لا توجد طلبات قيد التحضير") : tr("لا توجد طلبات منجزة خلال آخر 12 ساعة")}</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.map((card) => (
            <OrderCard key={card.order_id} card={card} now={now} busy={busyId === card.order_id}
              onDone={() => void act(card, "done")} onReject={() => { setReason(""); setRejecting(card) }}
              onDismiss={() => void act(card, "dismiss")} onRecall={() => void act(card, "recall")} />
          ))}
        </div>
      </div>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) setRejecting(null) }}>
        <DialogContent className="max-w-md" dir={appDir()}>
          <DialogHeader><DialogTitle>{tr("إلغاء الطلب من المطبخ")} {rejecting ? `— ${rejecting.order_no}` : ""}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{tr("يظهر الإلغاء وسببه في شاشة المطعم ليقرر الكاشير حذف الأصناف أو إلغاء الطلب.")}</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((value) => (
              <button key={value} type="button" onClick={() => setReason(tr(value))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${reason === tr(value) ? "border-red-500 bg-red-50 text-red-700" : "text-slate-600 hover:bg-slate-50"}`}>{tr(value)}</button>
            ))}
          </div>
          <textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder={tr("سبب الإلغاء")}
            className="min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:bg-slate-900" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>{tr("رجوع")}</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!reason.trim() || busyId === rejecting?.order_id}
              onClick={async () => { if (rejecting && await act(rejecting, "reject", { reason: reason.trim() })) setRejecting(null) }}>
              <XCircle className="me-1 h-4 w-4" />{tr("إلغاء الطلب")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const TONES = {
  new: { card: "border-slate-200 bg-white dark:bg-slate-900", head: "bg-emerald-600" },
  changed: { card: "border-amber-400 bg-amber-50 ring-2 ring-amber-300/60 dark:bg-amber-950/40", head: "bg-amber-500" },
  cancelled: { card: "border-red-400 bg-red-50 ring-2 ring-red-300/60 dark:bg-red-950/40", head: "bg-red-600" },
  done: { card: "border-slate-200 bg-slate-50 dark:bg-slate-900", head: "bg-slate-500" },
  rejected: { card: "border-red-200 bg-white dark:bg-slate-900", head: "bg-red-500" },
  dismissed: { card: "border-slate-200 bg-slate-50 dark:bg-slate-900", head: "bg-slate-400" },
} as const

const CHANGE_STYLE: Record<Change, { row: string; badge?: string; label?: string }> = {
  same: { row: "" },
  added: { row: "bg-emerald-100/80 dark:bg-emerald-900/40", badge: "bg-emerald-600 text-white", label: "جديد" },
  increased: { row: "bg-amber-100/80 dark:bg-amber-900/40", badge: "bg-amber-600 text-white", label: "زيادة" },
  decreased: { row: "bg-orange-100/80 dark:bg-orange-900/40", badge: "bg-orange-600 text-white", label: "تخفيض" },
  modified: { row: "bg-sky-100/80 dark:bg-sky-900/40", badge: "bg-sky-600 text-white", label: "تعديل" },
  removed: { row: "bg-red-100/70 dark:bg-red-900/40", badge: "bg-red-600 text-white", label: "محذوف" },
}

function OrderCard({ card, now, busy, onDone, onReject, onDismiss, onRecall }: { card: Card; now: number; busy: boolean; onDone: () => void; onReject: () => void; onDismiss: () => void; onRecall: () => void }) {
  const tone = TONES[card.kitchen_status] || TONES.new
  const pending = card.kitchen_status === "new" || card.kitchen_status === "changed"
  const waited = minutesSince(card.kitchen_sent_at, now)
  const timerTone = !pending ? "bg-white/20" : waited >= 20 ? "bg-red-700 animate-pulse" : waited >= 10 ? "bg-amber-700" : "bg-white/20"
  const where = card.order_type === "takeaway" ? `${tr("سفري")}${card.takeaway_name ? ` — ${card.takeaway_name}` : ""}` : `${tr("طاولة")} ${card.tables || "-"}`
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border shadow-sm ${tone.card}`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 text-white ${tone.head}`}>
        <div className="flex min-w-0 items-center gap-2">
          {card.order_type === "takeaway" ? <ShoppingBag className="h-5 w-5 shrink-0" /> : <UtensilsCrossed className="h-5 w-5 shrink-0" />}
          <div className="min-w-0">
            <div className="truncate text-lg font-black leading-tight">{where}</div>
            <div className="truncate text-xs text-white/85">{card.order_no} · {card.location_name}{card.waiter_name ? ` · ${card.waiter_name}` : ""}</div>
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold ${timerTone}`} title={tr("وقت الإرسال {0}", clock(card.kitchen_sent_at))}>
          <Clock className="h-4 w-4" />{pending ? tr("{0} د", waited) : clock(card.kitchen_done_at)}
        </span>
      </div>

      {card.kitchen_status === "changed" && (
        <div className="flex items-center gap-1.5 bg-amber-200/70 px-4 py-1.5 text-xs font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
          <PencilLine className="h-3.5 w-3.5" />{tr("تم تعديل الطلب")} {card.kitchen_changed_at ? `— ${clock(card.kitchen_changed_at)}` : ""}
        </div>
      )}
      {card.kitchen_status === "cancelled" && (
        <div className="flex items-center gap-1.5 bg-red-200/70 px-4 py-1.5 text-xs font-bold text-red-900 dark:bg-red-900/60 dark:text-red-100">
          <Ban className="h-3.5 w-3.5" />{tr("ألغته الصالة — أوقف التحضير")}{card.cancel_reason ? `: ${card.cancel_reason}` : ""}
        </div>
      )}
      {card.kitchen_status === "rejected" && (
        <div className="flex items-center gap-1.5 bg-red-100 px-4 py-1.5 text-xs font-bold text-red-800 dark:bg-red-900/50 dark:text-red-100">
          <XCircle className="h-3.5 w-3.5" />{tr("ألغاه المطبخ")}{card.kitchen_reason ? `: ${card.kitchen_reason}` : ""}
        </div>
      )}

      <ul className="flex-1 divide-y divide-black/5 dark:divide-white/10">
        {card.lines.map((line) => {
          const style = CHANGE_STYLE[line.change]
          const removed = line.change === "removed"
          return (
            <li key={`${line.id}-${line.change}`} className={`px-4 py-2 ${style.row}`}>
              <div className="flex items-start gap-2">
                <span className={`min-w-9 rounded-md bg-slate-900/90 px-1.5 py-0.5 text-center text-base font-black text-white dark:bg-white dark:text-slate-900 ${removed ? "opacity-50" : ""}`}>{qtyText(line.quantity)}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-base font-bold leading-snug ${removed ? "text-red-700 line-through dark:text-red-300" : "text-slate-900 dark:text-slate-100"}`}>
                    {line.name}{line.unit ? <span className="ms-1 text-xs font-medium text-slate-500">({line.unit})</span> : null}
                  </div>
                  {line.addons.length > 0 && <div className="mt-0.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">{line.addons.map((addon) => addon.value).join(" · ")}</div>}
                  {line.note && <div className="mt-0.5 text-sm italic text-rose-700 dark:text-rose-300">✎ {line.note}</div>}
                </div>
                {style.label && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>
                    {tr(style.label)}{line.previous_quantity !== undefined ? ` ${qtyText(line.previous_quantity)}→${qtyText(line.quantity)}` : ""}
                  </span>
                )}
              </div>
            </li>
          )
        })}
        {!card.lines.length && <li className="px-4 py-3 text-sm text-slate-500">{tr("لا توجد أصناف")}</li>}
      </ul>

      {card.note && <div className="border-t bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-100">{tr("ملاحظة")}: {card.note}</div>}

      <div className="flex gap-2 border-t bg-white/60 p-3 dark:bg-black/20">
        {pending && <>
          <Button className="h-11 flex-1 bg-emerald-600 text-base font-extrabold hover:bg-emerald-700" disabled={busy} onClick={onDone}>
            {busy ? <Loader2 className="me-1 h-5 w-5 animate-spin" /> : <CheckCircle2 className="me-1 h-5 w-5" />}{tr("تم")}
          </Button>
          <Button variant="outline" className="h-11 border-red-300 font-bold text-red-700 hover:bg-red-50" disabled={busy} onClick={onReject}>
            <XCircle className="me-1 h-5 w-5" />{tr("إلغاء")}
          </Button>
        </>}
        {card.kitchen_status === "cancelled" && (
          <Button className="h-11 flex-1 bg-red-600 font-bold hover:bg-red-700" disabled={busy} onClick={onDismiss}>
            {busy ? <Loader2 className="me-1 h-5 w-5 animate-spin" /> : <Eye className="me-1 h-5 w-5" />}{tr("تم الاطلاع")}
          </Button>
        )}
        {(card.kitchen_status === "done" || card.kitchen_status === "rejected") && card.order_status !== "cancelled" && card.order_status !== "merged" && (
          <Button variant="outline" className="h-10 flex-1 font-bold" disabled={busy} onClick={onRecall}>
            <RotateCcw className="me-1 h-4 w-4" />{tr("إرجاع للتحضير")}
          </Button>
        )}
        {card.kitchen_status === "dismissed" && <span className="py-2 text-xs font-semibold text-slate-500">{tr("طلب ملغى — تم الاطلاع")}</span>}
      </div>
    </div>
  )
}
