"use client"

import { useMemo, useState } from "react"
import { CalendarClock, CreditCard, Loader2, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { priceFor, type Pricing } from "@/lib/company-pricing"
import { openLahzaPopup } from "@/lib/lahza-popup"

// نافذة الدفع لتجديد الاشتراك (شركة حقيقية بقي عليها أقل من شهر أو انتهت) أو تحويل نسخة تجريبية إلى حقيقية.
// المدة سنة تبدأ من نهاية الاشتراك الحالي إن لم ينتهِ، وإلا من اليوم — نفس حساب الخادم (company-billing.ts).
// تستخدم أنماط cp-* المعرّفة في صفحة "شركاتي".

export type SubscriptionCompany = {
  id: number
  name: string
  expiry_date?: string | null
  number_of_users: number
  number_of_branches: number
  number_of_pos_points: number
  number_of_restaurant_locations?: number
}

const formatDate = (date: Date) => date.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })

export function SubscriptionDialog({ company, purpose, pricing, testMode, onClose, onDone }: {
  company: SubscriptionCompany
  purpose: "renewal" | "upgrade"
  pricing: Pricing
  testMode: boolean
  onClose: () => void
  onDone: (expiryDate: string | null) => void
}) {
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

  const verify = async (reference: string) => {
    setBusy(true)
    setError("")
    setVerificationReference(reference)
    try {
      const response = await fetch("/api/management/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذّر التحقق من الدفع")
      if (data.status === "approved") { setVerificationReference(""); onDone(data.expiryDate || null) }
      else setError(data.message || "لم تكتمل عملية الدفع")
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحقق من الدفع")
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
      if (!response.ok) throw new Error(data.error || "تعذّر بدء عملية الدفع")
      // الحوار يُخفى أثناء نافذة لحظة (الحوار المشروط يمنع النقر خارجه) ثم يعود بالنتيجة
      setPopupOpen(true)
      await openLahzaPopup({
        publicKey: data.publicKey, email: data.email, firstName: data.fullName, amountMinor: data.amountMinor, currency: data.currency, reference: data.reference,
        metadata: { company_id: company.id, purpose },
        onSuccess: () => { setPopupOpen(false); void verify(data.reference) },
        onCancel: () => { setPopupOpen(false); setBusy(false); setError("تم إغلاق نافذة الدفع قبل إتمام العملية") },
      })
    } catch (e) {
      setPopupOpen(false)
      setBusy(false)
      setError(e instanceof Error ? e.message : "تعذّر بدء عملية الدفع")
    }
  }

  const editable = purpose === "upgrade"
  const field = (label: string, value: string, set: (value: string) => void, min: number) => (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-300">{label}</label>
      <input type="number" min={min} value={value} disabled={!editable || busy} onChange={(event) => set(event.target.value)} className="cp-field text-right tabular-nums disabled:opacity-60" />
    </div>
  )

  return (
    <Dialog open={!popupOpen} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent dir="rtl" className="cp-dialog max-w-lg">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-xl font-black text-white">
            {purpose === "upgrade" ? <Sparkles className="h-5 w-5 text-violet-300" /> : <CalendarClock className="h-5 w-5 text-emerald-300" />}
            {purpose === "upgrade" ? "التحويل إلى نسخة حقيقية" : "تمديد الاشتراك"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {company.name} — {purpose === "upgrade" ? "اختر الترخيص المطلوب وادفع الاشتراك السنوي، وتبقى كل بياناتك كما هي." : "اشتراك سنة جديدة بنفس الترخيص الحالي."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field("عدد المستخدمين", users, setUsers, 1)}
          {field("عدد الفروع", branches, setBranches, 1)}
          {field("عدد نقاط البيع", posPoints, setPosPoints, 0)}
          {field("مواقع المطاعم", restaurants, setRestaurants, 0)}
        </div>

        <div className="space-y-2 rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4">
          {quote.lines.filter((line) => line.amount > 0).map((line) => (
            <div key={line.label} className="flex justify-between text-xs text-slate-300"><span>{line.label}</span><span className="tabular-nums" dir="ltr">{line.amount.toFixed(2)}</span></div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2 text-base font-black"><span>الإجمالي</span><span className="tabular-nums text-emerald-300" dir="ltr">{quote.total.toFixed(2)} {quote.currency}</span></div>
          <div className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs leading-6 text-slate-200">
            <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
            <span>
              مدة الاشتراك الجديد: من <b>{formatDate(period.start)}</b> إلى <b>{formatDate(period.end)}</b>
              {period.fromExpiry ? <span className="block text-slate-400">تبدأ من نهاية الاشتراك الحالي، فلا تخسر الأيام المتبقية.</span> : null}
            </span>
          </div>
          {testMode && <p className="rounded-lg bg-amber-400/10 px-2 py-1.5 text-[11px] leading-5 text-amber-200">وضع تجريبي: البطاقة <span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
        </div>

        {error && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-11 rounded-xl border border-white/15 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/10">إلغاء</button>
          {verificationReference && <button type="button" disabled={busy} onClick={() => void verify(verificationReference)} className="h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-slate-200 transition hover:bg-white/10">إعادة التحقق دون إعادة الدفع</button>}
          {!verificationReference && <button type="button" disabled={busy || !(quote.total > 0)} onClick={() => void pay()} className={`cp-btn ${purpose === "upgrade" ? "is-trial" : ""} inline-flex h-11 items-center justify-center gap-2 px-6 text-sm font-black text-white`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}الدفع عبر الانترنت
          </button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
