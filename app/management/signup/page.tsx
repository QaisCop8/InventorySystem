"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react"

export default function ManagementSignupPage() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "" })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      const res = await fetch("/api/management/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName, email: form.email, password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) {
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
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-bold text-slate-900">تم إنشاء الحساب بنجاح</h1>
          <p className="mt-2 text-sm text-slate-500">
            أرسلنا رسالة تأكيد إلى بريدك الإلكتروني. يرجى فتحها والضغط على رابط التأكيد قبل تسجيل الدخول.
          </p>
          <Link href="/management/login" className="mt-6 inline-block text-sm font-medium text-violet-600 hover:underline">
            الذهاب لتسجيل الدخول
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg">
            <UserPlus className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">إنشاء حساب جديد</h1>
          <p className="mt-1 text-sm text-slate-500">أنشئ حسابك لإدارة شركاتك</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="text-right" />
          </div>
          <div className="space-y-1.5">
            <Label>البريد الإلكتروني</Label>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="text-right" dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>كلمة المرور</Label>
            <Input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="text-right" />
          </div>
          <div className="space-y-1.5">
            <Label>تأكيد كلمة المرور</Label>
            <Input required type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="text-right" />
          </div>

          <Button type="submit" disabled={loading} className="h-11 w-full bg-gradient-to-l from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
            {loading ? "جاري الإنشاء..." : "إنشاء الحساب"}
          </Button>

          <p className="text-center text-sm text-slate-500">
            لديك حساب بالفعل؟{" "}
            <Link href="/management/login" className="font-medium text-violet-600 hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
