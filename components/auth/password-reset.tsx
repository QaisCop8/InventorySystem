"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Mail, CheckCircle, AlertCircle, Key, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react"

interface PasswordResetProps {
  onBack: () => void
  initialEmail?: string
  initialCode?: string
}

const callResetApi = async (body: Record<string, unknown>) => {
  const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "حدث خطأ في النظام")
  return data
}

const RESEND_SECONDS = 60

function Notice({ tone, text }: { tone: "error" | "success"; text: string }) {
  if (!text) return null
  return tone === "error" ? (
    <Alert className="border-red-200 bg-red-50">
      <AlertCircle className="h-4 w-4 text-red-600" />
      <AlertDescription className="whitespace-pre-line break-words text-red-700">{text}</AlertDescription>
    </Alert>
  ) : (
    <Alert className="border-green-200 bg-green-50">
      <CheckCircle className="h-4 w-4 text-green-600" />
      <AlertDescription className="text-green-700">{text}</AlertDescription>
    </Alert>
  )
}

/**
 * نسيت كلمة المرور: (1) البريد ← إرسال رمز تحقق من 6 أرقام بالبريد (صالح 15 دقيقة، 5 محاولات)
 * (2) إدخال الرمز والتحقق منه ← (3) نافذة منبثقة لتعيين كلمة المرور الجديدة.
 * رابط البريد (?set_password=1&email=&code=) يفتح النافذة المنبثقة مباشرة.
 */
