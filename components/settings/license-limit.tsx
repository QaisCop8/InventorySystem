"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Building2, CheckCircle2, Clock, CreditCard, Loader2, Monitor, Send, Users, UtensilsCrossed } from "lucide-react"
import { openLahzaPopup } from "@/lib/lahza-popup"
import { ONLINE_COMPANY_PAYMENT_VISIBLE } from "@/lib/company-pricing"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

export type LicenseResource = "users" | "branches" | "pos_points" | "restaurant_locations"
type License = { limits: Record<LicenseResource, number>; usage: Record<LicenseResource, number>; pending: Array<{ id: number; resource: LicenseResource; quantity: number; created_at: string }> }
export type LicenseLimitPayload = { code?: string; error?: string; resource?: LicenseResource; limit?: number; used?: number; pending_request_id?: number | null }

const LABELS: Record<LicenseResource, { plural: string; single: string; icon: typeof Users }> = {
  users: { plural: "المستخدمين", single: "مستخدم", icon: Users },
  branches: { plural: "الفروع", single: "فرع", icon: Building2 },
  pos_points: { plural: "نقاط البيع", single: "نقطة بيع", icon: Monitor },
  restaurant_locations: { plural: "مواقع المطاعم", single: "موقع مطعم", icon: UtensilsCrossed },
}

export function useCompanyLicense() {
  const [license, setLicense] = useState<License | null>(null)
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/license", { cache: "no-store" })
      const data = await response.json()
      if (response.ok) setLicense(data.license)
    } catch { /* بلا ترخيص = بلا قيود ظاهرة */ }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { license, reload }
}

