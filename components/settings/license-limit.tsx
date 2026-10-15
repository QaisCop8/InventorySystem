"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Building2, CheckCircle2, Clock, CreditCard, Loader2, Monitor, Send, Users } from "lucide-react"
import { openLahzaPopup } from "@/lib/lahza-popup"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

export type LicenseResource = "users" | "branches" | "pos_points"
type License = { limits: Record<LicenseResource, number>; usage: Record<LicenseResource, number>; pending: Array<{ id: number; resource: LicenseResource; quantity: number; created_at: string }> }
export type LicenseLimitPayload = { code?: string; error?: string; resource?: LicenseResource; limit?: number; used?: number; pending_request_id?: number | null }

const LABELS: Record<LicenseResource, { plural: string; single: string; icon: typeof Users }> = {
  users: { plural: "المستخدمين", single: "مستخدم", icon: Users },
  branches: { plural: "الفروع", single: "فرع", icon: Building2 },
  pos_points: { plural: "نقاط البيع", single: "نقطة بيع", icon: Monitor },
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
    <div dir="rtl" className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm ${full ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <span className="flex items-center gap-1.5 font-semibold text-slate-700"><Icon className="h-4 w-4 text-emerald-600" />{LABELS[resource].plural} المرخّص</span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${full ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, (used / Math.max(limit, 1)) * 100)}%` }} /></div>
      <span className={`font-bold ${full ? "text-amber-700" : "text-slate-700"}`} dir="ltr">{used} / {limit}</span>
      {pending
        ? <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-sky-200"><Clock className="h-3 w-3" />طلب زيادة +{pending.quantity} بانتظار الاعتماد</span>
        : <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRequest}><Send className="h-3.5 w-3.5" />طلب زيادة</Button>}
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

  const open = (resource: LicenseResource, message?: string, pending = false) => {
    setState({ resource, message, pending }); setQuantity("1"); setReason(""); setError(""); setSent(false); setPaid(false)
    fetch("/api/license/payment", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setPayInfo(data)).catch(() => setPayInfo(null))
  }
  const unitPrice = state && payInfo?.enabled ? Number(payInfo.prices?.[state.resource] || 0) : 0
  const total = Math.round(unitPrice * (Number(quantity) || 0) * 100) / 100
  const canPay = Boolean(payInfo?.enabled && unitPrice > 0)

  const payOnline = async () => {
    if (!state) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/license/payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: state.resource, quantity: Number(quantity), reason }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذّر بدء عملية الدفع")
      // نافذة الحوار تُخفى أثناء نافذة الدفع (الحوار المشروط يمنع النقر خارجه) ثم تعود بالنتيجة
      setPopupOpen(true)
      await openLahzaPopup({
        publicKey: data.publicKey, email: data.email, firstName: data.fullName, amountMinor: data.amountMinor, currency: data.currency, reference: data.reference,
        metadata: { license_resource: state.resource, quantity: Number(quantity) },
        onSuccess: () => { setPopupOpen(false); void verifyPayment(data.reference) },
        onCancel: () => { setPopupOpen(false); setBusy(false); setError("تم إغلاق نافذة الدفع قبل إتمام العملية") },
      })
    } catch (e) {
      setPopupOpen(false); setBusy(false)
      setError(e instanceof Error ? e.message : "تعذّر بدء عملية الدفع")
    }
  }
  const verifyPayment = async (reference: string) => {
    setBusy(true)
    try {
      const response = await fetch("/api/license/payment/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذّر التحقق من الدفع")
      if (data.status === "approved") { setPaid(true); onSent?.() }
      else setError(data.message || "لم تكتمل عملية الدفع")
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحقق من الدفع")
    } finally {
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
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/license/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resource: state.resource, quantity: Number(quantity), reason }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) { setError(data.error || "تعذر إرسال الطلب"); return }
      setSent(true); onSent?.()
    } finally { setBusy(false) }
  }

  const label = state ? LABELS[state.resource] : LABELS.users
  const element = (
    <WorkspaceDialogProvider container={null} confined={false}>
      <Dialog open={!!state && !popupOpen} onOpenChange={(value) => { if (!value && !busy) setState(null) }}>
        <DialogContent className="z-[3001] w-[min(460px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
          <div className="flex items-center gap-3 bg-gradient-to-l from-amber-500 to-orange-500 px-5 py-4 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><AlertTriangle className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">زيادة عدد {label.plural} المرخّص</DialogTitle>
              <DialogDescription className="text-xs text-amber-50">{canPay ? "ادفع إلكترونياً لتُضاف فوراً، أو أرسل طلباً لإدارة النظام" : "يُرسل الطلب لإدارة النظام للاعتماد أو الرفض"}</DialogDescription>
            </div>
          </div>
          <div className="space-y-3 p-5 text-sm">
            {state?.message && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{state.message}</p>}
            {paid ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-700"><CheckCircle2 className="h-5 w-5 shrink-0" />تم الدفع وزيادة عدد {label.plural} المرخّص بمقدار {quantity}. يمكنك الإضافة الآن.</p>
            ) : sent ? (
              <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-700">تم إرسال الطلب. ستتمكن من الإضافة فور اعتماده من إدارة النظام.</p>
            ) : state?.pending && !canPay ? (
              <p className="rounded-lg bg-sky-50 p-3 text-sky-800">يوجد طلب زيادة {label.plural} بانتظار الاعتماد بالفعل.</p>
            ) : (
              <>
                <label className="block text-slate-600">عدد {label.plural} الإضافي المطلوب
                  <input type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-3 py-1.5" />
                </label>
                <label className="block text-slate-600">سبب الطلب (اختياري)
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2" placeholder={`مثال: افتتاح ${label.single} جديد`} />
                </label>
                {canPay && (
                  <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-600"><span>سعر {label.single} (سنوياً)</span><span className="tabular-nums" dir="ltr">{unitPrice.toFixed(2)} {payInfo?.currency}</span></div>
                    <div className="flex items-center justify-between font-bold text-emerald-800"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{total.toFixed(2)} {payInfo?.currency}</span></div>
                    {payInfo?.testMode && <p className="pt-1 text-[11px] text-amber-700">وضع تجريبي: البطاقة <span dir="ltr" className="font-mono">4111 1111 1111 1111</span> — <span dir="ltr" className="font-mono">03/30</span> — CVV <span dir="ltr" className="font-mono">004</span></p>}
                    {state?.pending && <p className="pt-1 text-[11px] text-sky-700">يوجد طلب بانتظار الاعتماد — الدفع الإلكتروني يضيف العدد فوراً دون انتظاره.</p>}
                  </div>
                )}
                {error && <p className="text-red-600">{error}</p>}
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
            <Button variant="outline" disabled={busy} onClick={() => setState(null)}>إغلاق</Button>
            {!sent && !paid && !state?.pending && <Button variant={canPay ? "outline" : "default"} disabled={busy || !(Number(quantity) >= 1)} onClick={() => void submit()} className={canPay ? "gap-1" : "gap-1 bg-amber-600 hover:bg-amber-700"}>{busy && !canPay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{canPay ? "إرسال طلب للاعتماد" : "إرسال الطلب"}</Button>}
            {!sent && !paid && canPay && <Button disabled={busy || !(Number(quantity) >= 1)} onClick={() => void payOnline()} className="gap-1 bg-emerald-600 hover:bg-emerald-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}الدفع عبر الانترنت ({total.toFixed(2)} {payInfo?.currency})</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
  return { open, handleLimit, element }
}
