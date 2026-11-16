"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Delete, KeyRound, Loader2, Lock, MonitorSmartphone, UserRound, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// واجهة النادل (2026-11-16): لوحة أرقام PIN، شاشة قفل الجهاز المشترك، تعيين الرمز الشخصي، اختيار النادل لتحويل الطاولة.

/** لوحة أرقام كبيرة للمس — 4 إلى 6 أرقام، الإدخال يُرسل تلقائياً عند الضغط على «دخول» */
export function PinPad({ busy, error, onSubmit, submitLabel }: { busy: boolean; error: string; onSubmit: (pin: string) => void; submitLabel: string }) {
  const [pin, setPin] = useState("")
  useEffect(() => { if (error) setPin("") }, [error])
  const press = (digit: string) => setPin((value) => (value.length < 6 ? value + digit : value))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key)
      else if (event.key === "Backspace") setPin((value) => value.slice(0, -1))
      else if (event.key === "Enter" && pin.length >= 4 && !busy) onSubmit(pin)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pin, busy, onSubmit])
  return (
    <div className="mx-auto w-full max-w-xs space-y-3" dir="ltr">
      <div className="flex justify-center gap-2.5 py-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} className={`h-3.5 w-3.5 rounded-full border-2 ${index < pin.length ? "border-rose-600 bg-rose-600" : index < 4 ? "border-slate-400" : "border-slate-200 dark:border-slate-700"}`} />
        ))}
      </div>
      {error && <p className="text-center text-sm font-semibold text-red-600" dir={appDir()}>{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <Button key={digit} type="button" variant="outline" className="h-14 text-2xl font-black" disabled={busy} onClick={() => press(digit)}>{digit}</Button>
        ))}
        <Button type="button" variant="ghost" className="h-14" disabled={busy || !pin} onClick={() => setPin((value) => value.slice(0, -1))}><Delete className="h-6 w-6" /></Button>
        <Button type="button" variant="outline" className="h-14 text-2xl font-black" disabled={busy} onClick={() => press("0")}>0</Button>
        <Button type="button" className="h-14 bg-rose-600 text-base font-extrabold hover:bg-rose-700" disabled={busy || pin.length < 4} onClick={() => onSubmit(pin)}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </div>
  )
}

/** شاشة قفل الجهاز المشترك: لا يعمل أحد على المطعم قبل إدخال رمزه */
export function WaiterLockScreen({ busy, error, onPin, onLeaveShared }: { busy: boolean; error: string; onPin: (pin: string) => void; onLeaveShared: () => void }) {
  return (
    <div dir={appDir()} className="flex h-full min-h-0 flex-col items-center justify-center gap-5 bg-gradient-to-b from-rose-50 to-background p-4 dark:from-rose-950/20">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 text-white shadow-lg"><UtensilsCrossed className="h-7 w-7" /></span>
        <h1 className="text-xl font-black">{tr("شاشة المطعم مقفلة")}</h1>
        <p className="text-sm text-muted-foreground">{tr("أدخل رمز PIN الخاص بك للمتابعة")}</p>
      </div>
      <PinPad busy={busy} error={error} onSubmit={onPin} submitLabel={tr("دخول")} />
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onLeaveShared}>
        <MonitorSmartphone className="me-1 inline h-3.5 w-3.5" />{tr("إلغاء وضع الجهاز المشترك على هذا الجهاز")}
      </button>
    </div>
  )
}