/** شريط الاستخدام مقابل الحد المرخّص + زر طلب زيادة. لا يظهر شيئاً إن لم يكن للشركة ترخيص. */
export function LicenseUsageStrip({ resource, license, onRequest }: { resource: LicenseResource; license: License | null; onRequest: () => void }) {
  if (!license) return null
  const used = license.usage[resource], limit = license.limits[resource]
  const full = used >= limit
  const pending = license.pending.find((request) => request.resource === resource)
  const Icon = LABELS[resource].icon
  return (
    <div dir={appDir()} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm ${full ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <span className="flex items-center gap-1.5 font-semibold text-slate-700"><Icon className="h-4 w-4 text-emerald-600" />{LABELS[resource].plural}{tr(" المرخّص")}</span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${full ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%` }} /></div>
      <span className={`font-bold ${full ? "text-amber-700" : "text-slate-700"}`} dir="ltr">{used} / {limit}</span>
      {pending
        ? <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200"><Clock className="h-3 w-3" />{tr("طلب زيادة +")}{pending.quantity}{tr(" بانتظار الاعتماد")}</span>
        : <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRequest}><Send className="h-3.5 w-3.5" />{tr("طلب زيادة")}</Button>}
    </div>
  )
}

/** نافذة طلب زيادة الترخيص — تُفتح يدوياً أو تلقائياً عند رفض الحفظ لتجاوز الحد (code=LICENSE_LIMIT). */
export function useLicenseRequestDialog(onSent?: () => void) {
  const [state, setState] = useState<{ resource: LicenseResource; message?: string; pending?: boolean } | null>(null)
  const [quantity, setQuantity] = useState("1")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  // الدفع الإلكتروني (لحظة): السعر = العدد × سعر الوحدة السنوي؛ النجاح يرفع الحد فوراً بلا انتظار الاعتماد
  const [payInfo, setPayInfo] = useState<{ enabled: boolean; testMode?: boolean; currency?: string; prices?: Record<LicenseResource, number> } | null>(null)
  const [popupOpen, setPopupOpen] = useState(false)
  const [paid, setPaid] = useState(false)
  // بطاقة للمبيعات (والدفع الإلكتروني مخفي — ONLINE_COMPANY_PAYMENT_VISIBLE): رقم للتواصل مع الطلب
  const [contactPhone, setContactPhone] = useState("")
  const [contactWhatsapp, setContactWhatsapp] = useState("")
  const verificationInProgress = useRef(false)

  const open = (resource: LicenseResource, message?: string, pending = false) => {
    setState({ resource, message, pending }); setQuantity("1"); setReason(""); setError(""); setSent(false); setPaid(false); setContactPhone(""); setContactWhatsapp("")
    fetch("/api/license/payment", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setPayInfo(data)).catch(() => setPayInfo(null))
  }
  const unitPrice = state && payInfo?.enabled ? Number(payInfo.prices?.[state.resource] || 0) : 0
  const total = Math.round(unitPrice * (Number(quantity) || 0) * 100) / 100
  const canPay = ONLINE_COMPANY_PAYMENT_VISIBLE && Boolean(payInfo?.enabled && unitPrice > 0)
  const salesCard = !ONLINE_COMPANY_PAYMENT_VISIBLE

  const payOnline = async () => {
    if (!state) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/license/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: state.resource, quantity: Number(quantity), reason }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر بدء عملية الدفع"))
      // نافذة الحوار تُخفى أثناء نافذة الدفع (الحوار المشروط يمنع النقر خارجه) ثم تعود بالنتيجة
      setPopupOpen(true)
      await openLahzaPopup({
        publicKey: data.publicKey, email: data.email, firstName: data.fullName, amountMinor: data.amountMinor, currency: data.currency, reference: data.reference,
        metadata: { license_resource: state.resource, quantity: Number(quantity) },
        onSuccess: () => { setPopupOpen(false); void verifyPayment(data.reference) },
        onCancel: () => { setPopupOpen(false); void verifyPayment(data.reference, "تم إغلاق نافذة الدفع قبل إتمام العملية") },
      })
    } catch (e) {
      setPopupOpen(false); setBusy(false)
      setError(e instanceof Error ? e.message : tr("تعذّر بدء عملية الدفع"))
    }
  }
  // closedText: أُغلقت نافذة لحظة — قد يكون الدفع تم فعلاً (WebView أندرويد)، فيُتحقق بالخادم قبل عرض رسالة الإلغاء
  const verifyPayment = async (reference: string, closedText?: string) => {
    if (verificationInProgress.current) return
    verificationInProgress.current = true
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/license/payment/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || tr("تعذّر التحقق من الدفع"))
      if (data.status === "approved") { setPaid(true); onSent?.() }
      else setError(closedText || data.message || tr("لم تكتمل عملية الدفع"))
    } catch (e) {
      setError(closedText || (e instanceof Error ? e.message : tr("تعذّر التحقق من الدفع")))
    } finally {
      verificationInProgress.current = false
      setBusy(false)
    }
  }
  /** يعيد true إن كانت الاستجابة رفضاً بسبب الترخيص (وفُتحت النافذة)، ليتوقف المستدعي عن عرض خطأ عام. */
  const handleLimit = (payload: LicenseLimitPayload | null | undefined) => {
    if (payload?.code !== "LICENSE_LIMIT" || !payload.resource) return false
    open(payload.resource, payload.error, Boolean(payload.pending_request_id))
    return true
  }
  const submit = async () => {
    if (!state) return
    if (salesCard && !contactPhone.trim()) { setError(tr("أدخل رقم هاتف للتواصل")); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/license/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: state.resource, quantity: Number(quantity), reason, sales_card: salesCard, contact_phone: contactPhone.trim(), contact_whatsapp: contactWhatsapp.trim() }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || tr("تعذر إرسال الطلب")); return }
      setSent(true); onSent?.()
    } finally { setBusy(false) }
  }

  const label = state ? LABELS[state.resource] : LABELS.users
  const element = (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={!!state && !popupOpen} onOpenChange={(value) => { if (!value && !busy) setState(null) }}>
        <DialogContent className="z-[3001] flex w-[min(540px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0" dir={appDir()}>
          <div className="flex items-center gap-3 bg-gradient-to-l from-amber-500 to-orange-500 px-5 py-4 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><AlertTriangle className="h-5 w-5" /></span>
            <div className="text-start">
              <DialogTitle className="text-base font-bold">{tr("زيادة عدد ")}{label.plural}{tr(" المرخّص")}</DialogTitle>
              <DialogDescription className="text-xs text-amber-50">{canPay ? tr("ادفع إلكترونياً لتُضاف فوراً، أو أرسل طلباً لإدارة النظام") : salesCard ? tr("أرسل بطاقة لفريق المبيعات — نتواصل معك لإتمام الاشتراك وتُضاف فور الاعتماد") : tr("يُرسل الطلب لإدارة النظام للاعتماد أو الرفض")}</DialogDescription>
            </div>
          </div>
          <div className="min-w-0 space-y-3 p-5 text-sm">
            {state?.message && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{state.message}</p>}
            {paid ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5 shrink-0" />{tr("تم الدفع وزيادة عدد ")}{label.plural}{tr(" المرخّص بمقدار ")}{quantity}{tr(". يمكنك الإضافة الآن.")}</p>
            ) : sent ? (
              <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-700">{salesCard ? tr("تم إرسال البطاقة لفريق المبيعات. سنتواصل معك قريباً، وتستطيع الإضافة فور الاعتماد.") : tr("تم إرسال الطلب. ستتمكن من الإضافة فور اعتماده من إدارة النظام.")}</p>
            ) : state?.pending && !canPay ? (
              <p className="rounded-lg bg-sky-50 p-3 text-sky-800">{tr("يوجد طلب زيادة ")}{label.plural}{tr(" بانتظار الاعتماد بالفعل.")}</p>
            ) : (
              <>
                <label className="block text-slate-600">{tr("عدد ")}{label.plural}{tr(" الإضافي المطلوب")}
                  <input type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-3 py-1.5" />
                </label>
                <label className="block text-slate-600">{tr("سبب الطلب (اختياري)")}
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2" placeholder={tr("مثال: افتتاح {0} جديد", label.single)} />
                </label>
                {salesCard && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-slate-600">{tr("الهاتف *")}
                      <input type="tel" dir="ltr" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-start" placeholder="05xxxxxxxx" />
                    </label>
                    <label className="block text-slate-600">{tr("واتساب")}
                      <input type="tel" dir="ltr" value={contactWhatsapp} onChange={(event) => setContactWhatsapp(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-start" placeholder="+970" />
                    </label>
                  </div>
                )}
                {canPay && (
                  <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-600"><span>{tr("سعر ")}{label.single}{tr(" (سنوياً)")}</span><span className="tabular-nums" dir="ltr">{unitPrice.toFixed(2)} {payInfo?.currency}</span></div>
                    <div className="flex items-center justify-between font-bold text-emerald-800"><span>{tr("الإجمالي")}</span><span className="tabular-nums" dir="ltr">{total.toFixed(2)} {payInfo?.currency}</span></div>
                    {payInfo?.testMode && <p className="pt-1 text-[11px] text-amber-700">{tr("وضع تجريبي: البطاقة ")}<span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
                    {state?.pending && <p className="pt-1 text-[11px] text-sky-700">{tr("يوجد طلب بانتظار الاعتماد — الدفع الإلكتروني يضيف العدد فوراً دون انتظاره.")}</p>}
                  </div>
                )}
                {error && <p className="text-red-600">{error}</p>}
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3">
            <Button variant="outline" disabled={busy} onClick={() => setState(null)}>{tr("إغلاق")}</Button>
            {!sent && !paid && !state?.pending && <Button variant={canPay ? "outline" : "default"} disabled={busy || !(Number(quantity) >= 1)} onClick={() => void submit()} className={canPay ? "gap-1" : "gap-1 bg-amber-600 hover:bg-amber-700"}>{busy && !canPay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{canPay ? tr("إرسال طلب للاعتماد") : salesCard ? tr("إرسال بطاقة للمبيعات") : tr("إرسال الطلب")}</Button>}
            {!sent && !paid && canPay && <Button disabled={busy || !(Number(quantity) >= 1)} onClick={() => void payOnline()} className="gap-1 bg-emerald-600 hover:bg-emerald-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}{tr("الدفع عبر الانترنت")}</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
  return { open, handleLimit, element }
}
