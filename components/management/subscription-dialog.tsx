"use client"

import { tr, appDir } from "@/lib/i18n"
import { useMemo, useState } from "react"
import { CalendarClock, CheckCircle2, CreditCard, Loader2, Send, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ONLINE_COMPANY_PAYMENT_VISIBLE, priceFor, type Pricing } from "@/lib/company-pricing"
import { openLahzaPopup } from "@/lib/lahza-popup"

// نافذة الدفع لتجديد الاشتراك (شركة حقيقية بقي عليها أقل من شهر أو انتهت) أو تحويل نسخة تجريبية إلى حقيقية.
// المدة سنة تبدأ من نهاية الاشتراك الحالي إن لم ينتهِ، وإلا من اليوم — نفس حساب الخادم (company-billing.ts).
// تستخدم أنماط cp-* المعرّفة في صفحة "شركاتي".
// الدفع الإلكتروني مخفي (ONLINE_COMPANY_PAYMENT_VISIBLE = false) ⇐ بدل زر الدفع يُرسل طلب للمبيعات (/api/management/sales-leads)
// بتفاصيل الترخيص والمبلغ والمدة، ويُفعَّل الاشتراك بعد اعتماده من الإدارة.

export type SubscriptionCompany = {
  id: number
  name: string
  expiry_date?: string | null
  number_of_users: number
  number_of_branches: number
  number_of_pos_points: number
  number_of_restaurant_locations?: number
}

const formatDate = (date: Date) => date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })

