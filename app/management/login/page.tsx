"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ManagementLogin } from "@/components/auth/management-login"

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

    // مسؤول المنصة ينتقل إلى لوحة الإدارة؛ بقية المستخدمين يختارون الشركة من "شركاتي".
    router.push(data.user?.is_platform_admin ? "/management/admin" : "/management/companies")
  }

  return <ManagementLogin onLogin={handleLogin} footer={<Link href="/management/signup" className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800">إنشاء مستخدم جديد</Link>} />
}
