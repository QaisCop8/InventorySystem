"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { SECTION_TITLES } from "@/components/sidebar"
import { formatStoredUtcDateTimeInHebron } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import Messages from "@/components/common/Messages"
import { Bug, CalendarClock, FilePlus2, Inbox, Lightbulb, Loader2, Monitor, Paperclip, PencilRuler, RefreshCw, Search, Send, Sparkles, User, X } from "lucide-react"

// أدوات ⇐ بريد الرسائل والتحسينات: إرسال مشكلة/تعديل/تطوير مع الشاشة والمرفقات، ومتابعة حالة طلبات قاعدة البيانات.

type Attachment = { name: string; data?: string }
type RequestRow = { id: number; request_type: string; screen_name: string; details: string; attachments: Attachment[]; status: string; submitted_by_name: string; created_at: string }

const TYPES = [
  { value: "مشكلة", icon: Bug, tone: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300" },
  { value: "تعديل", icon: PencilRuler, tone: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" },
  { value: "تطوير جديد", icon: Sparkles, tone: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" },
]
const STATUS_CLASS: Record<string, string> = {
  "جديد": "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  "في انتظار الموافقة": "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  "قيد التطوير": "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  "تمت": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  "مرفوض": "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  "تمت باصدار سابق": "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}
const DONE_STATUSES = new Set(["تمت", "تمت باصدار سابق", "مرفوض"])
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"]

const readAttachment = (file: File) => new Promise<Attachment>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve({ name: file.name, data: String(reader.result || "") })
  reader.onerror = () => reject(new Error(`تعذرت قراءة ${file.name}`))
  reader.readAsDataURL(file)
})

export default function FeatureRequests() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [type, setType] = useState("")
  const [screen, setScreen] = useState("")
  const [details, setDetails] = useState("")
  const [files, setFiles] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const messagesRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const screens = useMemo(() => Object.entries(SECTION_TITLES).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar")), [])

  const show = (severity: "success" | "error", detail: string) => {
    messagesRef.current?.clear?.()
    messagesRef.current?.show?.([{ severity, summary: "", detail, life: 5000, sticky: severity === "error" }])
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/feature-requests", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الرسائل")
      setRows(Array.isArray(data) ? data : [])
    } catch (e: any) { show("error", e.message || "تعذر تحميل الرسائل") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const onFiles = async (selected: FileList | null) => {
    if (!selected?.length) return
    const chosen = Array.from(selected)
    if (files.length + chosen.length > 8) { show("error", "الحد الأقصى 8 مرفقات"); return }
    if (chosen.some((file) => file.size > 5 * 1024 * 1024 || !ALLOWED_TYPES.includes(file.type))) {
      show("error", "المسموح صور PNG/JPG/WebP أو PDF، بحد أقصى 5MB للملف"); return
    }
    try { const loaded = await Promise.all(chosen.map(readAttachment)); setFiles((current) => [...current, ...loaded]) }
    catch (e: any) { show("error", e.message || "تعذرت قراءة المرفقات") }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!type || !screen || details.trim().length < 5) { show("error", "أكمل النوع والشاشة والتفاصيل"); return }
    setSaving(true)
    try {
      const response = await fetch("/api/feature-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_type: type, screen_name: screens.find((item) => item.value === screen)?.label || screen, details, attachments: files }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرسالة")
      setRows((current) => [data, ...current]); setType(""); setScreen(""); setDetails(""); setFiles([])
      show("success", "تمت العملية بنجاح — تم إرسال رسالتك")
    } catch (e: any) { show("error", e.message || "تعذر إرسال الرسالة") }
    finally { setSaving(false) }
  }

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status).filter(Boolean))], [rows])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => (!statusFilter || row.status === statusFilter)
      && (!term || [row.details, row.screen_name, row.request_type, row.submitted_by_name].some((value) => String(value || "").toLowerCase().includes(term))))
  }, [rows, search, statusFilter])
  const openCount = rows.filter((row) => !DONE_STATUSES.has(row.status)).length
  const doneCount = rows.filter((row) => row.status === "تمت" || row.status === "تمت باصدار سابق").length

  return (
    <div dir="rtl" className="w-full space-y-4 p-4">
      <header className="page-hero relative overflow-hidden rounded-2xl px-5 py-5 sm:px-7">
        <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur"><Lightbulb /></div>
            <div>
              <p className="text-xs font-semibold text-emerald-50/90">أدوات</p>
              <h1 className="truncate text-2xl font-black text-white drop-shadow-sm sm:text-3xl">بريد الرسائل والتحسينات</h1>
              <p className="mt-1 text-sm text-emerald-50/85">أرسل مشكلة أو تعديلاً أو فكرة تطوير، وتابع حالة طلبات قاعدة بياناتك</p>
            </div>
          </div>
          <div className="flex gap-2 text-center text-xs">
            {[{ label: "كل الطلبات", value: rows.length }, { label: "قيد المتابعة", value: openCount }, { label: "تمت", value: doneCount }].map((stat) => (
              <div key={stat.label} className="min-w-20 rounded-xl bg-white/15 px-3 py-2 text-white ring-1 ring-white/20 backdrop-blur">
                <div className="text-lg font-black">{stat.value}</div>{stat.label}
              </div>
            ))}
          </div>
        </div>
      </header>

      <Messages innerRef={messagesRef} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm xl:sticky xl:top-4">
          <h2 className="flex items-center gap-2 text-sm font-bold"><FilePlus2 className="h-4 w-4 text-emerald-600" />رسالة جديدة</h2>

          <div className="grid gap-1.5">
            <Label>النوع *</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((item) => {
                const active = type === item.value
                return (
                  <button key={item.value} type="button" onClick={() => setType(item.value)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-semibold transition ${active ? item.tone + " ring-2 ring-offset-1 ring-current/30" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>
                    <item.icon className="h-5 w-5" />{item.value}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="request-screen">الشاشة *</Label>
            <div className="relative">
              <Monitor className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select id="request-screen" value={screen} onChange={(e) => setScreen(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm">
                <option value="">اختر الشاشة</option>
                {screens.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="request-details">التفاصيل *</Label>
            <Textarea id="request-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={7} maxLength={10000} placeholder="اشرح المشكلة أو التعديل أو التطوير المطلوب، وخطوات الوصول إليه إن أمكن..." />
            <span className="text-left text-[11px] text-muted-foreground" dir="ltr">{details.length} / 10000</span>
          </div>

          <div className="grid gap-1.5">
            <Label>المرفقات <span className="text-xs font-normal text-muted-foreground">(صور أو PDF — حتى 8، 5MB للملف)</span></Label>
            <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => { void onFiles(e.target.files); e.currentTarget.value = "" }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFiles(e.dataTransfer.files) }}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-5 text-sm text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
              <Paperclip className="h-5 w-5" />اضغط لاختيار الملفات أو اسحبها هنا
            </button>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs">
                    <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{file.name}</span>
                    <button type="button" className="text-red-600 hover:text-red-700" aria-label={`إزالة ${file.name}`} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" disabled={saving} className="h-11 w-full gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال</Button>
        </form>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border bg-background p-3 shadow-sm lg:flex-row lg:items-center">
            <h2 className="flex shrink-0 items-center gap-2 text-sm font-bold"><Inbox className="h-4 w-4 text-emerald-600" />الرسائل والطلبات السابقة</h2>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في التفاصيل أو الشاشة أو المرسل..." />
            </div>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`ml-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />تحديث</Button>
          </div>

          {statuses.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {["", ...statuses].map((status) => (
                <button key={status || "all"} type="button" onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${statusFilter === status ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                  {status || "الكل"} <span className="opacity-70">({status ? rows.filter((row) => row.status === status).length : rows.length})</span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center rounded-2xl border bg-background p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 h-10 w-10 text-emerald-500" />{rows.length ? "لا توجد نتائج مطابقة" : "لا توجد رسائل لهذه القاعدة حتى الآن."}
            </div>
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {visible.map((row) => {
                const typeDef = TYPES.find((item) => item.value === row.request_type)
                const TypeIcon = typeDef?.icon || Lightbulb
                return (
                  <article key={row.id} className="flex flex-col rounded-2xl border bg-background p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${typeDef?.tone || "bg-muted"}`}><TypeIcon className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <div className="font-bold">{row.request_type}</div>
                          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground"><Monitor className="h-3 w-3 shrink-0" />{row.screen_name}</div>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[row.status] || "bg-muted text-muted-foreground"}`}>{row.status}</span>
                    </div>
                    <p className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-7">{row.details}</p>
                    {row.attachments?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {row.attachments.map((file, i) => (
                          <a key={`${file.name}-${i}`} href={`/api/feature-requests/${row.id}/attachments/${i}`} download={file.name} className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                            <Paperclip className="h-3 w-3 shrink-0" /><span className="truncate">{file.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{row.submitted_by_name || "—"}</span>
                      <time dir="ltr" className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{formatStoredUtcDateTimeInHebron(row.created_at)}</time>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