/** أزرار رأس لوحة الطاولات: المستخدم الفعلي، تبديل النادل برمز، الرمز الشخصي، القفل */
export function WaiterHeaderControls(p: { name: string; switched: boolean; shared: boolean; onSwitch: () => void; onSetPin: () => void; onLock: () => void; onToggleShared: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-bold ${p.switched ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-muted"}`}>
        <UserRound className="h-4 w-4" />{p.name || "—"}
      </span>
      <Button variant="outline" className="h-10" onClick={p.onSwitch} title={tr("تبديل النادل برمز PIN")}><KeyRound className="me-1 h-4 w-4" />{tr("تبديل")}</Button>
      {(p.switched || p.shared) && <Button variant="outline" className="h-10" onClick={p.onLock} title={tr("إنهاء جلسة النادل")}><Lock className="me-1 h-4 w-4" />{tr("قفل")}</Button>}
      <Button variant="ghost" className="h-10 px-2 text-xs" onClick={p.onSetPin}>{tr("رمزي")}</Button>
      <Button variant="ghost" className={`h-10 px-2 text-xs ${p.shared ? "text-rose-700" : ""}`} onClick={p.onToggleShared} title={tr("جهاز مشترك: يُقفل بعد دقيقتين بلا استخدام ويطلب رمز النادل")}>
        <MonitorSmartphone className="me-1 h-4 w-4" />{p.shared ? tr("جهاز مشترك ✓") : tr("جهاز مشترك")}
      </Button>
    </div>
  )
}

/** تبديل النادل برمز PIN (نافذة) */
export function SwitchWaiterDialog({ open, onOpenChange, busy, error, onPin }: { open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; error: string; onPin: (pin: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("تبديل النادل")}</DialogTitle>
          <DialogDescription>{tr("أدخل رمز PIN للنادل — تُنفَّذ العمليات باسمه وصلاحياته على هذا الجهاز")}</DialogDescription>
        </DialogHeader>
        {open && <PinPad busy={busy} error={error} onSubmit={onPin} submitLabel={tr("دخول")} />}
      </DialogContent>
    </Dialog>
  )
}

/** تعيين/تغيير/حذف رمز PIN الشخصي للمستخدم الفعلي */
export function SetPinDialog({ open, onOpenChange, hasPin, busy, error, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; hasPin: boolean; busy: boolean; error: string; onSave: (pin: string) => void }) {
  const [pin, setPin] = useState("")
  const [confirm, setConfirm] = useState("")
  useEffect(() => { if (open) { setPin(""); setConfirm("") } }, [open])
  const valid = /^\d{4,6}$/.test(pin) && pin === confirm
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("رمز PIN الخاص بي")}</DialogTitle>
          <DialogDescription>{tr("رمز من 4 إلى 6 أرقام للدخول السريع على أجهزة المطعم المشتركة. لا يُشارَك مع أحد.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{tr("الرمز الجديد")}</Label><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className="h-11 text-center text-xl tracking-[0.5em]" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <div className="space-y-1"><Label>{tr("تأكيد الرمز")}</Label><Input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} className="h-11 text-center text-xl tracking-[0.5em]" value={confirm} onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          {pin && confirm && pin !== confirm && <p className="text-sm text-red-600">{tr("الرمزان غير متطابقين")}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          {hasPin && <Button variant="outline" className="text-red-600" disabled={busy} onClick={() => onSave("")}>{tr("حذف الرمز")}</Button>}
          <Button className="h-11" disabled={busy || !valid} onClick={() => onSave(pin)}>{busy && <Loader2 className="me-1 h-4 w-4 animate-spin" />}{tr("حفظ")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** تحويل الطاولة لنادل آخر */
export function AssignWaiterDialog({ open, onOpenChange, waiters, currentId, loading, busy, onPick }: {
  open: boolean; onOpenChange: (open: boolean) => void; waiters: { id: string; name: string; role_name?: string | null }[]
  currentId: string | null | undefined; loading: boolean; busy: boolean; onPick: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={appDir()} className="w-[calc(100vw-1rem)] max-w-sm">
        <DialogHeader><DialogTitle>{tr("تحويل الطاولة لنادل آخر")}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {loading ? <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-rose-600" /></div>
            : !waiters.length ? <p className="p-4 text-center text-sm text-muted-foreground">{tr("لا يوجد مستخدمون لديهم الدخول لشاشة المطعم على هذا الفرع")}</p>
            : waiters.map((waiter) => (
              <button key={waiter.id} type="button" disabled={busy || waiter.id === String(currentId || "")} onClick={() => onPick(waiter.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-start text-sm transition-colors ${waiter.id === String(currentId || "") ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30" : "hover:bg-muted"}`}>
                <span className="flex items-center gap-2 font-bold"><UserRound className="h-4 w-4" />{waiter.name}</span>
                <span className="text-xs text-muted-foreground">{waiter.id === String(currentId || "") ? tr("الحالي") : waiter.role_name || ""}</span>
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
