"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { SECTION_TITLES } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Paperclip, Send, Lightbulb } from "lucide-react"

type Attachment = { name: string; data?: string }
type RequestRow = { id: number; request_type: string; screen_name: string; details: string; attachments: Attachment[]; status: string; submitted_by_name: string; created_at: string }
const types = ["مشكلة", "تعديل", "تطوير جديد"]
const statusClass: Record<string, string> = {
  "جديد": "bg-blue-100 text-blue-800", "في انتظار الموافقة": "bg-amber-100 text-amber-800", "قيد التطوير": "bg-violet-100 text-violet-800",
  "تمت": "bg-emerald-100 text-emerald-800", "مرفوض": "bg-red-100 text-red-800", "تمت باصدار سابق": "bg-slate-200 text-slate-700",
}

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
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const screens = useMemo(() => Object.entries(SECTION_TITLES).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar")), [])
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/feature-requests", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الرسائل")
      setRows(Array.isArray(data) ? data : [])
    } catch (e: any) { setError(e.message || "تعذر تحميل الرسائل") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const onFiles = async (selected: FileList | null) => {
    if (!selected?.length) return
    setError("")
    const chosen = Array.from(selected)
    if (files.length + chosen.length > 8) { setError("الحد الأقصى 8 مرفقات"); return }
    if (chosen.some((file) => file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type))) {
      setError("المسموح صور PNG/JPG/WebP أو PDF، بحد أقصى 5MB للملف"); return
    }
    try { const loaded = await Promise.all(chosen.map(readAttachment)); setFiles((current) => [...current, ...loaded]) }
    catch (e: any) { setError(e.message || "تعذرت قراءة المرفقات") }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSuccess("")
    if (!type || !screen || details.trim().length < 5) { setError("أكمل النوع والشاشة والتفاصيل"); return }
    setSaving(true)
    try {
      const response = await fetch("/api/feature-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_type: type, screen_name: screens.find((item) => item.value === screen)?.label || screen, details, attachments: files }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرسالة")
      setRows((current) => [data, ...current]); setType(""); setScreen(""); setDetails(""); setFiles([]); setSuccess("تم إرسال رسالتك بنجاح")
    } catch (e: any) { setError(e.message || "تعذر إرسال الرسالة") }
    finally { setSaving(false) }
  }

  return <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
    <header className="rounded-2xl bg-gradient-to-l from-violet-700 to-indigo-600 p-6 text-white shadow-md">
      <div className="flex items-center gap-3"><Lightbulb className="h-7 w-7"/><div><h1 className="text-xl font-bold">بريد الرسائل والتحسينات</h1><p className="mt-1 text-sm text-violet-100">أرسل مشكلة أو اقتراحاً، وتابع حالة طلبات قاعدة بياناتك.</p></div></div>
    </header>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="request-type">النوع *</Label><select id="request-type" value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">اختر النوع</option>{types.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="request-screen">الشاشة *</Label><select id="request-screen" value={screen} onChange={(e) => setScreen(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">اختر الشاشة</option>{screens.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="request-details">التفاصيل *</Label><Textarea id="request-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={5} maxLength={10000} placeholder="اشرح المشكلة أو التعديل أو التطوير المطلوب..." /></div>
      <div className="space-y-2"><Label htmlFor="request-files">المرفقات</Label><Input id="request-files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => { void onFiles(e.target.files); e.currentTarget.value = "" }} />
        {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"><Paperclip className="h-3 w-3"/>{file.name}<button type="button" className="text-red-600" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}>×</button></span>)}</div>}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{success && <p className="text-sm text-emerald-700">{success}</p>}
      <Button type="submit" disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}إرسال</Button>
    </form>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">الرسائل والطلبات السابقة</h2><Button type="button" variant="outline" size="sm" onClick={() => void load()}>تحديث</Button></div>
      {loading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin"/></div> : rows.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد رسائل لهذه القاعدة حتى الآن.</div> : <div className="space-y-3">{rows.map((row) => <article key={row.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold">{row.request_type} · {row.screen_name}</div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[row.status] || "bg-slate-100"}`}>{row.status}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.details}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{row.submitted_by_name}</span><time>{new Date(row.created_at).toLocaleString("ar")}</time></div>{row.attachments?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{row.attachments.map((file, i) => <a key={`${file.name}-${i}`} href={`/api/feature-requests/${row.id}/attachments/${i}`} download={file.name} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-indigo-700"><Paperclip className="h-3 w-3"/>{file.name}</a>)}</div>}</article>)}</div>}
    </section>
  </div>
}
