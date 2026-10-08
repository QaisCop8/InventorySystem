"use client"

import type { ReactNode } from "react"
import { Lock } from "lucide-react"
import { useReportAccess } from "./use-report-access"
import { reportPermissionNameFor } from "@/lib/report-permission-definitions"

/** يمنع فتح تقرير لا يملك المستخدم صلاحية استعلامه في الفرع النشط (حتى لو فُتح برابط أو تبويب محفوظ). */
export function ReportAccessGate({ section, children }: { section: string; children: ReactNode }) {
  const canOpenReport = useReportAccess()
  if (canOpenReport(section)) return <>{children}</>
  return (
    <div dir="rtl" className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h2 className="text-lg font-bold text-amber-900">لا توجد صلاحية</h2>
        <p className="mt-1 text-sm text-amber-800">لا يوجد لديك صلاحية "{reportPermissionNameFor(section)}" في الفرع الحالي. تواصل مع مسؤول النظام لمنحك الصلاحية.</p>
      </div>
    </div>
  )
}
