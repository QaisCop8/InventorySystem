"use client"

import { useAuth } from "@/components/auth/auth-context"
import { TaskAdmin } from "./task-admin"

export default function TaskOrdersAdminPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "مدير النظام"

  return (
    <div dir="rtl" className="w-full space-y-4 p-1">
      <div>
        <h1 className="text-xl font-bold text-slate-800">إدارة الأقسام وسير العمل</h1>
        <p className="text-sm text-slate-500">تعريف الأقسام وأعضائها، وبناء مخطط سير العمل بخطواته وانتقالاته</p>
      </div>

      {isAdmin ? (
        <TaskAdmin />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">هذه الصفحة متاحة لمدير النظام فقط</div>
      )}
    </div>
  )
}
