"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlarmClock, BellRing, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, Plus, Repeat, RotateCcw, Trash2, UserRound, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import "./reminders.css"

// التذكيرات الشخصية (lib/reminders.ts): زر الهيدر بعدّاد، نافذة الإدارة، ونافذة منبثقة عند حلول الموعد
// (تُفحص كل دقيقة وعند العودة للتبويب) مع تم / تأجيل — والإشعار نفسه يصل للجرس من الخادم.

type Reminder = {
  id: number; title: string; note: string; remind_at: string; repeat: "none" | "daily" | "weekly" | "monthly"; status: string
  due_at: string; created_by: number; created_by_name: string; assigned_to: number; assigned_to_name: string; done_at: string | null
}
type Count = { total: number; due: number }
type Draft = { id?: number; title: string; note: string; at: string; repeat: Reminder["repeat"]; assigned_to: number }

const REPEAT_LABEL: Record<Reminder["repeat"], string> = { none: "مرة واحدة", daily: "يومياً", weekly: "أسبوعياً", monthly: "شهرياً" }
const pad = (n: number) => String(n).padStart(2, "0")
const toLocalInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
const inHours = (hours: number) => { const d = new Date(Date.now() + hours * 3600_000); d.setSeconds(0, 0); return d }
const tomorrowAt = (hour: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hour, 0, 0, 0); return d }
const nextWeekAt = (hour: number) => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(hour, 0, 0, 0); return d }
const QUICK = [
  { label: "بعد ساعة", at: () => inHours(1) },
  { label: "بعد 3 ساعات", at: () => inHours(3) },
  { label: "غداً 9 ص", at: () => tomorrowAt(9) },
  { label: "الأسبوع القادم", at: () => nextWeekAt(9) },
]
const SNOOZE = [{ label: "10 د", minutes: 10 }, { label: "ساعة", minutes: 60 }, { label: "غداً", minutes: 24 * 60 }]

function formatWhen(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const time = date.toLocaleTimeString("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" })
  if (sameDay) return `${tr("اليوم")} ${time}`
  if (date.toDateString() === tomorrow.toDateString()) return `${tr("غداً")} ${time}`
  return `${date.toLocaleDateString("ar-u-nu-latn", { weekday: "short", day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" })} ${time}`
}

function beep() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const context = new AudioContextClass()
    const tone = (frequency: number, start: number) => {
      const oscillator = context.createOscillator(); const gain = context.createGain()
      oscillator.type = "sine"; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, context.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + 0.35)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(context.currentTime + start); oscillator.stop(context.currentTime + start + 0.4)
    }
    tone(880, 0); tone(1175, 0.18)
    window.setTimeout(() => void context.close(), 1000)
  } catch { /* بلا صوت */ }
}

async function api(method: string, body?: unknown, query = "") {
  const response = await fetch(`/api/reminders${query}`, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || tr("تعذر تنفيذ العملية"))
  return data
}

