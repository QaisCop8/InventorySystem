"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, LogIn, User, Lock, Eye, EyeOff } from "lucide-react"

export default function CustomerLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // Validation
    if (!username.trim()) {
      setError("الرجاء إدخال اسم المستخدم")
      return
    }

    if (!password) {
      setError("الرجاء إدخال كلمة المرور")
      return
    }

    setLoading(true)

    try {
      console.log("[v0] Attempting login with username:", username)

      const response = await fetch("/api/customer-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()
      console.log("[v0] Login response:", { ok: response.ok, status: response.status })

      if (!response.ok) {
        setError(data.error || "حدث خطأ أثناء تسجيل الدخول")
        return
      }

      console.log("[v0] Login successful, redirecting to dashboard")

      // Redirect to customer dashboard
      router.push("/customer/dashboard")
      router.refresh()
    } catch (error) {
      console.error("[v0] Login error:", error)
      setError("حدث خطأ في الاتصال. الرجاء المحاولة مرة أخرى")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(120deg,#f7f3e8_0%,#f0f7f7_42%,#e6f0f8_100%)] p-4 md:p-8" dir="rtl">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl grid-cols-1 items-stretch overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-[0_20px_80px_rgba(15,23,42,0.18)] backdrop-blur-sm lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#166534_0%,#15803d_55%,#14532d_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
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

            <h1 className="max-w-md text-4xl font-bold leading-tight">أساس (Asas) Accounting System</h1>
            <p className="mt-4 max-w-md text-base text-slate-100/90">
              تجربة دخول سريعة وآمنة بواجهة عصرية تساعدك على متابعة الطلبات والحسابات بسهولة.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">آمن</div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">سريع</div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">واضح</div>
          </div>
        </section>

        <section className="relative flex items-center justify-center p-5 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.12),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(14,116,144,0.14),transparent_35%)]" />
          <Card className="relative z-10 w-full max-w-md border-slate-200/80 bg-white/95 shadow-2xl">
            <CardHeader className="space-y-3 pb-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-700 to-green-500 text-white shadow-lg">
                <svg viewBox="0 0 24 24" className="h-10 w-10" aria-hidden="true">
                  <path
                    d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 2.3L6 8.2v7.6l6 2.9 6-2.9V8.2l-6-2.9z"
                    fill="currentColor"
                  />
                  <path d="M12 8.8l3.4 1.9v3.8L12 16.4l-3.4-1.9v-3.8L12 8.8z" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <div>
                <p className="text-xs tracking-[0.18em] text-green-700">أساس (ASAS) Accounting System</p>
                <CardTitle className="mt-1 text-3xl font-extrabold text-slate-800">تسجيل الدخول</CardTitle>
              </div>
              <CardDescription className="text-base text-slate-600">
                Sign in to access أساس (Asas) Accounting System
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-right">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-base text-slate-700">
                    اسم المستخدم
                  </Label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="أدخل اسم المستخدم"
                      required
                      disabled={loading}
                      className="h-12 rounded-xl border-slate-300 bg-white pr-10 text-right focus-visible:ring-green-600"
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-base text-slate-700">
                    كلمة المرور
                  </Label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      required
                      disabled={loading}
                      className="h-12 rounded-xl border-slate-300 bg-white pl-11 pr-10 text-right focus-visible:ring-green-600"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-800"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full rounded-xl bg-[linear-gradient(90deg,#166534_0%,#16a34a_100%)] text-base text-white shadow-lg transition-transform hover:scale-[1.01] hover:opacity-95"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                      جاري تسجيل الدخول...
                    </>
                  ) : (
                    <>
                      <LogIn className="ml-2 h-5 w-5" />
                      Sign in to أساس (Asas) Accounting System
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-6 text-center">
                <p className="text-sm text-slate-500">
                  هل تواجه مشكلة في تسجيل الدخول؟
                  <br />
                  Contact أساس (Asas) Accounting System support
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