export function PasswordReset({ onBack, initialEmail = "", initialCode = "" }: PasswordResetProps) {
  const fromLink = Boolean(initialEmail && initialCode)
  const [step, setStep] = useState<"request" | "verify">(fromLink ? "verify" : "request")
  const [email, setEmail] = useState(initialEmail)
  const [verificationCode, setVerificationCode] = useState(initialCode)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [resendIn, setResendIn] = useState(0)

  // نافذة كلمة المرور الجديدة
  const [resetOpen, setResetOpen] = useState(fromLink)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetError, setResetError] = useState("")
  const [resetDone, setResetDone] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendIn])

  const sendCode = async () => {
    setError("")
    setIsLoading(true)
    try {
      const data = await callResetApi({ step: "request", email })
      setSuccess(data.message || "تم إرسال رمز التحقق إلى بريدك الإلكتروني")
      setVerificationCode("")
      setStep("verify")
      setResendIn(RESEND_SECONDS)
      requestAnimationFrame(() => codeRef.current?.focus())
    } catch (err: any) {
      setError(err.message || "حدث خطأ في إرسال رمز التحقق")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault()
    void sendCode()
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setError("رمز التحقق مكوّن من 6 أرقام")
      return
    }
    setIsLoading(true)
    try {
      await callResetApi({ step: "verify", email, code: verificationCode.trim() })
      setSuccess("تم التحقق من الرمز بنجاح")
      setResetError("")
      setResetOpen(true)
    } catch (err: any) {
      setError(err.message || "حدث خطأ في التحقق من الرمز")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError("")
    if (newPassword.length < 6) { setResetError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return }
    if (newPassword !== confirmPassword) { setResetError("كلمة المرور وتأكيدها غير متطابقتين"); return }
    setResetLoading(true)
    try {
      await callResetApi({ step: "reset", email, code: verificationCode.trim(), newPassword })
      setResetDone(true)
      window.setTimeout(() => onBack(), 2500)
    } catch (err: any) {
      setResetError(err.message || "حدث خطأ في تغيير كلمة المرور")
    } finally {
      setResetLoading(false)
    }
  }

  const strength = newPassword.length === 0 ? 0 : newPassword.length < 6 ? 1 : /[0-9]/.test(newPassword) && /[^0-9]/.test(newPassword) && newPassword.length >= 8 ? 3 : 2
  const strengthLabel = ["", "ضعيفة", "متوسطة", "قوية"][strength]
  const strengthTone = ["", "bg-red-500", "bg-amber-500", "bg-emerald-500"][strength]

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-emerald-100 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" onClick={onBack} className="p-2 hover:bg-gray-100" aria-label="رجوع لتسجيل الدخول">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-xl">استعادة كلمة المرور</CardTitle>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className={step === "request" ? "text-emerald-700" : ""}>1. البريد الإلكتروني</span>
              <span>←</span>
              <span className={step === "verify" && !resetOpen ? "text-emerald-700" : ""}>2. رمز التحقق</span>
              <span>←</span>
              <span className={resetOpen ? "text-emerald-700" : ""}>3. كلمة المرور الجديدة</span>
            </div>
          </CardHeader>
          <CardContent>
            {step === "request" ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <Notice tone="error" text={error} />
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input id="email" type="email" dir="ltr" autoComplete="email" placeholder="name@example.com" className="pr-12 h-12 text-left"
                      value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                  </div>
                  <p className="text-sm text-muted-foreground">سيصلك رمز تحقق من 6 أرقام على هذا البريد (صالح 15 دقيقة)</p>
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 h-12" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الإرسال...</> : "إرسال رمز التحقق"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <Notice tone="success" text={success} />
                <Notice tone="error" text={error} />
                <div className="space-y-2">
                  <Label htmlFor="code">رمز التحقق</Label>
                  <Input ref={codeRef} id="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" placeholder="••••••"
                    className="h-14 text-center text-2xl font-bold tracking-[0.6em]" value={verificationCode}
                    onChange={(e) => { setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError("") }} maxLength={6} required />
                  <p className="text-sm text-muted-foreground">أُرسل الرمز إلى: <b dir="ltr">{email}</b></p>
                </div>
                <Button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 h-12" disabled={isLoading || verificationCode.length !== 6}>
                  {isLoading ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري التحقق...</> : "تحقق من الرمز"}
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 bg-transparent" disabled={isLoading || resendIn > 0} onClick={() => void sendCode()}>
                    {resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ث` : "إعادة إرسال الرمز"}
                  </Button>
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => { setStep("request"); setError(""); setSuccess("") }}>تغيير البريد</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* الخطوة 3: نافذة منبثقة بعد التحقق من الرمز */}
      <Dialog open={resetOpen} onOpenChange={(open) => { if (!resetLoading && !resetDone) setResetOpen(open) }}>
        <DialogContent dir="rtl" className="w-[calc(100vw-2rem)] max-w-md" onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />تعيين كلمة مرور جديدة</DialogTitle>
            <DialogDescription>للحساب <b dir="ltr">{email}</b></DialogDescription>
          </DialogHeader>
          {resetDone ? (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
              <p className="font-bold text-emerald-700">تم تغيير كلمة المرور بنجاح</p>
              <p className="text-sm text-muted-foreground">جاري تحويلك لتسجيل الدخول...</p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <Notice tone="error" text={resetError} />
              <div className="space-y-2">
                <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Key className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input id="newPassword" type={showNew ? "text" : "password"} autoComplete="new-password" placeholder="6 أحرف على الأقل" className="h-12 pl-11 pr-12"
                    value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setResetError("") }} minLength={6} required autoFocus />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" onClick={() => setShowNew((value) => !value)} aria-label={showNew ? "إخفاء" : "إظهار"}>
                    {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {strength > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex flex-1 gap-1">{[1, 2, 3].map((level) => <span key={level} className={`h-1.5 flex-1 rounded-full ${level <= strength ? strengthTone : "bg-slate-200"}`} />)}</div>
                    <span className="text-muted-foreground">{strengthLabel}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Key className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input id="confirmPassword" type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="أعد إدخال كلمة المرور" className="h-12 pl-11 pr-12"
                    value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setResetError("") }} minLength={6} required />
                  <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" onClick={() => setShowConfirm((value) => !value)} aria-label={showConfirm ? "إخفاء" : "إظهار"}>
                    {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && <p className="text-xs text-red-600">غير مطابقة لكلمة المرور الجديدة</p>}
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="h-12 flex-1 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700" disabled={resetLoading}>
                  {resetLoading ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الحفظ...</> : "حفظ كلمة المرور"}
                </Button>
                <Button type="button" variant="outline" className="h-12" disabled={resetLoading} onClick={() => setResetOpen(false)}>إلغاء</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
