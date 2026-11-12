"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState, type ReactNode } from "react"
import { LogOut } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

// غلاف وضع التطبيق (مشغّل الكاشير/المطعم — lib/app-mode.ts): الشاشة وحدها بلا القائمة الجانبية ولا الشريط العلوي
// ولا تبويبات الصفحات. يتولّى ما كان الشريط العلوي يفعله في الخلفية: اختيار الفرع النشط (الفرع الافتراضي للمستخدم
// أو أول فرع مسموح)، ويعرض زراً صغيراً لتسجيل الخروج فقط.
export function AppModeShell({ children }: { children: ReactNode }) {
  const { user, logout, activeBranchId, setActiveBranchContext } = useAuth()
  const [retry, setRetry] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const tenantDb = sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db")
    if (!tenantDb) {
      if (retry >= 20) return
      const timer = window.setTimeout(() => setRetry((count) => count + 1), 500)
      return () => window.clearTimeout(timer)
    }
    const controller = new AbortController()
    let timer: number | undefined
    void (async () => {
      try {
        const response = await fetch("/api/branches?scope=mine", { signal: controller.signal, cache: "no-store" })
        if (!response.ok) throw new Error("branches")
        const rows = await response.json()
        const branches = Array.isArray(rows) ? rows : []
        if (!branches.length) {
          if (retry < 5) timer = window.setTimeout(() => setRetry((count) => count + 1), 1500)
          return
        }
        if (!activeBranchId || !branches.some((branch: any) => branch.id === activeBranchId)) {
          const branch = branches.find((row: any) => row.id === user.branchId) || branches[0]
          setActiveBranchContext({ id: branch.id, name: branch.branch_name })
        }
      } catch {
        if (!controller.signal.aborted && retry < 5) timer = window.setTimeout(() => setRetry((count) => count + 1), 1500)
      }
    })()
    return () => {
      controller.abort()
      if (timer) window.clearTimeout(timer)
    }
  }, [activeBranchId, setActiveBranchContext, user?.branchId, user?.id, retry])

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background" dir={appDir()}>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{activeBranchId ? children : null}</div>
      <button
        type="button"
        title={tr("تسجيل الخروج")}
        aria-label={tr("تسجيل الخروج")}
        disabled={loggingOut}
        onClick={async () => { setLoggingOut(true); await logout() }}
        className="fixed bottom-2 start-2 z-[60] grid h-8 w-8 place-items-center rounded-full bg-slate-900/60 text-white opacity-60 shadow transition hover:bg-rose-600 hover:opacity-100 disabled:opacity-40 print:hidden"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}
