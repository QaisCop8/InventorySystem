"use client"

import { useCallback, useEffect, type RefObject } from "react"
import { useWorkspaceTabId } from "@/contexts/workspace-tab-context"

// رسالة نجاح موحّدة بعد حفظ أي حركة ("تمت العملية بنجاح") في مكوّن Messages الخاص بنافذة السند — مثل طلبية المبيعات.
// الشاشة الأم (التي تحفظ) تعلن النجاح، ونافذة السند في نفس تبويب مساحة العمل تعرضه؛ التبويبات الأخرى لا تتأثر.
export const TRANSACTION_SUCCESS_TEXT = "تمت العملية بنجاح"
const EVENT = "TRANSACTION_SAVED"

type Detail = { tabId: string | null; text: string }

/** في الشاشة الأم: دالة تُستدعى بعد نجاح الحفظ. */
export function useAnnounceTransactionSaved() {
  const tabId = useWorkspaceTabId()
  return useCallback((text: string = TRANSACTION_SUCCESS_TEXT) => {
    window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { tabId: tabId ?? null, text } }))
  }, [tabId])
}

/** في نافذة السند: يعرض رسالة النجاح في مكوّن Messages (PrimeReact) المرتبط بالمرجع. */
export function useTransactionSuccessMessages(messagesRef: RefObject<any>) {
  const tabId = useWorkspaceTabId()
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Detail>).detail
      if (!detail || (detail.tabId ?? null) !== (tabId ?? null)) return
      // بعد إعادة الرسم (فتح سند جديد بعد الحفظ قد يمسح الرسائل)
      setTimeout(() => {
        messagesRef.current?.clear?.()
        messagesRef.current?.show?.([{ severity: "success", summary: "", detail: detail.text || TRANSACTION_SUCCESS_TEXT, sticky: false, life: 3500 }])
      }, 60)
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [messagesRef, tabId])
}
