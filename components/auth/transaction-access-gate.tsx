"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import { Lock } from "lucide-react"
import { useAuth } from "./auth-context"
import {
  canAccessRestaurantScreen,
  canAccessTransactionScreen,
  RESTAURANT_SCREEN_SECTION,
  TRANSACTION_FAMILIES,
  transactionFamilyForSection,
  type TransactionAccessEntry,
} from "@/lib/transaction-permission-definitions"

/** صلاحية "الدخول لشاشة {الحركة}" للفرع النشط — من نفس قائمة الصلاحيات المخزّنة التي تستخدمها شاشات الملفات. */
export function useTransactionSectionAccess() {
  const { user, activeBranchId, permissionVersion } = useAuth()
  const entries = useMemo<TransactionAccessEntry[] | null>(() => {
    if (!user || typeof window === "undefined") return null
    const branchId = activeBranchId || user.branchId || "default"
    try {
      const raw = localStorage.getItem(`user_Access_List:${user.id}:${branchId}`)
      const value = raw ? JSON.parse(raw) : null
      return Array.isArray(value) ? value : null
    } catch {
      return null
    }
  }, [user, activeBranchId, permissionVersion])
  return useCallback((section: string | null | undefined) => {
    if (section === RESTAURANT_SCREEN_SECTION) return canAccessRestaurantScreen(entries)
    const family = transactionFamilyForSection(section)
    return !family || canAccessTransactionScreen(entries, family)
  }, [entries])
}

/** يمنع فتح شاشة حركة بلا صلاحية "الدخول لشاشة" في الفرع الحالي (حتى لو فُتحت برابط أو تبويب محفوظ). */
export function TransactionAccessGate({ section, children }: { section: string; children: ReactNode }) {
  const canOpen = useTransactionSectionAccess()
  const family = transactionFamilyForSection(section)
  if (!family || canOpen(section)) return <>{children}</>
  return (
    <div dir="rtl" className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h2 className="text-lg font-bold text-amber-900">لا توجد صلاحية</h2>
        <p className="mt-1 text-sm text-amber-800">لا توجد لديك صلاحية الدخول لشاشة {TRANSACTION_FAMILIES[family]} في الفرع الحالي. تواصل مع مسؤول النظام لمنحك الصلاحية.</p>
      </div>
    </div>
  )
}
