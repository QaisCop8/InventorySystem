"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useAuth } from "./auth-context"
import { LoginPage } from "./login-page"

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermission?: string
}

export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission, login, isLoading } = useAuth()
  // شركة سبق اختيارها لهذا التبويب تحديداً (sessionStorage) أو لتبويب آخر بنفس المتصفح
  // (localStorage، تُقرأ هنا كاحتياط فقط) — إن وُجدت بلا جلسة ERP مطابقة (فشل تسجيل الدخول
  // التلقائي بالبريد)، نعرض نموذج دخول هذه الشركة بعينها بدل تحويل المستخدم بلا داعٍ لتسجيل دخول
  // الإدارة الذي أتى منه أصلاً. بلا أي شركة مُختارة إطلاقاً (لا لهذا التبويب ولا لأي تبويب آخر بنفس
  // المتصفح) — كزيارة مباشرة لـ"/" بلا مرور بشركاتي على متصفح جديد كلياً — الوجهة الوحيدة هي تسجيل
  // دخول الإدارة. الاعتماد على sessionStorage فقط هنا كان يُحوِّل أي تبويب جديد (رابط فُتح بتبويب
  // جديد مثلاً) لتسجيل الدخول خطأً رغم وجود جلسة صالحة فعلياً في تبويب آخر من نفس المتصفح.
  const [hasSelectedCompany, setHasSelectedCompany] = useState(false)

  // يُعاد فحصها أيضاً عند تبدّل isAuthenticated (لا مرة واحدة فقط عند التركيب) — logout() يمسح
  // active_tenant_db من كلا التخزينين، فبلا إعادة الفحص هنا تبقى هذه القيمة "true" من آخر تحميل
  // للصفحة فيومض نموذج الدخول المحلي (LoginPage بالأسفل) للحظة قبل أن يكتمل التحويل الفعلي لتسجيل
  // دخول الإدارة.
  useEffect(() => {
    setHasSelectedCompany(!!sessionStorage.getItem("active_tenant_db") || !!localStorage.getItem("active_tenant_db"))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !hasSelectedCompany) {
      window.location.href = "/management/login"
    }
  }, [isLoading, isAuthenticated, hasSelectedCompany])

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

  if (!isAuthenticated && hasSelectedCompany) {
    return (
      <div className="min-h-screen">
        <LoginPage onLogin={login} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400 mx-auto"></div>
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
