"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { LoginPage } from "@/components/auth/login-page"
import { activateCompany } from "@/lib/tenant-client"

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
  }

  return <LoginPage onLogin={handleLogin} footer={<Link href="/management/signup" className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800">إنشاء مستخدم جديد</Link>} />
}
