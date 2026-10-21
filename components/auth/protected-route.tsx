"use client"

import type React from "react"

import { useEffect } from "react"
import { useAuth } from "./auth-context"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermission?: string
}

// بلا جلسة ERP يُحوَّل المستخدم دائماً إلى مسار الإدارة: "شركاتي" (إن كانت جلسة الإدارة سارية يختار الشركة مباشرة، وإلا
// تحوّله تلك الصفحة لتسجيل دخول الإدارة). كان يُعرض سابقاً نموذج دخول الشركة القديم (LoginPage) لمتصفح يتذكر شركة
// اختيرت سابقاً — لكنه يطلب اسم مستخدم/كلمة مرور داخل قاعدة الشركة، ومستخدمو المنصة يدخلون بالبريد عبر الإدارة ثم
// يفتحون الشركة، فكان الدخول منه يفشل (خاصة على الجوال الذي فُتح عليه النظام سابقاً) ويظهر بتصميم قديم.
export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission, isLoading } = useAuth()

  useEffect(() => {
    if (isLoading || isAuthenticated) return
    // جهاز/متصفح جديد بلا جلسة: نسأل الخادم عن جلسة الإدارة أولاً — بدونها نذهب لتسجيل الدخول مباشرة بدل فتح
    // "شركاتي" ثم التحويل منها (كان يظهر شاشة الإدارة لحظة ثم صفحة الدخول).
    let cancelled = false
    fetch("/api/management/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((session) => {
        if (cancelled) return
        window.location.replace(session ? (session.isPlatformAdmin ? "/management/admin" : "/management/companies") : "/management/login")
      })
    return () => { cancelled = true }
  }, [isLoading, isAuthenticated])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-blue-50 to-emerald-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="text-gray-600 text-lg">جاري تحميل النظام...</p>
          <p className="text-gray-500 text-sm">يرجى الانتظار</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#050b14] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto"></div>
          <p className="text-slate-300 text-lg">جاري التحويل إلى تسجيل الدخول...</p>
        </div>
      </div>
    )
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    console.log(" User lacks required permission:", requiredPermission)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-red-600">غير مصرح</h2>
          <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذا القسم</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
