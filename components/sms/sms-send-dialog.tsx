"use client"

import { useEffect, useState } from "react"
import { Loader2, MessageSquareText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

// إرسال رسالة SMS لعميل مستند (فاتورة/إرسالية/طلبية/سند قبض…): الجوال من بطاقة العميل والنص من قالب نوع المستند
// (إعدادات الرسائل SMS ← ربط القوالب بالحركات) — قابلان للتعديل قبل الإرسال. الإرسال يُسجَّل في سجل الرسائل.

type Preview = {
  enabled: boolean; mobile: string; message: string; template: { id: number; name: string } | null
  party_name: string; code: string; templates: { id: number; name: string }[]
}

// SMS عربي: 70 حرفاً للرسالة الواحدة (67 لكل جزء عند التقسيم)، والإنجليزي 160 (153)
const smsParts = (text: string) => {
  const unicode = /[^\x00-\x7F]/.test(text)
  const single = unicode ? 70 : 160, multi = unicode ? 67 : 153
  return text.length <= single ? 1 : Math.ceil(text.length / multi)
}

export function SmsSendDialog({ open, onOpenChange, docKey, documentId }: { open: boolean; onOpenChange: (open: boolean) => void; docKey: string; documentId: number }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mobile, setMobile] = useState("")
  const [message, setMessage] = useState("")
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async (template?: number | null) => {
    setLoading(true); setResult(null)
    try {
      const query = new URLSearchParams({ scope: "preview", doc_key: docKey, id: String(documentId) })
      if (template) query.set("template_id", String(template))
      const response = await fetch(`/api/sms?${query}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الرسالة")
      setPreview(data)
      if (!template) setMobile(data.mobile || "")
      setMessage(data.message || "")
      setTemplateId(data.template?.id ?? template ?? null)
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "تعذر تحميل الرسالة" })
    } finally { setLoading(false) }
  }
  useEffect(() => { if (open && documentId > 0) void load() }, [open, docKey, documentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true); setResult(null)
    try {
      const response = await fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", doc_key: docKey, id: documentId, mobile, message }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.sent) throw new Error(data.error || "تعذر إرسال الرسالة")
      setResult({ ok: true, text: "تم إرسال الرسالة بنجاح" })
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "تعذر إرسال الرسالة" })
    } finally { setSending(false) }
  }

  return (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="z-[3001] w-[min(560px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden rounded-2xl p-0">
          <div className="flex items-center gap-3 bg-gradient-to-l from-sky-600 to-cyan-600 px-5 py-3 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><MessageSquareText className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">رسالة SMS للعميل</DialogTitle>
              <DialogDescription className="text-xs text-sky-50">{preview ? `${preview.party_name || "—"} · ${preview.code}` : "جاري التحميل…"}</DialogDescription>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {preview && !preview.enabled && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">خدمة الرسائل غير مفعّلة — فعّلها من الإعدادات ← إعدادات الرسائل SMS</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>رقم الجوال</Label><Input dir="ltr" value={mobile} onChange={event => setMobile(event.target.value)} placeholder="05xxxxxxxx" /></div>
              <div className="space-y-1.5">
                <Label>القالب</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={templateId ?? ""} disabled={loading}
                  onChange={event => { const id = Number(event.target.value) || null; setTemplateId(id); if (id) void load(id) }}>
                  <option value="">{preview?.templates.length ? "اختر قالباً" : "لا توجد قوالب"}</option>
                  {(preview?.templates || []).map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>نص الرسالة</Label><small className="text-xs text-muted-foreground">{message.length} حرفاً · {smsParts(message)} رسالة</small></div>
              <Textarea rows={5} value={message} onChange={event => setMessage(event.target.value)} placeholder={loading ? "جاري التحميل…" : "اكتب نص الرسالة أو اختر قالباً"} />
            </div>
            {result && <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{result.text}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
            <Button onClick={() => void send()} disabled={sending || loading || !mobile.trim() || !message.trim() || preview?.enabled === false} className="bg-sky-600 hover:bg-sky-700">
              {sending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}إرسال
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
}
