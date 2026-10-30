"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, KeyRound, Loader2, Lock, Mail, MailCheck, RotateCw, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { installPermissionApprovalFetch, registerApprovalAsker, storeApprovalToken, type PermissionRequest } from "@/lib/permission-approval-client"

// نافذة "لا يوجد لديك صلاحية - اسم الصلاحية" للكاشير والمطعم (lib/permission-approval-client.ts يفتحها قبل الإجراء أو
// عند رفض الخادم ثم يعيد الطلب بعد الموافقة). طريقتان:
//  • البريد (F5): رمز تفعيل يُرسل لايميلي مدير النظام والمسؤول ثم يُدخله المستخدم.
//  • رمز المدير PIN (F6): مدير النظام/المسؤول يكتب رمزه الشخصي على هذه الشاشة مباشرة — لا رسائل يراها المستخدم.
// المفاتيح تُلتقط في مرحلة capture وتُوقف فلا تصل لاختصارات الكاشير (F5 = خصم الفاتورة) ولا لتحديث المتصفح.
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

  const openPin = () => {
    if (busy) return
    setMode("pin"); setError("")
    window.setTimeout(() => pinRef.current?.focus(), 30)
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

  // F5 = إرسال رمز بالبريد (أو إعادة الإرسال)، F6 = رمز المدير PIN — طالما النافذة مفتوحة
  const keysRef = useRef({ sendCode, openPin })
  keysRef.current = { sendCode, openPin }
  const open = Boolean(state)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F5" && event.key !== "F6") return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === "F5") void keysRef.current.sendCode()
      else keysRef.current.openPin()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open])

  const request = state?.request
  const placeLabel = request?.scope === "restaurant" ? "موقع المطعم" : "نقطة البيع"
  const Kbd = ({ children, light }: { children: string; light?: boolean }) => (
    <kbd className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none ${light ? "border-white/50 bg-white/15 text-white" : "border-slate-300 bg-white text-slate-600 shadow-[0_1px_0_#cbd5e1]"}`}>{children}</kbd>
  )
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) close(false) }}>
      <DialogContent
        dir="rtl"
        hideCloseButton
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="z-[3000] w-[calc(100vw-1.5rem)] max-w-lg gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-2xl ring-0"
      >
        {/* الرأس: القفل + اسم الصلاحية المطلوبة */}
        <div className="relative overflow-hidden bg-gradient-to-l from-amber-500 via-orange-500 to-rose-500 px-5 pb-5 pt-4 text-white">
          <div className="pointer-events-none absolute -left-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30"><Lock className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white/80">لا يوجد لديك صلاحية</p>
              <DialogTitle className="mt-0.5 text-lg font-black leading-snug">{request?.name}</DialogTitle>
              <p className="mt-1 text-xs text-white/85">تحتاج موافقة لمرة واحدة من مدير النظام أو المسؤول على {placeLabel}</p>
            </div>
            <button type="button" onClick={() => close(false)} disabled={busy} aria-label="إلغاء" className="rounded-full p-1.5 text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="space-y-3 p-4 text-sm sm:p-5">
          {request?.message && <p className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">{request.message}</p>}
          {request?.context?.max_percent !== undefined && <p className="rounded-xl bg-slate-100 p-3 text-center text-slate-700">الموافقة على خصم حتى <b dir="ltr" className="text-base">{request.context.max_percent}%</b> — أي زيادة بعدها تتطلب موافقة جديدة</p>}

          {mode === "choose" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={openPin} disabled={busy} className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-sky-200 bg-sky-50 p-4 text-start transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-lg disabled:opacity-50">
                <div className="flex w-full items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-600/30"><ShieldCheck className="h-5 w-5" /></span>
                  <Kbd>F6</Kbd>
                </div>
                <b className="text-base text-sky-900">رمز المدير (PIN)</b>
                <span className="text-xs leading-5 text-sky-800/80">يكتب المدير أو المسؤول رمزه الشخصي على هذه الشاشة الآن</span>
              </button>
              <button type="button" onClick={() => void sendCode()} disabled={busy} className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-start transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-lg disabled:opacity-50">
                <div className="flex w-full items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30"><Mail className="h-5 w-5" /></span>
                  <Kbd>F5</Kbd>
                </div>
                <b className="text-base text-amber-900">رمز تفعيل بالبريد</b>
                <span className="text-xs leading-5 text-amber-800/80">إرسال رمز للمدير ومسؤول النظام ثم إدخاله هنا</span>
              </button>
            </div>
          )}

          {mode === "pin" && (
            <div className="space-y-2 rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-4">
              <label className="flex items-center gap-2 text-sm font-bold text-sky-900"><ShieldCheck className="h-4 w-4" />رمز المدير (PIN)</label>
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
                  className="h-12 bg-white pr-9 text-center text-xl font-bold tracking-[0.5em]"
                />
              </div>
              <p className="text-xs text-sky-800/80">يكتبه مدير النظام أو المسؤول المعرّف على {placeLabel} ثم Enter</p>
            </div>
          )}

          {mode === "email" && (approvalId ? (
            <div className="space-y-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
              <p className="flex items-start gap-2 text-emerald-800">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>تم إرسال رمز التفعيل إلى: <span dir="ltr" className="font-semibold">{sentTo.join("، ")}</span></span>
              </p>
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
                  className="h-12 bg-white pr-9 text-center text-xl font-bold tracking-[0.5em]"
                />
              </div>
            </div>
          ) : busy ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-amber-50 p-5 text-amber-800"><Loader2 className="h-5 w-5 animate-spin" />جاري إرسال رمز التفعيل...</p>
          ) : null)}

          {error && <p className="rounded-xl bg-rose-50 p-3 text-rose-700 ring-1 ring-rose-200">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 border-t bg-slate-50 px-4 py-3">
          {mode === "pin" && (
            <>
              <Button onClick={() => void verifyPin()} disabled={busy || pin.length < 4} className="h-10 gap-1.5 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}موافقة ومتابعة <Kbd light>Enter</Kbd>
              </Button>
              <Button variant="outline" onClick={() => void sendCode()} disabled={busy} className="h-10 gap-1.5 rounded-xl"><Mail className="h-4 w-4" />بالبريد <Kbd>F5</Kbd></Button>
            </>
          )}
          {mode === "email" && approvalId && (
            <>
              <Button onClick={() => void verifyCode()} disabled={busy || code.length !== 6} className="h-10 gap-1.5 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}تحقق ومتابعة <Kbd light>Enter</Kbd>
              </Button>
              <Button variant="outline" onClick={() => void sendCode()} disabled={busy} className="h-10 gap-1.5 rounded-xl"><RotateCw className="h-4 w-4" />إعادة الإرسال <Kbd>F5</Kbd></Button>
              <Button variant="outline" onClick={openPin} disabled={busy} className="h-10 gap-1.5 rounded-xl"><ShieldCheck className="h-4 w-4" />PIN <Kbd>F6</Kbd></Button>
            </>
          )}
          {mode === "email" && !approvalId && !busy && (
            <Button variant="outline" onClick={() => void sendCode()} className="h-10 gap-1.5 rounded-xl"><RotateCw className="h-4 w-4" />إعادة المحاولة <Kbd>F5</Kbd></Button>
          )}
          {mode !== "choose" && (
            <Button variant="ghost" onClick={() => { setMode("choose"); setError("") }} disabled={busy} className="h-10 gap-1 rounded-xl text-slate-600"><ArrowRight className="h-4 w-4" />رجوع</Button>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={busy} className="h-10 gap-1.5 rounded-xl">إلغاء <Kbd>Esc</Kbd></Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
