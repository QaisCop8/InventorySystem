"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Building2, Clock, Loader2, Send, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { WorkspaceDialogProvider } from "@/contexts/workspace-dialog-context"

export type LicenseResource = "users" | "branches"
type License = { limits: Record<LicenseResource, number>; usage: Record<LicenseResource, number>; pending: Array<{ id: number; resource: LicenseResource; quantity: number; created_at: string }> }
export type LicenseLimitPayload = { code?: string; error?: string; resource?: LicenseResource; limit?: number; used?: number; pending_request_id?: number | null }

const LABELS: Record<LicenseResource, { plural: string; single: string; icon: typeof Users }> = {
  users: { plural: "المستخدمين", single: "مستخدم", icon: Users },
  branches: { plural: "الفروع", single: "فرع", icon: Building2 },
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

  const open = (resource: LicenseResource, message?: string, pending = false) => { setState({ resource, message, pending }); setQuantity("1"); setReason(""); setError(""); setSent(false) }
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
      <Dialog open={!!state} onOpenChange={(value) => { if (!value && !busy) setState(null) }}>
        <DialogContent className="z-[3001] w-[min(460px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden rounded-2xl p-0" dir="rtl">
          <div className="flex items-center gap-3 bg-gradient-to-l from-amber-500 to-orange-500 px-5 py-4 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><AlertTriangle className="h-5 w-5" /></span>
            <div className="text-right">
              <DialogTitle className="text-base font-bold">زيادة عدد {label.plural} المرخّص</DialogTitle>
              <DialogDescription className="text-xs text-amber-50">يُرسل الطلب لإدارة النظام للاعتماد أو الرفض</DialogDescription>
            </div>
          </div>
          <div className="space-y-3 p-5 text-sm">
            {state?.message && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{state.message}</p>}
            {sent ? (
              <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-700">تم إرسال الطلب. ستتمكن من الإضافة فور اعتماده من إدارة النظام.</p>
            ) : state?.pending ? (
              <p className="rounded-lg bg-sky-50 p-3 text-sky-800">يوجد طلب زيادة {label.plural} بانتظار الاعتماد بالفعل.</p>
            ) : (
              <>
                <label className="block text-slate-600">عدد {label.plural} الإضافي المطلوب
                  <input type="number" min={1} max={1000} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-1 block w-32 rounded-lg border border-slate-200 px-3 py-1.5" />
                </label>
                <label className="block text-slate-600">سبب الطلب (اختياري)
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2" placeholder={`مثال: افتتاح ${label.single} جديد`} />
                </label>
                {error && <p className="text-red-600">{error}</p>}
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
            <Button variant="outline" disabled={busy} onClick={() => setState(null)}>إغلاق</Button>
            {!sent && !state?.pending && <Button disabled={busy || !(Number(quantity) >= 1)} onClick={() => void submit()} className="gap-1 bg-amber-600 hover:bg-amber-700">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}إرسال الطلب</Button>}
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceDialogProvider>
  )
  return { open, handleLimit, element }
}
