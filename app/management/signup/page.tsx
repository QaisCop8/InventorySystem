"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react"
import { ManagementAuthShell } from "@/components/management/management-auth-shell"

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

  if (success) {
    return (
      <ManagementAuthShell eyebrow="تم إنشاء الحساب" title="أهلاً بك في أساس" description="أصبح حساب الإدارة جاهزاً ويمكنك الآن تسجيل الدخول وإضافة شركتك." compact>
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></div>
          <Link href="/management/login" className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-500 text-sm font-extrabold text-white shadow-lg shadow-violet-600/20">الذهاب لتسجيل الدخول<ArrowLeft className="mr-2 h-4 w-4" /></Link>
        </div>
      </ManagementAuthShell>
    )
  }

  return (
    <ManagementAuthShell eyebrow="حساب إدارة جديد" title="ابدأ استخدام أساس" description="أنشئ حسابك لإضافة شركاتك وإدارة المستخدمين والفروع من بوابة موحّدة.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert className="rounded-xl border-red-200 bg-red-50 py-3"><AlertCircle className="h-4 w-4 text-red-600" /><AlertDescription className="text-xs leading-5 text-red-700">{error}</AlertDescription></Alert>}

        <div className="space-y-2">
          <Label htmlFor="signup-name" className="text-sm font-bold text-slate-700">الاسم الكامل</Label>
          <div className="relative"><UserRound className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" /><Input id="signup-name" autoComplete="name" autoFocus placeholder="أدخل الاسم الكامل" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pr-11 text-right text-sm shadow-sm focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required /></div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email" className="text-sm font-bold text-slate-700">البريد الإلكتروني</Label>
          <div className="relative"><Mail className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" /><Input id="signup-email" type="email" inputMode="email" autoComplete="email" placeholder="name@company.com" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 px-11 text-left text-sm shadow-sm focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} dir="ltr" required /></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signup-password" className="text-sm font-bold text-slate-700">كلمة المرور</Label>
            <div className="relative"><LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="6 أحرف على الأقل" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-10 pr-10 text-sm shadow-sm focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-violet-600" aria-label={showPassword ? "إخفاء كلمات المرور" : "إظهار كلمات المرور"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-confirm-password" className="text-sm font-bold text-slate-700">تأكيد كلمة المرور</Label>
            <div className="relative"><LockKeyhole className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="signup-confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="أعد كتابة كلمة المرور" className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pr-10 text-sm shadow-sm focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} required /></div>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="group mt-1 h-[50px] w-full rounded-xl bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-500 text-sm font-extrabold text-white shadow-lg shadow-violet-600/20 transition-all hover:-translate-y-0.5 hover:opacity-95">
          {loading ? <><span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري إنشاء الحساب...</> : <>إنشاء حساب جديد<ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
        </Button>

        <p className="pt-1 text-center text-xs text-slate-500">لديك حساب بالفعل؟ <Link href="/management/login" className="font-bold text-violet-600 hover:text-violet-700 hover:underline">تسجيل الدخول</Link></p>
      </form>
    </ManagementAuthShell>
  )
}