export function SubscriptionDialog({ company, purpose, pricing, testMode, account, onClose, onDone, onLeadSent }: {
  company: SubscriptionCompany
  purpose: "renewal" | "upgrade"
  pricing: Pricing
  testMode: boolean
  account?: { name: string; email: string } | null
  onClose: () => void
  onDone: (expiryDate: string | null) => void
  onLeadSent?: () => void
}) {
  const [lead, setLead] = useState({ name: account?.name || "", email: account?.email || "", phone: "", whatsapp: "" })
  const [leadSent, setLeadSent] = useState(false)
  const [users, setUsers] = useState(String(company.number_of_users || 1))
  const [branches, setBranches] = useState(String(company.number_of_branches || 1))
  const [posPoints, setPosPoints] = useState(String(company.number_of_pos_points || 0))
  const [restaurants, setRestaurants] = useState(String(company.number_of_restaurant_locations || 0))
  const [busy, setBusy] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [error, setError] = useState("")
  const [verificationReference, setVerificationReference] = useState("")

  const counts = { users: Number(users) || 1, branches: Number(branches) || 1, posPoints: Number(posPoints) || 0, restaurantLocations: Number(restaurants) || 0 }
  const quote = priceFor(pricing, counts)
  const period = useMemo(() => {
    const now = new Date()
    const expiry = company.expiry_date ? new Date(company.expiry_date) : null
    const start = expiry && expiry > now ? expiry : now
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    return { start, end, fromExpiry: Boolean(expiry && expiry > now) }
  }, [company.expiry_date])

  // closedText: أُغلقت نافذة لحظة — قد يكون الدفع تم فعلاً (WebView أندرويد)، فيُتحقق بالخادم قبل عرض رسالة الإلغاء
  const verify = async (reference: string, closedText?: string) => {
    setBusy(true)
    setError("")
    setVerificationReference(reference)
    try {
      const response = await fetch("/api/management/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر التحقق من الدفع"))
      if (data.status === "approved") { setVerificationReference(""); onDone(data.expiryDate || null) }
      else setError(closedText || data.message || tr("لم تكتمل عملية الدفع"))
    } catch (e) {
      setError(closedText || (e instanceof Error ? e.message : tr("تعذّر التحقق من الدفع")))
    } finally {
      setBusy(false)
    }
  }

  const pay = async () => {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/management/companies/${company.id}/subscription-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, number_of_users: counts.users, number_of_branches: counts.branches, number_of_pos_points: counts.posPoints, number_of_restaurant_locations: counts.restaurantLocations }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر بدء عملية الدفع"))
      // الحوار يُخفى أثناء نافذة لحظة (الحوار المشروط يمنع النقر خارجه) ثم يعود بالنتيجة
      setPopupOpen(true)
      await openLahzaPopup({
        publicKey: data.publicKey, email: data.email, firstName: data.fullName, amountMinor: data.amountMinor, currency: data.currency, reference: data.reference,
        metadata: { company_id: company.id, purpose },
        onSuccess: () => { setPopupOpen(false); void verify(data.reference) },
        onCancel: () => { setPopupOpen(false); void verify(data.reference, "تم إغلاق نافذة الدفع قبل إتمام العملية") },
      })
    } catch (e) {
      setPopupOpen(false)
      setBusy(false)
      setError(e instanceof Error ? e.message : tr("تعذّر بدء عملية الدفع"))
    }
  }

  const sendToSales = async () => {
    setBusy(true)
    setError("")
    try {
      const notes = [
        purpose === "upgrade" ? "طلب تحويل نسخة تجريبية إلى نسخة حقيقية" : "طلب تمديد الاشتراك",
        `الشركة: ${company.name}`,
        `المستخدمون: ${counts.users} · الفروع: ${counts.branches} · نقاط البيع: ${counts.posPoints} · مواقع المطاعم: ${counts.restaurantLocations}`,
        `الإجمالي: ${quote.total.toFixed(2)} ${quote.currency}`,
        `المدة: ${formatDate(period.start)} — ${formatDate(period.end)}`,
      ].join("\n")
      const response = await fetch("/api/management/sales-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, whatsapp: lead.whatsapp.trim() || lead.phone, company_id: company.id, notes }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر إرسال الطلب"))
      setLeadSent(true)
      onLeadSent?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("تعذّر إرسال الطلب"))
    } finally {
      setBusy(false)
    }
  }
  const leadReady = Boolean(lead.name.trim() && lead.email.trim() && lead.phone.trim())

  const editable = purpose === "upgrade"
  const field = (label: string, value: string, set: (value: string) => void, min: number) => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-600">{label}</label>
      <input type="number" min={min} value={value} disabled={!editable || busy} onChange={(event) => set(event.target.value)} className="cp-field text-start tabular-nums disabled:opacity-60" />
    </div>
  )

  return (
    <Dialog open={!popupOpen} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent dir={appDir()} className="cp-dialog max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-slate-900">
            {purpose === "upgrade" ? <Sparkles className="h-5 w-5 text-violet-700" /> : <CalendarClock className="h-5 w-5 text-emerald-700" />}
            {purpose === "upgrade" ? tr("التحويل إلى نسخة حقيقية") : tr("تمديد الاشتراك")}
          </DialogTitle>
          <DialogDescription className="text-stone-500">
            {company.name} — {purpose === "upgrade" ? (ONLINE_COMPANY_PAYMENT_VISIBLE ? tr("اختر الترخيص المطلوب وادفع الاشتراك السنوي، وتبقى كل بياناتك كما هي.") : tr("اختر الترخيص المطلوب وأرسل طلبك لفريق المبيعات، وتبقى كل بياناتك كما هي.")) : tr("اشتراك سنة جديدة بنفس الترخيص الحالي.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field(tr("عدد المستخدمين"), users, setUsers, 1)}
          {field(tr("عدد الفروع"), branches, setBranches, 1)}
          {field(tr("عدد نقاط البيع"), posPoints, setPosPoints, 0)}
          {field(tr("مواقع المطاعم"), restaurants, setRestaurants, 0)}
        </div>

        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          {quote.lines.filter((line) => line.amount > 0).map((line) => (
            <div key={line.label} className="flex justify-between text-xs text-slate-600"><span>{line.label}</span><span className="tabular-nums" dir="ltr">{line.amount.toFixed(2)}</span></div>
          ))}
          <div className="flex justify-between border-t border-[#ece3d3] pt-2 text-base font-black"><span>{tr("الإجمالي")}</span><span className="tabular-nums text-emerald-700" dir="ltr">{quote.total.toFixed(2)} {quote.currency}</span></div>
          <div className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs leading-6 text-slate-700">
            <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-cyan-700" />
            <span>
              {tr("مدة الاشتراك الجديد: من ")}<b>{formatDate(period.start)}</b>{tr(" إلى ")}<b>{formatDate(period.end)}</b>
              {period.fromExpiry ? <span className="block text-stone-500">{tr("تبدأ من نهاية الاشتراك الحالي، فلا تخسر الأيام المتبقية.")}</span> : null}
            </span>
          </div>
          {ONLINE_COMPANY_PAYMENT_VISIBLE && testMode && <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-700">{tr("وضع تجريبي: البطاقة ")}<span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
        </div>

        {!ONLINE_COMPANY_PAYMENT_VISIBLE && (leadSent ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-100">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <p className="mt-1 font-black text-emerald-800">{tr("تم إرسال طلبك")}</p>
            <p className="mt-1 text-sm text-emerald-700">{tr("سيتواصل معك فريق المبيعات قريباً، ويُفعَّل الاشتراك فور اعتماده من الإدارة.")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-600">{tr("بيانات التواصل مع المبيعات")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} placeholder={tr("الاسم *")} disabled={busy} className="cp-field text-start" />
              <input type="email" dir="ltr" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} placeholder={tr("البريد الإلكتروني *")} disabled={busy} className="cp-field text-start" />
              <input type="tel" dir="ltr" value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} placeholder={tr("رقم الجوال *")} disabled={busy} className="cp-field text-start" />
              <input type="tel" dir="ltr" value={lead.whatsapp} onChange={(event) => setLead({ ...lead, whatsapp: event.target.value })} placeholder={tr("واتساب (إن اختلف عن الجوال)")} disabled={busy} className="cp-field text-start" />
            </div>
          </div>
        ))}

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-11 rounded-xl border border-[#ece3d3] px-5 text-sm font-bold text-slate-700 transition hover:bg-stone-100">{leadSent ? tr("إغلاق") : tr("إلغاء")}</button>
          {!ONLINE_COMPANY_PAYMENT_VISIBLE && !leadSent && <button type="button" disabled={busy || !leadReady || !(quote.total > 0)} onClick={() => void sendToSales()} className={`cp-btn ${purpose === "upgrade" ? "is-trial" : ""} inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tr("إرسال للمبيعات")}
          </button>}
          {ONLINE_COMPANY_PAYMENT_VISIBLE && verificationReference && <button type="button" disabled={busy} onClick={() => void verify(verificationReference)} className="h-11 rounded-xl border border-[#ece3d3] px-4 text-sm font-bold text-slate-700 transition hover:bg-stone-100">{tr("إعادة التحقق دون إعادة الدفع")}</button>}
          {ONLINE_COMPANY_PAYMENT_VISIBLE && !verificationReference && <button type="button" disabled={busy || !(quote.total > 0)} onClick={() => void pay()} className={`cp-btn ${purpose === "upgrade" ? "is-trial" : ""} inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}{tr("الدفع عبر الانترنت")}
          </button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
