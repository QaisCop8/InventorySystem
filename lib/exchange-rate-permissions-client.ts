import { storedPermissionGranted } from "@/lib/permission-approval-client"
import { EXCHANGE_RATE_PERMISSIONS } from "@/lib/transaction-permission-definitions"

export type ExchangeRateAccess = { add: boolean; edit: boolean; editPast: boolean }

// صلاحيات أسعار الصرف من قائمة صلاحيات المستخدم المخزّنة (للفرع النشط) — لإخفاء/تعطيل الأزرار فقط، والخادم يفرضها
// (lib/exchange-rate-access.ts). صلاحية غير معروفة بعد (قائمة لم تُحدَّث) ⇐ مسموحة ويقرر الخادم.
export function readExchangeRateAccess(): ExchangeRateAccess {
  if (typeof window === "undefined") return { add: true, edit: true, editPast: true }
  let userId: string | null = null
  let branchId: string | null = null
  try {
    const user = JSON.parse(sessionStorage.getItem("erp_user") || localStorage.getItem("erp_user") || "null")
    userId = user?.id ?? user?.user_id ?? null
    const branch = JSON.parse(sessionStorage.getItem("erp_active_branch") || localStorage.getItem("erp_active_branch") || "null")
    branchId = branch?.id ?? user?.branchId ?? user?.branch_id ?? null
  } catch {
    // تخزين غير صالح: يقرر الخادم
  }
  const granted = (name: string) => storedPermissionGranted(userId, branchId, name) !== false
  return {
    add: granted(EXCHANGE_RATE_PERMISSIONS.add),
    edit: granted(EXCHANGE_RATE_PERMISSIONS.edit),
    editPast: granted(EXCHANGE_RATE_PERMISSIONS.editPast),
  }
}
