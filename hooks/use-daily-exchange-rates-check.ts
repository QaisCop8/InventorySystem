"use client"

import { useEffect, useRef, useState } from "react"

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // كل 30 دقيقة

// يفحص دورياً (عند التحميل، ثم كل 30 دقيقة) إن كانت أي عملة نشطة (عدا العملة الرئيسية، الثابتة
// دوماً عند 1) بلا سعر صرف مسجَّل لهذا اليوم تحديداً — ويفتح نافذة الإدخال تلقائياً عند وجود نقص،
// حتى لا يُصدر أحد سندات بأسعار صرف قديمة دون انتباه.
export function useDailyExchangeRatesCheck() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const startedRef = useRef(false)

  const checkNow = async () => {
    try {
      const res = await fetch("/api/exchange-rates")
      if (!res.ok) return
      const data = await res.json()
      const list: any[] = Array.isArray(data?.rates) ? data.rates : []
      if (list.length === 0) return

      const baseId = Math.min(...list.map((r) => Number(r.currency_id)))
      const today = new Date().toISOString().slice(0, 10)

      const missing = list.some((r) => {
        if (r.is_active === false) return false
        if (Number(r.currency_id) === baseId) return false
        const rateDate = r.rate_date ? String(r.rate_date).slice(0, 10) : null
        return rateDate !== today
      })

      if (missing) setDialogOpen(true)
    } catch {
      // تجاهل أخطاء الفحص الدوري بصمت — ليست حرجة، والمحاولة التالية (خلال 30 دقيقة) ستُعيد الكرّة
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    checkNow()
    const interval = setInterval(checkNow, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { dialogOpen, setDialogOpen, checkNow }
}
