"use client"

import { useAuth } from "@/components/auth/auth-context"
import { TaskAdmin } from "./task-admin"
import { GitBranch, ShieldCheck, Users } from "lucide-react"

export default function TaskOrdersAdminPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "مدير النظام"

  return (
    <div dir="rtl" className="w-full space-y-5 p-1">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-indigo-500 via-violet-500 to-emerald-500" />
        <div className="absolute -left-12 -top-16 h-44 w-44 rounded-full bg-indigo-100/60 blur-3xl" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200">
              <GitBranch className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight !text-slate-900">إدارة الأقسام وسير العمل</h1>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">إدارة التنفيذ</span>
              </div>
              <p className="max-w-3xl text-sm leading-6 !text-slate-500">نظّم فرق العمل وعيّن مسؤولي الأقسام، ثم صمّم مسارات تنفيذ الطلبات ومراحل انتقالها بسهولة.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"><Users className="h-4 w-4 text-indigo-500" />إدارة الفرق</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600"><ShieldCheck className="h-4 w-4 text-emerald-500" />صلاحيات دقيقة</span>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <TaskAdmin />
      ) : (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-10 text-center text-red-700">هذه الصفحة متاحة لمدير النظام فقط</div>
      )}
    </div>
  )
}
