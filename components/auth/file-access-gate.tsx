"use client"

import type { ReactNode } from "react"
import { Lock } from "lucide-react"
import { FILE_FAMILIES, fileFamilyForSection } from "@/lib/file-permission-definitions"
import { FilePermissionProvider, useFileAccess } from "./use-file-access"

export function FileAccessGate({ section, children }: { section: string; children: ReactNode }) {
  const family = fileFamilyForSection(section)
  const can = useFileAccess(family)
  if (!family) return <>{children}</>
  if (!can("access")) return (
    <div dir="rtl" className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h2 className="text-lg font-bold text-amber-900">لا توجد صلاحية</h2>
        <p className="mt-1 text-sm text-amber-800">لا توجد لديك صلاحية الدخول لشاشة {FILE_FAMILIES[family]} في الفرع الحالي.</p>
      </div>
    </div>
  )
  return <FilePermissionProvider family={family}>{children}</FilePermissionProvider>
}
