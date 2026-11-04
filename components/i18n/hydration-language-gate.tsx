"use client"

import { useEffect, useState, type ReactNode } from "react"

// النصوص تُترجم في المتصفح فقط (القاموس على window): بالإنجليزية تُعرض الصفحة بعد التحميل لا من الخادم،
// وإلا تختلف نصوص الخادم (عربية) عن نصوص المتصفح فيفشل الربط (hydration). بالعربية لا تغيير.
export function HydrationLanguageGate({ language, children }: { language: "ar" | "en"; children: ReactNode }) {
  const [mounted, setMounted] = useState(language !== "en")
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <>{children}</> : null
}
