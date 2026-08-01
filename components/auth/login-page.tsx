"use client"

import { useState } from "react"
import { PasswordReset } from "./password-reset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from "lucide-react"

interface LoginPageProps {
  onLogin: (credentials: { username: string; password: string; rememberMe: boolean }) => void | Promise<void>
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [credentials, setCredentials] = useState({ username: "", password: "", rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  if (showPasswordReset) return <PasswordReset onBack={() => setShowPasswordReset(false)} />

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      await onLogin(credentials)
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "حدث خطأ في تسجيل الدخول")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#f4f7f6] px-4 py-6 text-slate-950 sm:px-6 lg:flex lg:items-center lg:justify-center lg:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.10),transparent_30%),radial-gradient(circle_at_10%_90%,rgba(14,116,144,0.08),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] [background-size:32px_32px]" />

      <section className="relative z-10 mx-auto grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_32px_90px_-42px_rgba(15,23,42,0.4)] lg:min-h-[700px] lg:grid-cols-[0.88fr_1.12fr]">
        <div className="flex flex-col justify-between px-6 py-7 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-bold">نظام أساس</div>
                <div className="text-[11px] font-medium tracking-[0.12em] text-slate-500">ASAS ERP</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />اتصال آمن
            </div>
          </header>

          <div className="mx-auto my-12 w-full max-w-md lg:my-8">
            <div className="mb-8">
              <p className="mb-2 text-sm font-semibold text-emerald-700">مرحباً بعودتك</p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-[2.15rem]">سجّل الدخول إلى حسابك</h1>
              <p className="mt-3 text-sm leading-7 text-slate-500">أدخل بياناتك للوصول إلى إدارة المخزون والطلبات والحسابات من مساحة عمل واحدة.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert className="rounded-xl border-red-200 bg-red-50 text-right">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-username" className="text-sm font-semibold text-slate-700">اسم المستخدم أو البريد الإلكتروني</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <Input id="login-username" autoComplete="username" autoFocus value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} placeholder="أدخل اسم المستخدم" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pr-11 text-right text-slate-950 placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15" required />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-sm font-semibold text-slate-700">كلمة المرور</Label>
                  <button type="button" onClick={() => setShowPasswordReset(true)} className="text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800 hover:underline">نسيت كلمة المرور؟</button>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} placeholder="أدخل كلمة المرور" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-12 pr-11 text-right text-slate-950 placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15" required />
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm text-slate-600">
                <Switch checked={credentials.rememberMe} onCheckedChange={(rememberMe) => setCredentials((current) => ({ ...current, rememberMe }))} />
                الاحتفاظ بتسجيل الدخول على هذا الجهاز
              </label>

              <Button type="submit" disabled={isLoading} className="group h-12 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-600/15 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/20">
                {isLoading ? <><span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري التحقق...</> : <>دخول إلى النظام<ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
              </Button>
            </form>
          </div>

          <footer className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5 text-[11px] text-slate-400">
            <span>© {new Date().getFullYear()} نظام أساس</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />بياناتك محمية ومشفّرة</span>
          </footer>
        </div>

        <aside className="relative hidden overflow-hidden bg-[#0b2420] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(52,211,153,0.22),transparent_32%),radial-gradient(circle_at_85%_85%,rgba(14,116,144,0.28),transparent_38%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:38px_38px]" />

          <div className="relative z-10 max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-emerald-100 backdrop-blur"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />إدارة مترابطة، قرارات أوضح</div>
            <h2 className="text-3xl font-bold leading-[1.45] xl:text-[2.4rem]">كل عمليات شركتك<br />في لوحة واحدة ذكية.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">تابع المخزون، نفّذ الطلبات، وراقب الأداء المالي لحظة بلحظة عبر الفروع.</p>
          </div>

          <div className="relative z-10 my-10 rounded-[26px] border border-white/10 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-md">
            <div className="mb-5 flex items-center justify-between"><div><div className="text-sm font-semibold">نظرة عامة</div><div className="mt-1 text-xs text-slate-400">أداء الفروع اليوم</div></div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><BarChart3 className="h-4 w-4" /></div></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/[0.07] p-3"><PackageCheck className="mb-3 h-4 w-4 text-emerald-300" /><div className="text-xl font-bold">128</div><div className="mt-1 text-[10px] text-slate-400">طلبية مكتملة</div></div>
              <div className="rounded-2xl bg-white/[0.07] p-3"><Building2 className="mb-3 h-4 w-4 text-cyan-300" /><div className="text-xl font-bold">6</div><div className="mt-1 text-[10px] text-slate-400">فروع نشطة</div></div>
              <div className="rounded-2xl bg-white/[0.07] p-3"><TrendingUp className="mb-3 h-4 w-4 text-amber-300" /><div className="text-xl font-bold">+18%</div><div className="mt-1 text-[10px] text-slate-400">نمو المبيعات</div></div>
            </div>
            <div className="mt-4 flex h-24 items-end gap-2 rounded-2xl bg-black/10 px-4 pb-3 pt-5" aria-hidden="true">
              {[38, 55, 44, 72, 58, 84, 68, 92, 78, 100].map((height, index) => <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-500/50 to-emerald-300" style={{ height: `${height}%` }} />)}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-3 border-t border-white/10 pt-5 text-xs text-slate-300"><ShieldCheck className="h-4 w-4 text-emerald-400" />صلاحيات دقيقة لكل مستخدم وفرع</div>
        </aside>
      </section>
    </main>
  )
}
