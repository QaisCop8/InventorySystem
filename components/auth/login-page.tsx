"use client"

import { useState } from "react"
import { PasswordReset } from "./password-reset"
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
  ShieldCheck,
  Sparkles,
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
    <div
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05060f] px-4 py-10"
    >
      {/* خلفية متدرجة داكنة مع كتل ضوء ضبابية متوهجة — الطابع المميِّز لهذا التصميم الحديث */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.22),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(217,70,239,0.16),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.12),transparent_45%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-600/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-[26rem] w-[26rem] rounded-full bg-fuchsia-600/15 blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_0_45px_-8px_rgba(139,92,246,0.7)]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" aria-hidden="true">
              <path
                d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                fill="currentColor"
              />
              <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.65" />
            </svg>
            <span className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            </span>
          </div>
          <p className="text-xs font-medium tracking-[0.3em] text-indigo-300/80">ASAS ACCOUNTING SYSTEM</p>
          <h1 className="mt-1 text-2xl font-bold text-white">أساس لإدارة الحلول المحاسبية</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-400">
            سجّل الدخول للمتابعة إلى لوحة النظام — منصة متكاملة بواجهة سريعة وآمنة
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-300">{error}</AlertDescription>
              </Alert>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">اسم المستخدم أو البريد الإلكتروني</Label>
              <div className="relative">
                <User className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  className="h-12 rounded-xl border-white/10 bg-white/5 pr-11 text-right text-white placeholder:text-slate-500 focus-visible:border-violet-400/60 focus-visible:bg-white/[0.07] focus-visible:ring-violet-500/40"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">كلمة المرور</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  className="h-12 rounded-xl border-white/10 bg-white/5 pl-11 pr-11 text-right text-white placeholder:text-slate-500 focus-visible:border-violet-400/60 focus-visible:bg-white/[0.07] focus-visible:ring-violet-500/40"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={credentials.rememberMe}
                  onCheckedChange={(v) => setCredentials({ ...credentials, rememberMe: v })}
                />
                <span className="text-sm text-slate-300">تذكرني</span>
              </div>

              <button type="button" className="text-sm text-violet-300 transition-colors hover:text-violet-200 hover:underline">
                نسيت كلمة المرور؟
              </button>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={isLoading}
              className="h-12 w-full rounded-xl bg-gradient-to-l from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_35px_-12px_rgba(139,92,246,0.65)] transition-transform hover:scale-[1.01] hover:opacity-95"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  تسجيل الدخول
                </div>
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-white/10 pt-4 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            اتصال مشفَّر وآمن — أساس (Asas) Accounting System
          </div>
        </div>
      </div>
    </div>
  )
}
