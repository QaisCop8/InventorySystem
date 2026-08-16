"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { LoginPage } from "@/components/auth/login-page"

export default function ManagementLoginPage() {
  const router = useRouter()

  const handleLogin = async (credentials: { username: string; password: string; rememberMe: boolean }) => {
    const response = await fetch("/api/management/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: credentials.username, password: credentials.password }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || "حدث خطأ في تسجيل الدخول")
    }

    // لا نختار أول شركة تلقائياً: قد يكون للمستخدم عدة قواعد. شاشة "شركاتي" تعرض فقط الروابط
    // الموجودة في management.user_company، ومنها يحدد المستخدم قاعدة العمل الحالية.
    router.push("/management/companies")
  }

  return <LoginPage usernameDirection="ltr" onLogin={handleLogin} footer={<Link href="/management/signup" className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800">إنشاء مستخدم جديد</Link>} />
}
