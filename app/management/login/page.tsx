"use client"

import { tr } from "@/lib/i18n"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ManagementLogin } from "@/components/auth/management-login"
import { loginOffline, rememberOfflinePassword } from "@/lib/offline-unlock"

export default function ManagementLoginPage() {
  const router = useRouter()

  // جلسة إدارة سارية (فُتح الرابط وأنت مسجّل) ⇐ "شركاتي" مباشرة بدل طلب الدخول مرة أخرى
  useEffect(() => {
    let cancelled = false
    fetch("/api/management/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => { if (!cancelled && session) router.replace(session.isPlatformAdmin ? "/management/admin" : "/management/companies") })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [router])

  const handleLogin = async (credentials: { username: string; password: string; rememberMe: boolean }) => {
    let response: Response
    try {
      response = await fetch("/api/management/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: credentials.username, password: credentials.password }),
      })
    } catch {
      // دون اتصال (تطبيق الكاشير/المطعم): دخول آخر مستخدم بكلمة مرور مطابقة للبصمة المحفوظة — lib/offline-unlock.ts
      const offline = await loginOffline(credentials.username, credentials.password)
      if (!offline.ok) throw new Error(tr(offline.error))
      window.location.href = "/"
      return
    }

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || tr("حدث خطأ في تسجيل الدخول"))
    }
    // تطبيق الكاشير/المطعم: فتح القفل لاحقاً دون اتصال بنفس كلمة المرور
    await rememberOfflinePassword(credentials.username, credentials.password)

    // مسؤول المنصة ينتقل إلى لوحة الإدارة؛ بقية المستخدمين يختارون الشركة من "شركاتي".
    router.push(data.user?.is_platform_admin ? "/management/admin" : "/management/companies")
  }

  return <ManagementLogin onLogin={handleLogin} footer={<Link href="/management/signup" className="font-semibold text-emerald-300 transition-colors hover:text-emerald-200">{tr("إنشاء مستخدم جديد")}</Link>} />
}
