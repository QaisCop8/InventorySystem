"use client"

import { useSyncExternalStore } from "react"

// قفل عام أثناء حفظ أي سند: طالما طلب حفظ/تعديل/حذف لسند قيد التنفيذ تُعطَّل القائمة الجانبية فلا يستطيع
// المستخدم فتح صفحة أخرى قبل اكتمال الحفظ. يُفعَّل تلقائياً من تغليف fetch (components/auth/auth-context.tsx)
// فيشمل كل شاشات السندات دون تعديل كل شاشة على حدة.

const VOUCHER_API_ROOTS = new Set([
  "receipts",
  "journal-vouchers",
  "credit-notes",
  "stock-vouchers",
  "sales-vouchers",
  "cheque-payment-vouchers",
  "vouchers",
  "orders",
  "purchase-orders",
  "stock-counts",
  "production-vouchers",
])
// مسارات القراءة/المساعدة التي لا تحفظ سنداً حتى لو كانت POST
const NON_SAVE_SEGMENTS = /(resolve-code|generate-number|navigation|search|voucher-books|check|validate|preview|lookup|draft)/

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export function isVoucherSaveRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  try {
    const method = String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase()
    if (!WRITE_METHODS.has(method)) return false
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
    const pathname = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname
    const segments = pathname.split("/").filter(Boolean)
    if (segments[0] !== "api") return false
    const isPosSale = segments[1] === "pos" && segments[2] === "sales"
    if (!isPosSale && !VOUCHER_API_ROOTS.has(segments[1])) return false
    return !NON_SAVE_SEGMENTS.test(segments.slice(2).join("/"))
  } catch {
    return false
  }
}

let pending = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export function beginSaving() {
  pending += 1
  emit()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    pending = Math.max(0, pending - 1)
    emit()
  }
}

export const isSavingNow = () => pending > 0

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** true أثناء حفظ أي سند. */
export function useSavingLock(): boolean {
  return useSyncExternalStore(subscribe, () => pending > 0, () => false)
}
