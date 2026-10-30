"use client"

import { useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, Lock, MailCheck, Send, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { installPermissionApprovalFetch, registerApprovalAsker, storeApprovalToken, type PermissionRequest } from "@/lib/permission-approval-client"

// نافذة "لا يوجد لديك صلاحية - اسم الصلاحية" للكاشير والمطعم (lib/permission-approval-client.ts يفتحها قبل الإجراء أو
// عند رفض الخادم ثم يعيد الطلب بعد الموافقة). طريقتان:
//  • البريد: رمز تفعيل يُرسل لايميلي مدير النظام والمسؤول ثم يُدخله المستخدم.
//  • رمز المدير (PIN): مدير النظام/المسؤول يكتب رمزه الشخصي على هذه الشاشة مباشرة — لا رسائل يراها المستخدم.
type State = { request: PermissionRequest; resolve: (approved: boolean) => void }
type Mode = "choose" | "email" | "pin"

export function PermissionApprovalHost() {
  const [state, setState] = useState<State | null>(null)
  const [mode, setMode] = useState<Mode>("choose")
  const [approvalId, setApprovalId] = useState<number | null>(null)
  const [sentTo, setSentTo] = useState<string[]>([])
  const [code, setCode] = useState("")
  const [pin, setPin] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const codeRef = useRef<HTMLInputElement | null>(null)
  const pinRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    installPermissionApprovalFetch()
    return registerApprovalAsker((request) => new Promise<boolean>((resolve) => {
      setMode("choose"); setApprovalId(null); setSentTo([]); setCode(""); setPin(""); setError(""); setBusy(false)
      setState({ request, resolve })
    }))
  }, [])

  useEffect(() => {
    if (mode === "email" && approvalId) window.setTimeout(() => codeRef.current?.focus(), 60)
    if (mode === "pin") window.setTimeout(() => pinRef.current?.focus(), 60)
  }, [mode, approvalId])

  const close = (approved: boolean) => {
    state?.resolve(approved)
    setState(null)
  }

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/permission-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || "تعذر تنفيذ الطلب")
    return data
  }

  const sendCode = async () => {
    if (!state || busy) return
    if (!state.request.scopeId) { setError("تعذر تحديد نقطة البيع/الموقع لإرسال الرمز"); return }
    setMode("email"); setBusy(true); setError("")
    try {
      const data = await post({ action: "request", scope: state.request.scope, scope_id: state.request.scopeId, permission: state.request.key, context: state.request.context ?? null })
      setApprovalId(Number(data.id)); setSentTo(Array.isArray(data.sent_to) ? data.sent_to : []); setCode("")
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "تعذر إرسال رمز التفعيل")
    } finally {
      setBusy(false)
    }
  }

  const finish = (data: any) => {
    if (!state) return
    storeApprovalToken(state.request.scope, state.request.key, String(data.token), Number(data.minutes) || 10)
    close(true)
  }

  const verifyCode = async () => {
    if (!state || !approvalId || busy) return
    if (!/^\d{6}$/.test(code.trim())) { setError("أدخل رمز التفعيل المكوّن من 6 أرقام"); return }
    setBusy(true); setError("")
    try {
      finish(await post({ action: "verify", id: approvalId, code: code.trim() }))
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "رمز التفعيل غير صحيح")
      codeRef.current?.select()
    } finally {
      setBusy(false)
    }
  }

  const verifyPin = async () => {
    if (!state || busy) return
    if (!state.request.scopeId) { setError("تعذر تحديد نقطة البيع/الموقع"); return }
    if (!/^\d{4,8}$/.test(pin)) { setError("رمز المدير من 4 إلى 8 أرقام"); return }
    setBusy(true); setError("")
    try {
      finish(await post({ action: "pin", scope: state.request.scope, scope_id: state.request.scopeId, permission: state.request.key, pin, context: state.request.context ?? null }))
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "رمز المدير غير صحيح")
      setPin("")
      pinRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const request = state?.request
  const placeLabel = request?.scope === "restaurant" ? "موقع المطعم" : "نقطة البيع"
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) close(false) }}>
      <DialogContent
        dir="rtl"
        hideCloseButton
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="z-[3000] w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-0 p-0 ring-0"
      >
        <div className="flex items-center gap-3 bg-gradient-to-l from-amber-500 to-orange-500 px-4 py-3 text-white">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><Lock className="h-5 w-5" /></div>
          <DialogTitle className="min-w-0 text-base font-bold leading-snug">لا يوجد لديك صلاحية - {request?.name}</DialogTitle>
        </div>
        <div className="space-y-3 p-4 text-sm">
          {request?.message && <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900 ring-1 ring-amber-200">{request.message}</p>}
          {request?.context?.max_percent !== undefined && <p className="rounded-lg bg-slate-100 p-2.5 text-center text-slate-700">الموافقة على خصم حتى <b dir="ltr" className="text-base">{request.context.max_percent}%</b> — أي زيادة بعدها تتطلب موافقة جديدة</p>}

          {mode === "choose" && (
            <p className="text-slate-600">موافقة لمرة واحدة: إما أن يكتب مدير النظام أو المسؤول <b>رمز PIN</b> الخاص به على هذه الشاشة، أو يُرسل <b>رمز تفعيل بالبريد</b> لهما المعرّفين على {placeLabel}.</p>
          )}

          {mode === "pin" && (
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg bg-sky-50 p-2.5 text-sky-800 ring-1 ring-sky-200">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>يكتب مدير النظام أو المسؤول رمز PIN الخاص به (المعرّف على {placeLabel}).</span>
              </p>
              <label className="block text-xs font-semibold text-slate-600">رمز المدير (PIN)</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={pinRef}
                  type="password"
                  value={pin}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  dir="ltr"
                  placeholder="••••"
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void verifyPin() } }}
                  className="h-11 pr-9 text-center text-lg font-bold tracking-[0.5em]"
                />
              </div>
            </div>
          )}

          {mode === "email" && (approvalId ? (
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-emerald-800 ring-1 ring-emerald-200">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>تم إرسال رمز التفعيل بالبريد إلى: <span dir="ltr" className="font-semibold">{sentTo.join("، ")}</span></span>
              </p>
              <label className="block text-xs font-semibold text-slate-600">رمز التفعيل</label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={codeRef}
                  value={code}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  dir="ltr"
                  placeholder="______"
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void verifyCode() } }}
                  className="h-11 pr-9 text-center text-lg font-bold tracking-[0.5em]"
                />
              </div>
            </div>
          ) : busy ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />جاري إرسال رمز التفعيل...</p>
          ) : null)}

          {error && <p className="rounded-lg bg-rose-50 p-2.5 text-rose-700 ring-1 ring-rose-200">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-2 border-t bg-slate-50 px-4 py-3">
          {mode === "choose" && (
            <>
              <Button onClick={() => { setMode("pin"); setError("") }} disabled={busy} className="gap-1 bg-sky-600 text-white hover:bg-sky-700">
                <ShieldCheck className="h-4 w-4" />رمز المدير (PIN)
              </Button>
              <Button onClick={() => void sendCode()} disabled={busy} className="gap-1 bg-amber-600 text-white hover:bg-amber-700">
                <Send className="h-4 w-4" />ارسال رمز تفعيل للمدير ومسؤول النظام
              </Button>
            </>
          )}
          {mode === "pin" && (
            <>
              <Button onClick={() => void verifyPin()} disabled={busy || pin.length < 4} className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}موافقة ومتابعة
              </Button>
              <Button variant="outline" onClick={() => void sendCode()} disabled={busy}>إرسال رمز بالبريد بدلاً من ذلك</Button>
            </>
          )}
          {mode === "email" && approvalId && (
            <>
              <Button onClick={() => void verifyCode()} disabled={busy || code.length !== 6} className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}تحقق ومتابعة
              </Button>
              <Button variant="outline" onClick={() => void sendCode()} disabled={busy}>إعادة الإرسال</Button>
              <Button variant="outline" onClick={() => { setMode("pin"); setError("") }} disabled={busy}>رمز المدير (PIN)</Button>
            </>
          )}
          {mode === "email" && !approvalId && !busy && (
            <Button variant="outline" onClick={() => void sendCode()}>إعادة المحاولة</Button>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
