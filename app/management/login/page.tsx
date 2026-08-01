"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react"
import { ManagementAuthShell } from "@/components/management/management-auth-shell"
import { activateCompany } from "@/lib/tenant-client"

export default function ManagementLoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const response = await fetch("/api/management/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || "حدث خطأ في تسجيل الدخول")
        return
      }

      try {
        const companiesResponse = await fetch("/api/management/companies")
        const companiesData = companiesResponse.ok ? await companiesResponse.json() : []
        const approved = Array.isArray(companiesData) ? companiesData.filter((company: any) => company.status === "approved") : []
        if (approved.length > 0) {
          const result = await activateCompany(approved[0].id)
          if (result.success) {
            window.location.href = `/?company=${approved[0].id}`
            return
          }
        }
      } catch {
        // عند تعذّر فتح الشركة مباشرة ننتقل إلى شاشة شركاتي كمسار احتياطي.
      }
      router.push("/management/companies")
    } catch {
      setError("تعذّر الاتصال بالخادم")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ManagementAuthShell eyebrow="بوابة إدارة الشركات" title="مرحباً بعودتك" description="سجّل الدخول للوصول إلى شركاتك وإدارة أنظمتها من مكان واحد." compact>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert className="rounded-xl border-red-200 bg-red-50 py-3"><AlertCircle className="h-4 w-4 text-red-600" /><AlertDescription className="text-xs leading-5 text-red-700">{error}</AlertDescription></Alert>}

        <div className="space-y-2">
          <Label htmlFor="management-email" className="text-sm font-bold text-slate-700">البريد الإلكتروني</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input id="management-email" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@company.com" className="h-[50px] rounded-xl border-slate-200 bg-slate-50/70 px-11 text-left text-sm shadow-sm placeholder:text-slate-400 focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} dir="ltr" required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="management-password" className="text-sm font-bold text-slate-700">كلمة المرور</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <Input id="management-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="أدخل كلمة المرور" className="h-[50px] rounded-xl border-slate-200 bg-slate-50/70 pl-12 pr-11 text-sm shadow-sm placeholder:text-slate-400 focus-visible:border-violet-500 focus-visible:bg-white focus-visible:ring-violet-500/15" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required />
            <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-violet-600" aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}</button>
          </div>
        </div>

        <Button type="submit" disabled={loading} className="group h-[50px] w-full rounded-xl bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-500 text-sm font-extrabold text-white shadow-lg shadow-violet-600/20 transition-all hover:-translate-y-0.5 hover:opacity-95">
          {loading ? <><span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />جاري تسجيل الدخول...</> : <>الدخول إلى النظام<ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /></>}
        </Button>

        <div className="relative py-1"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div><div className="relative flex justify-center"><span className="bg-white px-3 text-[11px] text-slate-400">ليس لديك حساب؟</span></div></div>
        <Link href="/management/signup" className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">إنشاء حساب جديد</Link>
      </form>
    </ManagementAuthShell>
  )
}
