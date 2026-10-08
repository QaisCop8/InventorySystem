"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // كل 30 دقيقة

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// مفتاح "تمت معالجة نافذة أسعار اليوم" لكل شركة ويوم — بعد إغلاقها (حفظ أو إلغاء) لا تُفتح تلقائياً
// مرة أخرى في نفس اليوم؛ يبقى فتحها يدوياً من زر الشريط العلوي متاحاً دائماً.
function handledKey(day = localDateKey()) {
  let company = "default"
  try { company = sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db") || "default" } catch { /* ignore */ }
  return `fx-daily-check:${company}:${day}`
}
const wasHandledToday = () => { try { return localStorage.getItem(handledKey()) === "1" } catch { return false } }
const markHandledToday = () => { try { localStorage.setItem(handledKey(), "1") } catch { /* ignore */ } }

// يفحص (عند التحميل، ثم كل 30 دقيقة) إن كانت أي عملة نشطة (عدا العملة الرئيسية، الثابتة دوماً عند 1)
// بلا سعر صرف مسجَّل لليوم — ويفتح نافذة الإدخال تلقائياً مرة واحدة فقط في اليوم عند وجود نقص، حتى لا
// يُصدر أحد سندات بأسعار صرف قديمة دون انتباه.
export function useDailyExchangeRatesCheck() {
  const [dialogOpen, setDialogOpenState] = useState(false)
  const startedRef = useRef(false)
  const openRef = useRef(false)

  const checkNow = useCallback(async () => {
    try {
      if (openRef.current || wasHandledToday()) return
      const res = await fetch("/api/exchange-rates")
      if (!res.ok) return
      const data = await res.json()
      const list: any[] = Array.isArray(data?.rates) ? data.rates : []
      if (list.length === 0) return

      const baseId = Math.min(...list.map((r) => Number(r.currency_id)))
      const today = localDateKey()

      const missing = list.some((r) => {
        if (r.is_active === false) return false
        if (Number(r.currency_id) === baseId) return false
        const rateDate = r.rate_date ? String(r.rate_date).slice(0, 10) : null
        return rateDate !== today
      })

      if (missing && !openRef.current && !wasHandledToday()) {
        openRef.current = true
        setDialogOpenState(true)
      }
    } catch {
      // تجاهل أخطاء الفحص الدوري بصمت — ليست حرجة، والمحاولة التالية (خلال 30 دقيقة) ستُعيد الكرّة
    }
  }, [])

  // إغلاق النافذة (بعد الحفظ أو الإلغاء) يعني أن المستخدم رآها اليوم — لا تُفتح تلقائياً ثانيةً اليوم.
  const setDialogOpen = useCallback((open: boolean) => {
    openRef.current = open
    if (!open) markHandledToday()
    setDialogOpenState(open)
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void checkNow()
    const interval = setInterval(() => void checkNow(), CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [checkNow])

  return { dialogOpen, setDialogOpen, checkNow }
}
