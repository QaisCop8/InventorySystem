"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState, type ReactNode } from "react"
import { LogOut } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"

// غلاف وضع التطبيق (مشغّل الكاشير/المطعم — lib/app-mode.ts): الشاشة وحدها بلا القائمة الجانبية ولا الشريط العلوي
// ولا تبويبات الصفحات. يتولّى ما كان الشريط العلوي يفعله في الخلفية: اختيار الفرع النشط (الفرع الافتراضي للمستخدم
// أو أول فرع مسموح)، ويعرض زر «تسجيل الخروج» فقط (يعود لصفحة الدخول) — يُرفض ما دامت في الكاشير فاتورة غير محفوظة
// أو عملية حفظ جارية (window.__noonAppCloseState، نفس فحص زر X في المشغّل).
export function AppModeShell({ children }: { children: ReactNode }) {
  const { user, logout, activeBranchId, setActiveBranchContext } = useAuth()
  const [retry, setRetry] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [blocked, setBlocked] = useState("")

  useEffect(() => {
    if (!blocked) return
    const timer = window.setTimeout(() => setBlocked(""), 4000)
    return () => window.clearTimeout(timer)
  }, [blocked])

  const handleLogout = async () => {
    let state = ""
    try { state = String((window as any).__noonAppCloseState?.() || "") } catch { state = "" }
    if (state === "unsaved") return setBlocked(tr("يوجد فاتورة غير محفوظة — احفظها أو ألغها قبل تسجيل الخروج"))
    if (state === "busy") return setBlocked(tr("يتم الآن حفظ عملية، انتظر حتى تنتهي ثم أعد المحاولة"))
    setLoggingOut(true)
    await logout()
  }

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
      <div className="fixed bottom-2 start-2 z-[60] flex items-center gap-2 print:hidden">
        <button
          type="button"
          title={user?.fullName ? `${tr("تسجيل الخروج")} — ${user.fullName}` : tr("تسجيل الخروج")}
          disabled={loggingOut}
          onClick={handleLogout}
          className="flex h-8 items-center gap-1.5 rounded-full bg-rose-600 px-3 text-xs font-bold text-white shadow-md transition hover:bg-rose-700 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? tr("جارٍ تسجيل الخروج...") : tr("تسجيل الخروج")}
        </button>
        {blocked ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 shadow">{blocked}</span> : null}
      </div>
    </div>
  )
}
