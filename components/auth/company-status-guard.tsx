"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"

// نفس فكرة isApprovedTenantDb بـlib/database.ts (يقطع وصول البيانات فقط، بصمت — يُبدِّل قاعدة
// الشركة الموقوفة/منتهية الاشتراك للقاعدة الافتراضية دون أي إعلام) لكن بمستوى الواجهة: يتحقق دورياً
// من حالة الشركة الحالية (tenant_db) عبر /api/management/company-status، ويُحوِّل المستخدم صراحة
// لصفحة اختيار الشركة إن أُوقِفت إدارياً أو انتهى اشتراكها، بدل ترك صفحات التطبيق تعمل صامتة على
// بيانات القاعدة الافتراضية الخاطئة.
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 دقائق — يكفي لالتقاط إيقاف/انتهاء يحدث أثناء الجلسة دون إغراق الخادم بطلب مع كل تنقّل صفحة.

export function CompanyStatusGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const redirectedRef = useRef(false)

  useEffect(() => {
    // صفحات الإدارة (اختيار/تسجيل دخول الشركات، لوحة تحكم المنصة) مُستثناة كلياً — هي نفسها الوجهة
    // عند الحظر، فتضمينها بالفحص يُنتِج حلقة تحويل لا نهائية إليها.
    if (pathname?.startsWith("/management")) return

    let cancelled = false

    const check = async () => {
      try {
        const response = await fetch("/api/management/company-status", { cache: "no-store" })
        if (!response.ok || cancelled) return
        const data = await response.json()
        if (!cancelled && data?.blocked && !redirectedRef.current) {
          redirectedRef.current = true
          router.replace("/management/companies")
        }
      } catch {
        // فشل شبكي عابر — لا يُحظَر المستخدم بسببه، تُعاد المحاولة عند الفحص الدوري التالي.
      }
    }

    void check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [pathname, router])

  return null
}