export function RemindersButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<Count>({ total: 0, due: 0 })
  const [due, setDue] = useState<Reminder[]>([])
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const seen = useRef<Set<string>>(new Set())

  const poll = useCallback(async () => {
    try {
      const data = await api("GET", undefined, "?due=1")
      setCount(data.count || { total: 0, due: 0 })
      const list: Reminder[] = data.due || []
      setDue(list)
      // صوت لكل تذكير يحلّ لأول مرة بهذه الجلسة (المفتاح يشمل موعده: تأجيل ثم حلول جديد = صوت جديد)
      const fresh = list.filter((reminder) => !seen.current.has(`${reminder.id}:${reminder.due_at}`))
      fresh.forEach((reminder) => seen.current.add(`${reminder.id}:${reminder.due_at}`))
      if (fresh.length) { beep(); setDismissed(new Set()) }
    } catch { /* غير مسجل/بلا شبكة */ }
  }, [])

  useEffect(() => {
    void poll()
    const timer = window.setInterval(() => void poll(), 60_000)
    const onFocus = () => void poll()
    window.addEventListener("focus", onFocus)
    window.addEventListener("reminders:changed", onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("reminders:changed", onFocus) }
  }, [poll])

  const act = async (id: number, body: Record<string, unknown>) => {
    await api("PATCH", { id, ...body }).catch((error) => window.alert(error.message))
    window.dispatchEvent(new Event("reminders:changed"))
  }
  const visible = due.filter((reminder) => !dismissed.has(reminder.id)).slice(0, 3)

  return <>
    <button type="button" onClick={() => setOpen(true)} className={`relative ${className}`} aria-label={tr("التذكيرات")} title={tr("التذكيرات")}>
      <AlarmClock className={`h-[18px] w-[18px] ${count.due ? "reminders-ring" : ""}`} />
      {count.total > 0 && <span className={`reminders-badge ${count.due ? "is-due" : ""}`}>{count.due || count.total}</span>}
    </button>
    {open && <RemindersDialog open={open} onOpenChange={setOpen} />}

    {visible.length > 0 && <div className="reminders-popups" dir={appDir()} role="alert" aria-live="assertive">
      {visible.map((reminder) => <div key={reminder.id} className="reminder-popup">
        <div className="reminder-popup-head">
          <span className="reminder-popup-icon"><BellRing className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="reminder-popup-title">{reminder.title}</p>
            <p className="reminder-popup-meta">{formatWhen(reminder.due_at)}{reminder.created_by !== reminder.assigned_to && reminder.created_by_name ? ` · ${tr("من")} ${reminder.created_by_name}` : ""}</p>
          </div>
          <button type="button" className="reminder-popup-close" onClick={() => setDismissed((current) => new Set(current).add(reminder.id))} aria-label={tr("إخفاء")}><X className="h-3.5 w-3.5" /></button>
        </div>
        {reminder.note && <p className="reminder-popup-note">{reminder.note}</p>}
        <div className="reminder-popup-actions">
          <button type="button" className="is-done" onClick={() => void act(reminder.id, { action: "done" })}><Check className="h-3.5 w-3.5" />{tr("تم")}</button>
          <span className="reminder-popup-snooze"><Clock className="h-3.5 w-3.5" />{SNOOZE.map((option) => <button key={option.minutes} type="button" onClick={() => void act(reminder.id, { action: "snooze", minutes: option.minutes })}>{tr(option.label)}</button>)}</span>
        </div>
      </div>)}
      {due.filter((reminder) => !dismissed.has(reminder.id)).length > visible.length && <button type="button" className="reminder-popup-more" onClick={() => setOpen(true)}>{tr("تذكيرات أخرى حالّة")} +{due.filter((reminder) => !dismissed.has(reminder.id)).length - visible.length}</button>}
    </div>}
  </>
}

type View = "pending" | "calendar" | "done" | "sent"
const VIEW_LABEL: Record<View, string> = { pending: "القادمة", calendar: "التقويم", done: "المنجزة", sent: "أرسلتها لغيري" }
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const WEEK_DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"]

function RemindersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<View>("pending")
  const [rows, setRows] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ id: number; name: string }[]>([])
  const [me, setMe] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (view === "calendar") return
    setLoading(true)
    try { setRows((await api("GET", undefined, `?view=${view}`)).reminders || []) } catch (reason) { setError(reason instanceof Error ? reason.message : "") } finally { setLoading(false) }
  }, [view])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    api("GET", undefined, "?users=1").then((data) => { setUsers(data.users || []); setMe(Number(data.me) || 0) }).catch(() => undefined)
    const refresh = () => void load()
    window.addEventListener("reminders:changed", refresh)
    return () => window.removeEventListener("reminders:changed", refresh)
  }, [load])

  const newDraft = (at?: Date) => setDraft({ title: "", note: "", at: toLocalInput(at || inHours(1)), repeat: "none", assigned_to: me })
  const editDraft = (row: Reminder) => setDraft({ id: row.id, title: row.title, note: row.note, at: toLocalInput(new Date(row.remind_at)), repeat: row.repeat, assigned_to: row.assigned_to })
  const save = async () => {
    if (!draft) return
    setSaving(true); setError("")
    try {
      const body = { title: draft.title, note: draft.note, remind_at: new Date(draft.at).toISOString(), repeat: draft.repeat, assigned_to: draft.assigned_to || me }
      if (draft.id) await api("PATCH", { id: draft.id, action: "edit", ...body })
      else await api("POST", body)
      setDraft(null)
      window.dispatchEvent(new Event("reminders:changed"))
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("تعذر الحفظ")) } finally { setSaving(false) }
  }
  const act = async (id: number, body: Record<string, unknown>) => {
    try { await api("PATCH", { id, ...body }); window.dispatchEvent(new Event("reminders:changed")) } catch (reason) { setError(reason instanceof Error ? reason.message : "") }
  }
  const remove = async (id: number) => {
    if (!window.confirm(tr("حذف هذا التذكير؟"))) return
    try { await api("DELETE", undefined, `?id=${id}`); window.dispatchEvent(new Event("reminders:changed")) } catch (reason) { setError(reason instanceof Error ? reason.message : "") }
  }

  const now = Date.now()
  const groups = useMemo(() => {
    if (view !== "pending") return [{ key: "all", title: "", items: rows }]
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
    const overdue = rows.filter((row) => new Date(row.due_at).getTime() <= now)
    const today = rows.filter((row) => { const t = new Date(row.due_at).getTime(); return t > now && t <= endOfToday.getTime() })
    const later = rows.filter((row) => new Date(row.due_at).getTime() > endOfToday.getTime())
    return [{ key: "overdue", title: "حان موعدها", items: overdue }, { key: "today", title: "اليوم", items: today }, { key: "later", title: "قادمة", items: later }].filter((group) => group.items.length)
  }, [rows, view, now])
  const rowProps = { me, onAct: act, onEdit: editDraft, onRemove: remove }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    {/* لا تُغلق بالنقر خارجها (فقدان ما يُكتب) — فقط ✕ أو Esc */}
    <DialogContent dir={appDir()} className={`reminders-dialog gap-0 overflow-hidden p-0 ${view === "calendar" ? "max-w-4xl" : "max-w-2xl"}`}
      onInteractOutside={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
      <DialogHeader className="reminders-dialog-head">
        <DialogTitle className="flex items-center gap-2.5"><span className="reminders-dialog-icon"><AlarmClock className="h-5 w-5" /></span>{tr("التذكيرات")}</DialogTitle>
        <p className="text-xs opacity-80">{tr("ذكّر نفسك أو زميلك بموعد — تظهر نافذة وتنبيه في الجرس عند حلوله")}</p>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="reminders-tabs" role="tablist">
          {(Object.keys(VIEW_LABEL) as View[]).map((key) => <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)}>
            {key === "calendar" && <CalendarDays className="h-3.5 w-3.5" />}{tr(VIEW_LABEL[key])}</button>)}
        </div>
        <Button size="sm" className="ms-auto gap-1.5 rounded-full bg-teal-600 hover:bg-teal-700" onClick={() => newDraft()}><Plus className="h-4 w-4" />{tr("تذكير جديد")}</Button>
      </div>

      {draft && <div className="reminders-form">
        <Input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={tr("بماذا أذكّرك؟ مثال: الاتصال بالمورد لتأكيد الشحنة")} className="reminders-title-input"
          onKeyDown={(event) => { if (event.key === "Enter" && draft.title.trim()) void save() }} />
        <div className="reminders-quick">
          {QUICK.map((option) => <button key={option.label} type="button" aria-pressed={draft.at === toLocalInput(option.at())} onClick={() => setDraft({ ...draft, at: toLocalInput(option.at()) })}>{tr(option.label)}</button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="reminders-field"><span><Clock className="h-3.5 w-3.5" />{tr("الموعد")}</span><input type="datetime-local" value={draft.at} onChange={(event) => setDraft({ ...draft, at: event.target.value })} /></label>
          <label className="reminders-field"><span><Repeat className="h-3.5 w-3.5" />{tr("التكرار")}</span>
            <select value={draft.repeat} onChange={(event) => setDraft({ ...draft, repeat: event.target.value as Reminder["repeat"] })}>{(Object.keys(REPEAT_LABEL) as Reminder["repeat"][]).map((key) => <option key={key} value={key}>{tr(REPEAT_LABEL[key])}</option>)}</select></label>
          <label className="reminders-field"><span><UserRound className="h-3.5 w-3.5" />{tr("لمن")}</span>
            <select value={draft.assigned_to || me} onChange={(event) => setDraft({ ...draft, assigned_to: Number(event.target.value) })}>{users.map((user) => <option key={user.id} value={user.id}>{Number(user.id) === me ? `${tr("أنا")} (${user.name})` : user.name}</option>)}</select></label>
        </div>
        <Textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={tr("ملاحظة (اختياري)")} rows={2} className="rounded-xl" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(null)}>{tr("إلغاء")}</Button>
          <Button onClick={() => void save()} disabled={saving || !draft.title.trim() || !draft.at} className="rounded-full bg-teal-600 px-6 hover:bg-teal-700">{saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{draft.id ? tr("حفظ التعديل") : tr("إضافة التذكير")}</Button>
        </div>
      </div>}
      {error && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {view === "calendar" ? <RemindersCalendar rowProps={rowProps} onAdd={(day) => newDraft(day)} />
        : <div className="reminders-list">
        {loading ? <div className="grid h-40 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-teal-600" /></div>
          : !rows.length ? <div className="reminders-empty"><AlarmClock className="h-8 w-8" /><p>{tr(view === "pending" ? "لا تذكيرات قادمة" : view === "done" ? "لا تذكيرات منجزة" : "لم ترسل تذكيرات لغيرك")}</p>{view === "pending" && !draft && <Button size="sm" variant="outline" className="rounded-full" onClick={() => newDraft()}><Plus className="me-1 h-4 w-4" />{tr("أضف أول تذكير")}</Button>}</div>
          : groups.map((group) => <section key={group.key}>
            {group.title && <h3 className={`reminders-group ${group.key === "overdue" ? "is-overdue" : ""}`}>{tr(group.title)} <span>{group.items.length}</span></h3>}
            {group.items.map((row) => <ReminderRow key={row.id} row={row} sent={view === "sent"} {...rowProps} />)}
          </section>)}
      </div>}
    </DialogContent>
  </Dialog>
}

type RowProps = { me: number; onAct: (id: number, body: Record<string, unknown>) => void; onEdit: (row: Reminder) => void; onRemove: (id: number) => void }

function ReminderRow({ row, sent = false, at, me, onAct, onEdit, onRemove }: RowProps & { row: Reminder; sent?: boolean; at?: string }) {
  const now = Date.now()
  const when = at || row.due_at
  const overdue = row.status === "pending" && new Date(when).getTime() <= now
  const mine = Number(row.assigned_to) === me
  return <div className={`reminder-row ${overdue ? "is-overdue" : ""} ${row.status === "done" ? "is-done" : ""}`}>
    {row.status === "pending" && mine
      ? <button type="button" className="reminder-check" onClick={() => onAct(row.id, { action: "done" })} aria-label={tr("تم")} title={row.repeat !== "none" ? tr("تم — ينتقل للموعد التالي") : tr("تم")}><Check className="h-3.5 w-3.5" /></button>
      : <span className="reminder-check is-static">{row.status === "done" ? <Check className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}</span>}
    <div className="min-w-0 flex-1">
      <p className="reminder-title">{row.title}</p>
      {row.note && <p className="reminder-note">{row.note}</p>}
      <p className="reminder-meta">
        <span><Clock className="h-3 w-3" />{row.status === "done" && row.done_at ? `${tr("أُنجز")} ${formatWhen(row.done_at)}` : formatWhen(when)}</span>
        {row.repeat !== "none" && <span><Repeat className="h-3 w-3" />{tr(REPEAT_LABEL[row.repeat])}</span>}
        {sent || !mine ? <span><UserRound className="h-3 w-3" />{tr("إلى")} {row.assigned_to_name}</span>
          : row.created_by !== row.assigned_to && row.created_by_name ? <span><UserRound className="h-3 w-3" />{tr("من")} {row.created_by_name}</span> : null}
      </p>
    </div>
    <div className="reminder-actions">
      {row.status === "done"
        ? <button type="button" onClick={() => onAct(row.id, { action: "reopen" })} title={tr("إعادة فتح")}><RotateCcw className="h-4 w-4" /></button>
        : <button type="button" onClick={() => onEdit(row)} title={tr("تعديل")}><Pencil className="h-4 w-4" /></button>}
      <button type="button" className="is-danger" onClick={() => onRemove(row.id)} title={tr("حذف")}><Trash2 className="h-4 w-4" /></button>
    </div>
  </div>
}

type Occurrence = { row: Reminder; at: Date }

/** مواعيد تذكير داخل الفترة: المتكرر المعلّق يُفرد من موعده القادم (السابق لا سجل له) */
function occurrences(row: Reminder, start: Date, end: Date): Occurrence[] {
  const first = new Date(row.due_at)
  if (row.repeat === "none" || row.status !== "pending") return first >= start && first < end ? [{ row, at: first }] : []
  const list: Occurrence[] = []
  const at = new Date(row.remind_at)
  if (first.getTime() !== at.getTime() && first >= start && first < end) list.push({ row, at: first })
  for (let guard = 0; at < end && guard < 400; guard++) {
    if (at >= start && !(guard === 0 && first.getTime() !== at.getTime())) list.push({ row, at: new Date(at) })
    if (row.repeat === "daily") at.setDate(at.getDate() + 1)
    else if (row.repeat === "weekly") at.setDate(at.getDate() + 7)
    else at.setMonth(at.getMonth() + 1)
  }
  return list
}

function RemindersCalendar({ rowProps, onAdd }: { rowProps: RowProps; onAdd: (at: Date) => void }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(() => dayKey(new Date()))
  const [rows, setRows] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)

  // شبكة 6 أسابيع تبدأ بالسبت
  const gridStart = useMemo(() => { const d = new Date(month); d.setDate(1 - ((d.getDay() + 1) % 7)); d.setHours(0, 0, 0, 0); return d }, [month])
  const gridEnd = useMemo(() => { const d = new Date(gridStart); d.setDate(d.getDate() + 42); return d }, [gridStart])
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows((await api("GET", undefined, `?from=${encodeURIComponent(gridStart.toISOString())}&to=${encodeURIComponent(gridEnd.toISOString())}`)).reminders || []) } catch { setRows([]) } finally { setLoading(false) }
  }, [gridStart, gridEnd])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener("reminders:changed", refresh)
    return () => window.removeEventListener("reminders:changed", refresh)
  }, [load])

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const row of rows) for (const item of occurrences(row, gridStart, gridEnd)) {
      const key = dayKey(item.at)
      map.set(key, [...(map.get(key) || []), item])
    }
    for (const list of map.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime())
    return map
  }, [rows, gridStart, gridEnd])

  const days = Array.from({ length: 42 }, (_, index) => { const d = new Date(gridStart); d.setDate(d.getDate() + index); return d })
  const todayKey = dayKey(new Date())
  const selectedDate = new Date(`${selected}T00:00:00`)
  const selectedItems = byDay.get(selected) || []
  const shift = (months: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))
  const addOn = (key: string) => {
    const date = new Date(`${key}T09:00:00`)
    onAdd(key === todayKey || date.getTime() < Date.now() ? inHours(1) : date)
  }

  return <div className="reminders-calendar">
    <div className="reminders-cal-head">
      <button type="button" onClick={() => shift(-1)} aria-label={tr("الشهر السابق")}><ChevronRight className="h-4 w-4" /></button>
      <h3>{month.toLocaleDateString("ar-u-nu-latn", { month: "long", year: "numeric" })}</h3>
      <button type="button" onClick={() => shift(1)} aria-label={tr("الشهر التالي")}><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" className="is-today" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(dayKey(d)) }}>{tr("اليوم")}</button>
      {loading && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
    </div>
    <div className="reminders-cal-grid">
      {WEEK_DAYS.map((name) => <div key={name} className="reminders-cal-weekday">{tr(name)}</div>)}
      {days.map((date) => {
        const key = dayKey(date)
        const items = byDay.get(key) || []
        const outside = date.getMonth() !== month.getMonth()
        return <button key={key} type="button" onClick={() => setSelected(key)} onDoubleClick={() => addOn(key)}
          className={`reminders-cal-day ${outside ? "is-outside" : ""} ${key === todayKey ? "is-today" : ""} ${key === selected ? "is-selected" : ""}`}>
          <span className="reminders-cal-num">{date.getDate()}</span>
          {items.slice(0, 2).map((item, index) => <span key={`${item.row.id}-${index}`}
            className={`reminders-cal-chip ${item.row.status === "done" ? "is-done" : item.at.getTime() <= Date.now() ? "is-overdue" : Number(item.row.assigned_to) !== rowProps.me ? "is-sent" : ""}`}>
            <b>{item.at.toLocaleTimeString("ar-u-nu-latn", { hour: "numeric", minute: "2-digit" })}</b>{item.row.title}</span>)}
          {items.length > 2 && <span className="reminders-cal-more">+{items.length - 2}</span>}
        </button>
      })}
    </div>
    <div className="reminders-cal-day-panel">
      <div className="flex items-center gap-2">
        <h4>{selectedDate.toLocaleDateString("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })}</h4>
        <span className="reminders-cal-count">{selectedItems.length}</span>
        <Button size="sm" variant="outline" className="ms-auto gap-1 rounded-full border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => addOn(selected)}><Plus className="h-4 w-4" />{tr("تذكير في هذا اليوم")}</Button>
      </div>
      {selectedItems.length
        ? selectedItems.map((item, index) => <ReminderRow key={`${item.row.id}-${index}`} row={item.row} at={item.at.toISOString()} {...rowProps} />)
        : <p className="py-4 text-center text-sm text-slate-400">{tr("لا تذكيرات في هذا اليوم — انقر مرتين على أي يوم لإضافة تذكير")}</p>}
    </div>
  </div>
}
