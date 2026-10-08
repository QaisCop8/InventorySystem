"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Mail, CheckCircle, AlertCircle, Key } from "lucide-react"

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

export function PasswordReset({ onBack, initialEmail = "", initialCode = "" }: PasswordResetProps) {
  // رابط الدعوة/الاستعادة من البريد يحمل البريد والرمز — يفتح مباشرة على خطوة كلمة المرور الجديدة.
  const [step, setStep] = useState<"request" | "verify" | "reset">(initialEmail && initialCode ? "reset" : "request")
  const [email, setEmail] = useState(initialEmail)
  const [verificationCode, setVerificationCode] = useState(initialCode)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const data = await callResetApi({ step: "request", email })
      setSuccess(data.message || "تم إرسال رمز التحقق إلى بريدك الإلكتروني")
      setStep("verify")
    } catch (err: any) {
      setError(err.message || "حدث خطأ في إرسال رمز التحقق")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      await callResetApi({ step: "verify", email, code: verificationCode })
      setSuccess("تم التحقق من الرمز بنجاح")
      setStep("reset")
    } catch (err: any) {
      setError(err.message || "حدث خطأ في التحقق من الرمز")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword !== confirmPassword) {
      setError("كلمة المرور وتأكيد كلمة المرور غير متطابقتان")
      return
    }

    if (newPassword.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
      return
    }

    setIsLoading(true)

    try {
      await callResetApi({ step: "reset", email, code: verificationCode, newPassword })
      setSuccess("تم تغيير كلمة المرور بنجاح — يمكنك الآن تسجيل الدخول")

      // Redirect to login after 3 seconds
      setTimeout(() => {
        onBack()
      }, 3000)
    } catch (err: any) {
      setError(err.message || "حدث خطأ في تغيير كلمة المرور")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <Button variant="ghost" size="sm" onClick={onBack} className="p-2 hover:bg-gray-100">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-xl">استعادة كلمة المرور</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {step === "request" && (
              <form onSubmit={handleRequestReset} className="space-y-4">
                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="أدخل بريدك الإلكتروني"
                      className="pr-12 h-12"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">سيتم إرسال رمز التحقق إلى بريدك الإلكتروني</p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 h-12"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      جاري الإرسال...
                    </div>
                  ) : (
                    "إرسال رمز التحقق"
                  )}
                </Button>
              </form>
            )}

            {step === "verify" && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                {success && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="code">رمز التحقق</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="أدخل رمز التحقق المرسل إلى بريدك"
                    className="h-12 text-center text-lg tracking-widest"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <p className="text-sm text-muted-foreground">تم إرسال رمز التحقق إلى: {email}</p>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 h-12"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      جاري التحقق...
                    </div>
                  ) : (
                    "تحقق من الرمز"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => setStep("request")}
                >
                  إعادة إرسال الرمز
                </Button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {success && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">{success}</AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Key className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="أدخل كلمة المرور الجديدة"
                        className="pr-12 h-12"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Key className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="أعد إدخال كلمة المرور الجديدة"
                        className="pr-12 h-12"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 h-12"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      جاري التغيير...
                    </div>
                  ) : (
                    "تغيير كلمة المرور"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
