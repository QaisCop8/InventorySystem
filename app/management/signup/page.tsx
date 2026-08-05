"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react"

export default function ManagementSignupPage() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    if (form.password !== form.confirmPassword) {
      setError("كلمة المرور وتأكيد كلمة المرور غير متطابقتين")
      return
    }
    if (form.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/management/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName, email: form.email, password: form.password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || "حدث خطأ أثناء إنشاء الحساب")
        return
      }
      setSuccess(true)
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#f4f7f6] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_85%_85%,rgba(14,116,144,0.12),transparent_32%)]" />
      <div className="mx-auto grid max-w-6xl gap-6 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_90px_-42px_rgba(15,23,42,0.35)] lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="hidden flex-col justify-between gap-8 bg-[#0b2420] p-10 text-white lg:flex">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs tracking-[0.18em] text-emerald-200">أمان احترافي</div>
            <div>
              <h2 className="text-3xl font-bold leading-tight">ابدأ إدارة شركتك بسهولة</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">أنشئ مستخدم إدارة جديد للوصول الفوري إلى كل أدوات النظام: المخزون، الطلبات، الحسابات، والتقارير.</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">لوحة تحكم موحدة لجميع الفروع</div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">بيانات مشفرة وحماية مضمونة</div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">بداية سريعة وإعداد بسيط</div>
          </div>
        </aside>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mx-auto mb-8 max-w-xl text-center">
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/20">
              <UserRound className="h-7 w-7" />
            </div>
            <span className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">حساب إدارة جديد</span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">إنشاء مستخدم جديد</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">املأ التفاصيل أدناه للوصول إلى إدارة أساس ومتابعة الشركات والفروع من بوابة واحدة.</p>
          </div>

          {success ? (
            <div className="space-y-5 rounded-[26px] border border-emerald-100 bg-emerald-50 p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-emerald-600 shadow-sm">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-950">تم إنشاء الحساب بنجاح!</h2>
              <p className="text-sm leading-6 text-slate-600">يمكنك الآن تسجيل الدخول كمستخدم إدارة والوصول إلى لوحة النظام.</p>
              <Link href="/management/login" className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-600/20">
                الذهاب لتسجيل الدخول<ArrowLeft className="mr-2 h-4 w-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <Alert className="rounded-3xl border-red-200 bg-red-50 p-4 text-right">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm font-semibold text-slate-700">الاسم الكامل</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      autoFocus
                      placeholder="أدخل الاسم الكامل"
                      className="h-12 rounded-3xl border-slate-200 bg-slate-50/70 pr-11 text-right text-sm shadow-sm focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15"
                      value={form.fullName}
                      onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-semibold text-slate-700">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                    <Input
                      id="signup-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      className="h-12 rounded-3xl border-slate-200 bg-slate-50/70 px-11 text-left text-sm shadow-sm focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-semibold text-slate-700">كلمة المرور</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="6 أحرف على الأقل"
                        className="h-12 rounded-3xl border-slate-200 bg-slate-50/70 pl-10 pr-10 text-sm shadow-sm focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15"
                        value={form.password}
                        onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm transition-colors hover:text-emerald-700"
                        aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password" className="text-sm font-semibold text-slate-700">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="أعد كتابة كلمة المرور"
                        className="h-12 rounded-3xl border-slate-200 bg-slate-50/70 pr-10 text-sm shadow-sm focus-visible:border-emerald-500 focus-visible:bg-white focus-visible:ring-emerald-500/15"
                        value={form.confirmPassword}
                        onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group mt-1 h-[50px] w-full rounded-3xl bg-gradient-to-l from-emerald-600 via-teal-500 to-cyan-500 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:opacity-95"
              >
                {loading ? (
                  <>
                    <span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    جاري إنشاء الحساب...
                  </>
                ) : (
                  <>
                    إنشاء مستخدم جديد
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                  </>
                )}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            لديك حساب بالفعل؟ <Link href="/management/login" className="font-semibold text-emerald-700 hover:text-emerald-800">تسجيل الدخول</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
