"use client"

import { useEffect, useRef, useState } from "react"
import { Download, Loader2, MessageCircle, Send, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { logReportAudit } from "@/lib/audit-client"
import { collectReportFilters, reportContextOf } from "@/lib/report-filters-capture"
import { pdfFileName, reportPdfBlob } from "@/lib/report-pdf"
import { buildReportFrom } from "@/lib/voucher-print/report-print"
import { useReportAccess } from "@/components/auth/use-report-access"

type Contact = { name: string; phone: string }

// رقم واتساب دولي بلا رموز: 05xxxxxxxx ⇐ 9705xxxxxxxx (نفس قاعدة lib/whatsapp-service.ts)
const waNumber = (phone: string) => {
  let digits = phone.replace(/[^\d+]/g, "")
  if (digits.startsWith("+")) return digits.slice(1)
  if (digits.startsWith("00")) return digits.slice(2)
  if (digits.startsWith("0")) digits = `970${digits.slice(1)}`
  return digits
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** زر "واتساب": يحفظ التقرير الظاهر PDF ويرسله للعميل (إرسال مباشر/مشاركة/تنزيل + فتح واتساب). */
export function ReportShareButton({ className = "" }: { className?: string }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const canAccessReport = useReportAccess()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"" | "direct" | "share" | "wa" | "pdf">("")
  const [phone, setPhone] = useState("")
  const [recipient, setRecipient] = useState("")
  const [message, setMessage] = useState("")
  const [configured, setConfigured] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [canShareFiles, setCanShareFiles] = useState(false)
  const [canShareReport, setCanShareReport] = useState(true)
  const [reportSection, setReportSection] = useState<string | null>(null)

  useEffect(() => {
    const section = reportSection || reportContextOf(anchorRef.current).key
    if (section && section !== reportSection) setReportSection(section)
    setCanShareReport(canAccessReport(section, "whatsapp"))
  }, [canAccessReport, reportSection])

  useEffect(() => {
    if (!open) return
    const title = reportContextOf(anchorRef.current).title || anchorRef.current?.closest(".report-page")?.querySelector("h1")?.textContent?.trim() || "التقرير"
    setMessage(current => current || `مرفق ${title}`)
    try {
      setCanShareFiles(typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.pdf", { type: "application/pdf" })] }))
    } catch { setCanShareFiles(false) }
    void fetch("/api/whatsapp/send-document", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => setConfigured(Boolean(d?.configured))).catch(() => setConfigured(false))
    if (!contacts.length) {
      void fetch("/api/customers?type=1", { cache: "no-store" }).then(r => r.ok ? r.json() : []).then((rows: any[]) => {
        setContacts((Array.isArray(rows) ? rows : [])
          .map(row => ({ name: String(row.name || row.customer_name || "").trim(), phone: String(row.whatsapp1 || row.mobile1 || "").trim() }))
          .filter(row => row.name && row.phone)
          .slice(0, 2000))
      }).catch(() => undefined)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickRecipient = (value: string) => {
    setRecipient(value)
    const match = contacts.find(contact => contact.name === value)
    if (match) setPhone(match.phone)
  }

  const buildPdf = async () => {
    const built = await buildReportFrom(anchorRef.current, { forPdf: true })
    if (!built) throw new Error("لا توجد بيانات ظاهرة في التقرير — اعرض التقرير أولاً")
    const blob = await reportPdfBlob(built)
    return { blob, filename: pdfFileName(built.title), title: built.title }
  }

  const audit = (action: "pdf" | "whatsapp", channel: string) => {
    const context = reportContextOf(anchorRef.current)
    logReportAudit({ action, report_key: context.key, report_title: context.title, filters: collectReportFilters(context.root), phone: phone || null, recipient: recipient || null, channel })
  }

  const run = async (mode: "direct" | "share" | "wa" | "pdf") => {
    const section = reportSection || reportContextOf(anchorRef.current).key
    if (!canAccessReport(section, "whatsapp")) {
      setCanShareReport(false)
      return
    }
    if (mode !== "pdf" && mode !== "share" && !waNumber(phone)) {
      toast({ title: "أدخل رقم واتساب العميل", variant: "destructive" })
      return
    }
    // تُفتح نافذة واتساب فوراً (قبل أي انتظار) وإلا يحجبها المتصفح كنافذة منبثقة
    const waWindow = mode === "wa" ? window.open("about:blank", "_blank") : null
    setBusy(mode)
    try {
      const { blob, filename } = await buildPdf()
      if (mode === "pdf") {
        downloadBlob(blob, filename)
        audit("pdf", "download")
      } else if (mode === "direct") {
        const form = new FormData()
        form.append("phone", phone)
        form.append("file", blob, filename)
        form.append("filename", filename)
        form.append("caption", message)
        form.append("recipient", recipient)
        if (section) form.append("report_key", section)
        const response = await fetch("/api/whatsapp/send-document", { method: "POST", body: form })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || "تعذر الإرسال عبر واتساب")
        audit("whatsapp", "business_api")
        toast({ title: "تم إرسال التقرير عبر واتساب" })
        setOpen(false)
      } else if (mode === "share") {
        await navigator.share({ files: [new File([blob], filename, { type: "application/pdf" })], title: filename, text: message })
        audit("whatsapp", "share")
        setOpen(false)
      } else {
        downloadBlob(blob, filename)
        const url = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(`${message}\n(الملف: ${filename})`)}`
        if (waWindow) waWindow.location.href = url
        else window.open(url, "_blank")
        audit("whatsapp", "wa_link")
        toast({ title: "تم تنزيل ملف PDF", description: "أرفق الملف في محادثة واتساب التي فُتحت للعميل." })
      }
    } catch (error) {
      waWindow?.close()
      if ((error as any)?.name === "AbortError") return
      toast({ title: "تعذر تجهيز التقرير", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      setBusy("")
    }
  }

  if (!canShareReport) return null
  return <>
    <Button ref={anchorRef} type="button" variant="outline" onClick={() => setOpen(true)} className={`gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 ${className}`} title="حفظ التقرير PDF وإرساله للعميل عبر واتساب">
      <MessageCircle className="h-4 w-4" />واتساب
    </Button>
    <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" />إرسال التقرير PDF عبر واتساب</DialogTitle>
          <DialogDescription>يُحفظ التقرير كما هو ظاهر الآن (بنفس الفلاتر) كملف PDF ويُرسل للعميل.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>العميل</Label>
            <Input className="mt-1" list="report-share-contacts" value={recipient} onChange={event => pickRecipient(event.target.value)} placeholder="اكتب اسم العميل لاختيار رقمه (اختياري)" />
            <datalist id="report-share-contacts">{contacts.map(contact => <option key={`${contact.name}-${contact.phone}`} value={contact.name} />)}</datalist>
          </div>
          <div>
            <Label>رقم واتساب</Label>
            <Input className="mt-1" dir="ltr" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="0599123456 أو 970599123456" />
          </div>
          <div>
            <Label>الرسالة</Label>
            <Textarea className="mt-1" rows={3} value={message} onChange={event => setMessage(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {configured && <Button type="button" disabled={!!busy} onClick={() => void run("direct")} className="gap-2 bg-emerald-600 hover:bg-emerald-700 sm:col-span-2">
              {busy === "direct" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال مباشر للعميل (واتساب للأعمال)
            </Button>}
            {canShareFiles && <Button type="button" variant={configured ? "outline" : "default"} disabled={!!busy} onClick={() => void run("share")} className="gap-2">
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}مشاركة الملف (اختر واتساب)
            </Button>}
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => void run("wa")} className="gap-2">
              {busy === "wa" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}تنزيل PDF وفتح محادثة العميل
            </Button>
            <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void run("pdf")} className="gap-2">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}حفظ PDF فقط
            </Button>
          </div>
          {!configured && <p className="text-xs text-muted-foreground">للإرسال المباشر دون إرفاق يدوي فعّل ربط "WhatsApp Business" من إعدادات الربط.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
