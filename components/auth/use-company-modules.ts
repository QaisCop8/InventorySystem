"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "./auth-context"
import { moduleForSection, type CompanyModule } from "@/lib/company-modules-shared"

// الوحدات الإضافية المفعّلة للشركة (من إدارة المنصة) — طلب واحد مشترك لكل مستخدم/شركة بين القائمة والتطبيقات والصفحة.
let cache: { key: string; promise: Promise<CompanyModule[]> } | null = null

function loadModules(key: string) {
  if (!cache || cache.key !== key) {
    cache = {
      key,
      promise: fetch("/api/company-modules", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : { modules: [] }))
        .then((data) => (Array.isArray(data?.modules) ? data.modules : []))
        .catch(() => []),
    }
  }
  return cache.promise
}

/** دالة: هل الشاشة متاحة؟ (شاشة بلا وحدة ⇐ دائماً؛ شاشة وحدة ⇐ بعد التأكد أنها مفعّلة) */
export function useCompanyModuleAccess() {
  const { user } = useAuth()
  const [modules, setModules] = useState<CompanyModule[] | null>(null)
  useEffect(() => {
    if (!user?.id) { setModules(null); return }
    let alive = true
    const tenant = typeof window !== "undefined" ? sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db") || "" : ""
    void loadModules(`${user.id}|${tenant}`).then((value) => { if (alive) setModules(value) })
    return () => { alive = false }
  }, [user?.id])
  return useCallback((section: string | null | undefined) => {
    const module = moduleForSection(section)
    return !module || Boolean(modules?.includes(module))
  }, [modules])
}
