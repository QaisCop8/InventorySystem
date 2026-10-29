"use client"

import { useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, Lock, MailCheck, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { installPermissionApprovalFetch, registerApprovalAsker, storeApprovalToken, type PermissionRequest } from "@/lib/permission-approval-client"

// نافذة "لا يوجد لديك صلاحية - اسم الصلاحية" للكاشير والمطعم: إرسال رمز تفعيل لايميلي مدير النظام والمسؤول ثم إدخاله
// (lib/permission-approval-client.ts يفتحها عند رفض الخادم ويعيد الطلب بعد التحقق).
type State = { request: PermissionRequest; resolve: (approved: boolean) => void }

export function PermissionApprovalHost() {
  const [state, setState] = useState<State | null>(null)
  const [approvalId, setApprovalId] = useState<number | null>(null)
  const [sentTo, setSentTo] = useState<string[]>([])
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const codeRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    installPermissionApprovalFetch()
    return registerApprovalAsker((request) => new Promise<boolean>((resolve) => {
      setApprovalId(null); setSentTo([]); setCode(""); setError(""); setBusy(false)
      setState({ request, resolve })
    }))
  }, [])

  useEffect(() => {
    if (approvalId) window.setTimeout(() => codeRef.current?.focus(), 60)
  }, [approvalId])

  const close = (approved: boolean) => {
    state?.resolve(approved)
    setState(null)
  }

  const sendCode = async () => {
    if (!state || busy) return
    if (!state.request.scopeId) { setError("تعذر تحديد نقطة البيع/الموقع لإرسال الرمز"); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/permission-approvals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", scope: state.request.scope, scope_id: state.request.scopeId, permission: state.request.key }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "تعذر إرسال رمز التفعيل")
      setApprovalId(Number(data.id)); setSentTo(Array.isArray(data.sent_to) ? data.sent_to : []); setCode("")
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "تعذر إرسال رمز التفعيل")
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!state || !approvalId || busy) return
    if (!/^\d{6}$/.test(code.trim())) { setError("أدخل رمز التفعيل المكوّن من 6 أرقام"); return }
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/permission-approvals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", id: approvalId, code: code.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "رمز التفعيل غير صحيح")
      storeApprovalToken(state.request.scope, state.request.key, String(data.token), Number(data.minutes) || 10)
      close(true)
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "رمز التفعيل غير صحيح")
      codeRef.current?.select()
    } finally {
      setBusy(false)
    }
  }

  const request = state?.request
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
          {!approvalId ? (
            <p className="text-slate-600">يمكنك طلب موافقة لمرة واحدة: يُرسل رمز تفعيل إلى ايميل مدير النظام وايميل المسؤول المعرّفين على {request?.scope === "restaurant" ? "موقع المطعم" : "نقطة البيع"}، ثم تُدخل الرمز للمتابعة.</p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-2.5 text-emerald-800 ring-1 ring-emerald-200">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>تم إرسال رمز التفعيل إلى: <span dir="ltr" className="font-semibold">{sentTo.join("، ")}</span></span>
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
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void verify() } }}
                  className="h-11 pr-9 text-center text-lg font-bold tracking-[0.5em]"
                />
              </div>
            </div>
          )}
          {error && <p className="rounded-lg bg-rose-50 p-2.5 text-rose-700 ring-1 ring-rose-200">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-4 py-3">
          {!approvalId ? (
            <Button onClick={() => void sendCode()} disabled={busy} className="gap-1 bg-amber-600 text-white hover:bg-amber-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ارسال رمز تفعيل للمدير ومسؤول النظام
            </Button>
          ) : (
            <>
              <Button onClick={() => void verify()} disabled={busy || code.length !== 6} className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}تحقق ومتابعة
              </Button>
              <Button variant="outline" onClick={() => void sendCode()} disabled={busy}>إعادة الإرسال</Button>
            </>
          )}
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
