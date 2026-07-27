"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Eye, EyeOff, Lock, Mail, LogIn, ShieldCheck, Sparkles } from "lucide-react"
import { activateCompany } from "@/lib/tenant-client"

export default function ManagementLoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // ملاحظة: عمداً بلا أي تحويل تلقائي لشركاتي هنا حتى لو كانت جلسة الإدارة (mgmt_session) لا
  // تزال صالحة — تسجيل الخروج من داخل شركة يعيد المستخدم لهذه الصفحة تحديداً بقصد (auth-context.tsx)
  // رغم أن جلسة الإدارة نفسها تبقى صالحة عادةً (٧ أيام)، فإي تحويل تلقائي هنا كان يُلغي أثر
  // تسجيل الخروج فوراً ويُعيد المستخدم لشركاتي بدل شاشة الدخول.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/management/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "حدث خطأ في تسجيل الدخول")
        return
      }

      // شركة واحدة معتمَدة أو أكثر؟ يدخل النظام مباشرة على أحدث شركة معتمَدة (الأولى بالترتيب،
      // إذ تُرتَّب النتيجة created_at DESC) بدل عرض شركاتي أولاً — يبقى بإمكانه التبديل لشركة
      // أخرى لاحقاً من القائمة المنسدلة بالهيدر أو رابط "شركاتي". لا شركة معتمَدة بعد؟ يستمر
      // لشركاتي كالمعتاد.
      try {
        const companiesRes = await fetch("/api/management/companies")
        const companiesData = companiesRes.ok ? await companiesRes.json() : []
        const approved = Array.isArray(companiesData)
          ? companiesData.filter((c: any) => c.status === "approved")
          : []
        if (approved.length >= 1) {
          const result = await activateCompany(approved[0].id)
          if (result.success) {
            window.location.href = `/?company=${approved[0].id}`
            return
          }
        }
      } catch {
        // تجاهل أي خلل هنا — المسار الافتراضي (شركاتي) يبقى يعمل دوماً
      }

      router.push("/management/companies")
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      dir="rtl"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-4 py-10"
    >
      {/* خلفية داكنة مع كتل ضوء ملوَّنة، مطابقة تماماً لتصميم components/auth/login-page.tsx —
          هذه الصفحة أصبحت بوابة الدخول الوحيدة للنظام كله، فيجب أن تحمل نفس الهوية البصرية. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_45%),radial-gradient(circle_at_85%_15%,rgba(217,70,239,0.14),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.1),transparent_45%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-indigo-500/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/15 blur-[130px]" />

      <svg
        className="pointer-events-none absolute -bottom-14 -left-14 h-[24rem] w-[24rem] text-indigo-200/[0.09] sm:-bottom-16 sm:-left-16 sm:h-[28rem] sm:w-[28rem]"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden="true"
      >
        <polygon points="40,70 90,50 140,70 90,90" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="40,70 90,90 90,150 40,130" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="140,70 90,90 90,150 140,130" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
        <path d="M40,100 L90,120 L140,100" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="12" y="138" width="32" height="20" rx="2.5" stroke="currentColor" strokeWidth="3" />
        <path d="M18,142 v12 M23,142 v12 M28,142 v8 M33,142 v12 M38,142 v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M40,130 L26,138" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <rect x="146" y="94" width="42" height="64" rx="6" stroke="currentColor" strokeWidth="4" />
        <rect x="158" y="87" width="18" height="10" rx="3" stroke="currentColor" strokeWidth="4" />
        <path d="M152,114 l4,4 l7,-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M167,114 h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M152,130 l4,4 l7,-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M167,130 h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M152,146 l4,4 l7,-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M167,146 h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M18,42 L45,26 L66,37 L92,14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M76,14 L92,14 L92,29" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg
        className="pointer-events-none absolute -top-8 -right-8 h-64 w-64 text-fuchsia-200/[0.08] sm:h-80 sm:w-80"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden="true"
      >
        <rect x="108" y="14" width="72" height="96" rx="6" stroke="currentColor" strokeWidth="4" />
        <path d="M122,34 h44 M122,47 h44 M122,60 h30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M122,84 h44" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <circle cx="104" cy="120" r="24" stroke="currentColor" strokeWidth="4" />
        <circle cx="88" cy="132" r="24" stroke="currentColor" strokeWidth="4" />
        <path d="M45,178 h140" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M60,178 v-24 M85,178 v-40 M110,178 v-15 M135,178 v-32 M160,178 v-20" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_10px_35px_-8px_rgba(139,92,246,0.5)]">
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
          <p className="text-xs font-medium tracking-[0.3em] text-indigo-300">ASAS ACCOUNTING SYSTEM</p>
          <h1 className="mt-1 text-2xl font-bold text-white">أساس لإدارة الحلول المحاسبية</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
            سجّل الدخول للمتابعة إلى لوحة النظام — منصة متكاملة بواجهة سريعة وآمنة
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_25px_70px_-25px_rgba(15,23,42,0.25)] backdrop-blur-xl sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm text-slate-700">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  className="h-12 rounded-xl border-slate-200 bg-white pr-11 text-right text-slate-900 placeholder:text-slate-400 focus-visible:border-violet-400 focus-visible:ring-violet-500/30"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-slate-700">كلمة المرور</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  className="h-12 rounded-xl border-slate-200 bg-white pl-11 pr-11 text-right text-slate-900 placeholder:text-slate-400 focus-visible:border-violet-400 focus-visible:ring-violet-500/30"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-gradient-to-l from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_35px_-12px_rgba(139,92,246,0.5)] transition-transform hover:scale-[1.01] hover:opacity-95"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  تسجيل الدخول
                </div>
              )}
            </Button>

            <p className="text-center text-sm text-slate-500">
              ليس لديك حساب؟{" "}
              <Link href="/management/signup" className="font-medium text-violet-600 hover:underline">
                إنشاء حساب جديد
              </Link>
            </p>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            اتصال مشفَّر وآمن — أساس (Asas) Accounting System
          </div>
        </div>
      </div>
    </div>
  )
}
