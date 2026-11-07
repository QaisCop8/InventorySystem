"use client"

import { tr, appDir } from "@/lib/i18n"
import { useCallback, useMemo, type ReactNode } from "react"
import { Lock } from "lucide-react"
import { useAuth } from "./auth-context"
import {
  canAccessRestaurantScreen,
  canAccessTransactionScreen,
  canAccessUserAdminScreen,
  isUserAdminSection,
  USER_ADMIN_PERMISSION,
  RESTAURANT_SCREEN_SECTION,
  TRANSACTION_FAMILIES,
  transactionFamilyForSection,
  transactionPermissionName,
  type TransactionAccessEntry,
  type TransactionAction,
  type TransactionFamily,
  type VoucherPricingAction,
  voucherPricingPermissionName,
  type VoucherOutputAction,
  isVoucherOutputFamily,
  voucherOutputPermissionName,
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
    // إعدادات المستخدمين والصلاحيات: للمسؤول أو لمن يملك الصلاحية صراحةً (الغياب = منع)
    if (isUserAdminSection(section)) return canAccessUserAdminScreen(entries, user as any)
    const family = transactionFamilyForSection(section)
    return !family || canAccessTransactionScreen(entries, family)
  }, [entries, user])
}

/** يمنع فتح شاشة حركة بلا صلاحية "الدخول لشاشة" في الفرع الحالي (حتى لو فُتحت برابط أو تبويب محفوظ). */
export function TransactionAccessGate({ section, children }: { section: string; children: ReactNode }) {
  const canOpen = useTransactionSectionAccess()
  const family = transactionFamilyForSection(section)
  const userAdmin = isUserAdminSection(section)
  if ((!family && !userAdmin) || canOpen(section)) return <>{children}</>
  return (
    <div dir={appDir()} className="flex h-full min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-8 py-10 text-center">
        <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h2 className="text-lg font-bold text-amber-900">{tr("لا توجد صلاحية")}</h2>
        <p className="mt-1 text-sm text-amber-800">{userAdmin ? tr("هذه الشاشة للمسؤول أو لمن يملك صلاحية \"{0}\".", USER_ADMIN_PERMISSION) : tr("لا توجد لديك صلاحية الدخول لشاشة {0} في الفرع الحالي.", TRANSACTION_FAMILIES[family!])}{tr(" تواصل مع مسؤول النظام لمنحك الصلاحية.")}</p>
      </div>
    </div>
  )
}

/**
 * صلاحية إجراء محدد من صلاحيات الحركات (مثل "تحويل مهمة لمستخدم آخر") للفرع النشط — لإظهار/إخفاء أزرار. الخادم يفرضها.
 * قبل أن تصل الصلاحية لقائمة المستخدم المخزّنة (لم تُحدَّث بعد) يُعاد fallback.
 */
export function useTransactionPermission() {
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
  return useCallback((family: TransactionFamily, action: TransactionAction, fallback = false) => {
    const name = transactionPermissionName(family, action)
    const matches = (entries || []).filter((entry) => String(entry.access_name || "").trim() === name)
    if (!matches.length) return fallback
    return matches.some((entry) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
  }, [entries])
}

// 1/2 = vch_type شاشة الطلبيات (UnifiedSalesOrder: طلبية مبيعات/مشتريات)، 12-19 = شاشة SalesDelivery
const PRICING_VOUCHER_FAMILIES: Record<number, TransactionFamily> = {
  1: "sales_order", 2: "purchase_order",
  12: "sales_invoice", 13: "sales_delivery", 14: "consignment_delivery", 15: "consignment_return", 16: "sales_return",
  17: "purchase_invoice", 18: "purchase_delivery", 19: "purchase_return",
}

/**
 * صلاحيات تسعير أسطر السند (تعديل السعر/خصم الصنف/الخصم العام/نسبة الضريبة) لنوع السند في الفرع النشط.
 * غير موجودة بعد في قائمة المستخدم المخزّنة (لم تُزامَن) ⇐ مسموحة كما كانت.
 */
export function useVoucherPricingPermission(voucherType: number) {
  const { user, activeBranchId, permissionVersion } = useAuth()
  const entries = useMemo<TransactionAccessEntry[] | null>(() => {
    if (!user || typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(`user_Access_List:${user.id}:${activeBranchId || user.branchId || "default"}`)
      const value = raw ? JSON.parse(raw) : null
      return Array.isArray(value) ? value : null
    } catch {
      return null
    }
  }, [user, activeBranchId, permissionVersion])
  return useCallback((action: VoucherPricingAction) => {
    const family = PRICING_VOUCHER_FAMILIES[Number(voucherType)]
    if (!family) return true
    const name = voucherPricingPermissionName(family, action)
    const matches = (entries || []).filter((entry) => String(entry.access_name || "").trim() === name)
    if (!matches.length) return true
    return matches.some((entry) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
  }, [entries, voucherType])
}

/** اسم صلاحية التسعير لرسالة الرفض في الشاشة */
export const voucherPricingPermissionLabel = (voucherType: number, action: VoucherPricingAction) => {
  const family = PRICING_VOUCHER_FAMILIES[Number(voucherType)]
  return family ? voucherPricingPermissionName(family, action) : ""
}

/**
 * طباعة/نسخ/إرسال SMS/إرسال واتساب لسند من نوع family في الفرع النشط. نوع غير مشمول أو صلاحية لم تُزامَن بعد ⇐ مسموحة.
 * يُرجع أيضاً اسم الصلاحية لرسالة الرفض.
 */
export function useVoucherOutputPermission(family: TransactionFamily | null | undefined) {
  const { user, activeBranchId, permissionVersion } = useAuth()
  const entries = useMemo<TransactionAccessEntry[] | null>(() => {
    if (!user || typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(`user_Access_List:${user.id}:${activeBranchId || user.branchId || "default"}`)
      const value = raw ? JSON.parse(raw) : null
      return Array.isArray(value) ? value : null
    } catch {
      return null
    }
  }, [user, activeBranchId, permissionVersion])
  return useCallback((action: VoucherOutputAction) => {
    if (!isVoucherOutputFamily(family)) return true
    const name = voucherOutputPermissionName(family, action)
    const matches = (entries || []).filter((entry) => String(entry.access_name || "").trim() === name)
    if (!matches.length) return true
    return matches.some((entry) => entry.is_granted === true || entry.is_granted === 1 || entry.is_granted === "true")
  }, [entries, family])
}
