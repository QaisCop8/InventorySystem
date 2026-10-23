"use client"

import { useEffect, useState, type FormEvent } from "react"
import { CheckCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={shown ? "text" : "password"} autoComplete={autoComplete} autoFocus={autoFocus} className="h-11 pl-11" value={value} onChange={(event) => onChange(event.target.value)} required />
        <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShown((current) => !current)} aria-label={shown ? "إخفاء" : "إظهار"}>
          {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}

/** تغيير كلمة المرور من بوابة الإدارة: الحالية + الجديدة + التأكيد → api/management/auth/change-password.
 *  مع target (مسؤول الموقع → تبويب المستخدمين): بدون كلمة المرور الحالية → api/management/admin/users/[id]/password */
export function ChangePasswordDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (open: boolean) => void; target?: { id: number; full_name: string; email: string } | null }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setCurrent(""); setNext(""); setConfirm(""); setError(""); setDone(false)
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (next.length < 6) { setError("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"); return }
    if (next !== confirm) { setError("كلمة المرور الجديدة وتأكيدها غير متطابقتين"); return }
    setBusy(true)
    try {
      const response = await fetch(target ? `/api/management/admin/users/${target.id}/password` : "/api/management/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target ? { new_password: next } : { current_password: current, new_password: next }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "تعذّر تغيير كلمة المرور")
      setDone(true)
      window.setTimeout(() => onOpenChange(false), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تغيير كلمة المرور")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value) }}>
      <DialogContent dir="rtl" className="w-[calc(100vw-2rem)] max-w-md" onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-emerald-600" />{target ? `تعيين كلمة مرور: ${target.full_name}` : "تغيير كلمة المرور"}</DialogTitle>
          <DialogDescription>{target
            ? <>تعيين كلمة مرور جديدة للمستخدم <span dir="ltr" className="font-semibold">{target.email}</span> بدون كلمة المرور القديمة — تُطبَّق في كل شركاته وتُنهى جميع جلساته.</>
            : "تُطبَّق كلمة المرور الجديدة على حسابك في كل الشركات، وتُنهى جلساتك على الأجهزة الأخرى."}</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-2 py-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
            <p className="font-bold text-emerald-700">تم تغيير كلمة المرور بنجاح</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-700">{error}</p>}
            {!target && <PasswordField id="mgmt-current-password" label="كلمة المرور الحالية" value={current} onChange={(value) => { setCurrent(value); setError("") }} autoComplete="current-password" autoFocus />}
            <PasswordField id="mgmt-new-password" label="كلمة المرور الجديدة" value={next} onChange={(value) => { setNext(value); setError("") }} autoComplete="new-password" autoFocus={Boolean(target)} />
            <div>
              <PasswordField id="mgmt-confirm-password" label="تأكيد كلمة المرور الجديدة" value={confirm} onChange={(value) => { setConfirm(value); setError("") }} autoComplete="new-password" />
              {confirm && confirm !== next && <p className="mt-1 text-xs text-red-600">غير مطابقة لكلمة المرور الجديدة</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={busy}>
                {busy ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الحفظ...</> : "حفظ كلمة المرور"}
              </Button>
              <Button type="button" variant="outline" className="h-11" disabled={busy} onClick={() => onOpenChange(false)}>إلغاء</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
