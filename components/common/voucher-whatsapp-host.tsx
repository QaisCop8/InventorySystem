"use client"

import { useEffect, useState } from "react"
import { Download, Loader2, MessageCircle, Send, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { logVoucherAudit } from "@/lib/audit-client"
import type { PrintDocument } from "@/lib/voucher-print/document"
import { VOUCHER_WHATSAPP_EVENT, type VoucherWhatsAppDetail } from "@/lib/voucher-print/whatsapp-share"

// نافذة "إرسال السند عبر واتساب" — تُركَّب مرة واحدة في الصفحة الرئيسية وتستقبل المستند من محرك الطباعة
// (زر واتساب في شريط أدوات أي حركة). السند يُحفظ PDF بنفس شكل طباعته ويُرسل لرقم عميل السند.

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

const fileNameOf = (doc: PrintDocument) =>
  `${`${doc.title || "سند"} ${doc.code || ""}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80)}.pdf`

export default function VoucherWhatsAppHost() {
  const { toast } = useToast()
  const [request, setRequest] = useState<VoucherWhatsAppDetail | null>(null)
  const [phone, setPhone] = useState("")
  const [recipient, setRecipient] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState<"" | "direct" | "share" | "wa" | "pdf">("")
  const [configured, setConfigured] = useState(false)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const [pdf, setPdf] = useState<{ blob: Blob; filename: string } | null>(null)

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<VoucherWhatsAppDetail>).detail
      if (!detail?.document) return
      setRequest(detail)
      setPdf(null)
      setPhone("")
      setRecipient("")
      setMessage(`مرفق ${detail.document.title} رقم ${detail.document.code}${detail.document.date ? ` بتاريخ ${String(detail.document.date).slice(0, 10)}` : ""}`)
      if (detail.accountId) {
        void fetch(`/api/customers/contact?account_id=${detail.accountId}`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => { if (data) { setPhone(String(data.phone || "")); setRecipient(String(data.name || "")) } })
          .catch(() => undefined)
      }
      void fetch("/api/whatsapp/send-document", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setConfigured(Boolean(d?.configured))).catch(() => setConfigured(false))
      try {
        setCanShareFiles(typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File(["x"], "t.pdf", { type: "application/pdf" })] }))
      } catch { setCanShareFiles(false) }
    }
    window.addEventListener(VOUCHER_WHATSAPP_EVENT, onRequest)
    return () => window.removeEventListener(VOUCHER_WHATSAPP_EVENT, onRequest)
  }, [])

  const buildPdf = async () => {
    if (pdf) return pdf
    if (!request) throw new Error("لا يوجد سند")
    const { voucherPdfBlob } = await import("@/lib/voucher-print/print")
    const built = { blob: await voucherPdfBlob(request.document), filename: fileNameOf(request.document) }
    setPdf(built)
    return built
  }

  const audit = (action: "whatsapp" | "pdf", channel: string) => {
    if (!request) return
    logVoucherAudit({ action, source: request.document.auditSource, voucher_id: request.document.auditVoucherId ?? null, vch_type: request.document.voucherTypeId, vch_code: request.document.code, phone: phone || null, channel })
  }

  const run = async (mode: "direct" | "share" | "wa" | "pdf") => {
    if ((mode === "direct" || mode === "wa") && !waNumber(phone)) {
      toast({ title: "أدخل رقم واتساب العميل", variant: "destructive" })
      return
    }
    // تُفتح نافذة واتساب فوراً (قبل أي انتظار) وإلا يحجبها المتصفح
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
        const response = await fetch("/api/whatsapp/send-document", { method: "POST", body: form })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || "تعذر الإرسال عبر واتساب")
        audit("whatsapp", "business_api")
        toast({ title: "تم إرسال السند عبر واتساب" })
        setRequest(null)
      } else if (mode === "share") {
        await navigator.share({ files: [new File([blob], filename, { type: "application/pdf" })], title: filename, text: message })
        audit("whatsapp", "share")
        setRequest(null)
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
      toast({ title: "تعذر تجهيز السند", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      setBusy("")
    }
  }

  if (!request) return null
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) setRequest(null) }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" />إرسال السند عبر واتساب</DialogTitle>
          <DialogDescription>{request.document.title} رقم <b className="font-mono">{request.document.code}</b> — يُحفظ PDF بنفس شكل الطباعة ويُرسل للعميل.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>العميل</Label><Input className="mt-1" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="اسم المستلم" /></div>
            <div><Label>رقم واتساب</Label><Input className="mt-1" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" /></div>
          </div>
          {!phone && request.accountId && <p className="text-xs text-amber-700">لا يوجد رقم واتساب/جوال في ملف العميل — أدخله يدوياً.</p>}
          <div><Label>الرسالة</Label><Textarea className="mt-1" rows={2} value={message} onChange={(event) => setMessage(event.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {configured && (
              <Button type="button" disabled={Boolean(busy)} onClick={() => void run("direct")} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                {busy === "direct" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال مباشر
              </Button>
            )}
            {canShareFiles && (
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("share")} className="gap-2">
                {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}مشاركة الملف (واتساب)
              </Button>
            )}
            <Button type="button" variant={configured ? "outline" : "default"} disabled={Boolean(busy)} onClick={() => void run("wa")} className={`gap-2 ${configured ? "" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {busy === "wa" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}فتح واتساب + تنزيل PDF
            </Button>
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void run("pdf")} className="gap-2">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}تنزيل PDF فقط
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            {configured ? "«إرسال مباشر» يرسل الملف من رقم الشركة عبر واتساب للأعمال." : "واتساب على الويب لا يسمح بإرفاق ملف تلقائياً: يُنزَّل الملف وتُفتح محادثة العميل لإرفاقه."}
            {canShareFiles ? " على الجوال: «مشاركة الملف» يرسله مباشرة عبر تطبيق واتساب." : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
