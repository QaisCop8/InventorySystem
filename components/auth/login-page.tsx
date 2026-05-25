"use client"

import { useState } from "react"
import { PasswordReset } from "./password-reset"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  LogIn,
} from "lucide-react"

interface LoginPageProps {
  onLogin: (credentials: {
    username: string
    password: string
    rememberMe: boolean
  }) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    rememberMe: false,
  })

  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  if (showPasswordReset) {
    return <PasswordReset onBack={() => setShowPasswordReset(false)} />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      await onLogin(credentials)
    } catch (err: any) {
      setError(err.message || "حدث خطأ في تسجيل الدخول")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(130deg,#f7f3e8_0%,#ecf7f5_45%,#e7f0f8_100%)] px-4 py-6 sm:px-6 sm:py-8" dir="rtl">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white/85 shadow-[0_20px_70px_rgba(15,23,42,0.18)] backdrop-blur-sm lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#166534_0%,#15803d_52%,#14532d_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-8 h-80 w-80 rounded-full bg-amber-200/20 blur-3xl" />

          <div className="relative z-10">
            <div className="mb-8 inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-green-700">
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  <path
                    d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                    fill="currentColor"
                  />
                  <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <div>
                <p className="text-xs tracking-[0.2em] text-slate-100/90">SYSTEM</p>
                <p className="text-lg font-semibold">أساس (Asas) Accounting System</p>
              </div>
            </div>

            <h1 className="max-w-md text-4xl font-bold leading-tight">Welcome to أساس (Asas) Accounting System</h1>
            <p className="mt-4 max-w-md text-base text-slate-100/90">منصة متكاملة لإدارة العمليات اليومية بواجهة واضحة، سريعة، وآمنة.</p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">آمن</div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">سريع</div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">مرن</div>
          </div>
        </section>

        <section className="relative flex items-center justify-center p-5 sm:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.12),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(14,116,144,0.14),transparent_35%)]" />

          <Card className="relative z-10 w-full max-w-md border-slate-200/80 bg-white/95 shadow-2xl">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#15803d_0%,#16a34a_100%)] text-white shadow-lg">
                  <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
                    <path
                      d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                      fill="currentColor"
                    />
                    <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
                  </svg>
                </div>
                <p className="text-xs tracking-[0.18em] text-green-700">أساس (ASAS) Accounting System</p>
                <h2 className="mt-1 text-3xl font-extrabold text-slate-800">تسجيل الدخول</h2>
                <p className="mt-2 text-sm text-slate-600">استخدم بيانات حسابك للمتابعة إلى لوحة النظام</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">

                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-700">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Username */}
                <div className="space-y-1">
                  <Label className="text-slate-700">اسم المستخدم أو البريد الإلكتروني</Label>
                  <div className="relative">
                    <User className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      className="h-12 rounded-xl border-slate-300 bg-white pr-12 text-right focus-visible:ring-green-600"
                      value={credentials.username}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          username: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <Label className="text-slate-700">كلمة المرور</Label>
                  <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      className="h-12 rounded-xl border-slate-300 bg-white pl-12 pr-12 text-right focus-visible:ring-green-600"
                      value={credentials.password}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          password: e.target.value,
                        })
                      }
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </div>

                {/* Remember */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={credentials.rememberMe}
                      onCheckedChange={(v) =>
                        setCredentials({ ...credentials, rememberMe: v })
                      }
                    />
                    <span className="text-sm text-slate-700">تذكرني</span>
                  </div>

                  <button
                    type="button"
                    className="text-sm text-green-700 hover:underline"
                    //onClick={/*() => setShowPasswordReset(true)*/}
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl bg-[linear-gradient(90deg,#166534_0%,#16a34a_100%)] text-white shadow-lg transition-transform hover:scale-[1.01] hover:opacity-95"
                >
                  {isLoading ? (
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <div className="flex items-center gap-2">
                      <LogIn className="w-4 h-4" />
                      Sign in to أساس (Asas) Accounting System
                    </div>
                  )}
                </Button>
              </form>
              <div className="mt-6 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
                أساس (Asas) Accounting System
              </div>
            </CardContent> 
          </Card>
        </section>
      </div>
    </div>
  )
}
