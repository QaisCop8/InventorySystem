"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState, type ReactNode } from "react"
import { Lock, LogOut, WifiOff } from "lucide-react"
import { useAuth } from "@/components/auth/auth-context"
import { hasOfflinePassword, offlineLockActive, reconnectAfterOfflineLogin, releaseOfflineLock, saveSessionSnapshot, verifyOfflinePassword, verifyPasswordOnline } from "@/lib/offline-unlock"

// غلاف وضع التطبيق (مشغّل الكاشير/المطعم — lib/app-mode.ts): الشاشة وحدها بلا القائمة الجانبية ولا الشريط العلوي
// ولا تبويبات الصفحات. يتولّى ما كان الشريط العلوي يفعله في الخلفية: اختيار الفرع النشط (الفرع الافتراضي للمستخدم
// أو أول فرع مسموح)، ويعرض زر «تسجيل الخروج» فقط (يعود لصفحة الدخول) — يُرفض ما دامت في الكاشير فاتورة غير محفوظة
// أو عملية حفظ جارية (window.__noonAppCloseState، نفس فحص زر X في المشغّل).
// كل تشغيل للمشغّل (lib/offline-unlock.ts): الجلسة المحفوظة تُقفل بشاشة كلمة المرور — تُطابَق مع البصمة المحلية (تعمل دون اتصال)
// أو على الخادم. يحفظ نسخة الجلسة للدخول دون اتصال من صفحة الدخول، ويُعيد الدخول للخادم عند عودة الاتصال بعد دخول دون اتصال.
export function AppModeShell({ children }: { children: ReactNode }) {
  const { user, logout, activeBranchId, setActiveBranchContext } = useAuth()
  const [retry, setRetry] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [blocked, setBlocked] = useState("")
  const [locked, setLocked] = useState(false)

  const [syncWarning, setSyncWarning] = useState(false)

  useEffect(() => { setLocked(offlineLockActive()) }, [])

  useEffect(() => { if (user?.id && activeBranchId) saveSessionSnapshot() }, [user?.id, activeBranchId])

  useEffect(() => {
    let running = false
    const reconnect = async () => {
      if (running || !navigator.onLine) return
      running = true
      const result = await reconnectAfterOfflineLogin().catch(() => "offline" as const)
      running = false
      if (result === "failed") setSyncWarning(true)
    }
    void reconnect()
    window.addEventListener("online", reconnect)
    return () => window.removeEventListener("online", reconnect)
  }, [])

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

  if (locked && user) {
    return <OfflineUnlock user={user} onUnlock={() => { releaseOfflineLock(); setLocked(false) }} onSwitchUser={() => logout()} />
  }

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
        {syncWarning ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 shadow">{tr("عاد الاتصال — سجّل الخروج ثم الدخول لمزامنة مبيعات دون الاتصال")}</span> : null}
        {blocked ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 shadow">{blocked}</span> : null}
      </div>
    </div>
  )
}

// شاشة فتح الجلسة عند تشغيل المشغّل: البصمة المحلية أولاً (دون اتصال)، وإلا الخادم متصلاً. 5 محاولات خاطئة ⇐ انتظار 30 ثانية.
function OfflineUnlock({ user, onUnlock, onSwitchUser }: { user: { fullName?: string; email?: string; username?: string }; onUnlock: () => void; onSwitchUser: () => void }) {
  const identities = [user.email, user.username]
  const hasLocal = hasOfflinePassword(identities)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [checking, setChecking] = useState(false)
  const [failures, setFailures] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update) }
  }, [])

  const submit = async () => {
    if (checking || !password) return
    const remaining = Math.ceil((waitUntil - Date.now()) / 1000)
    if (remaining > 0) return setError(tr("محاولات كثيرة — حاول بعد") + ` ${remaining} ` + tr("ثانية"))
    setChecking(true)
    let ok = await verifyOfflinePassword(identities, password)
    if (!ok && navigator.onLine && user.email) {
      const remote = await verifyPasswordOnline(user.email, password)
      if (remote === "ok") ok = true
      else if (remote === "offline" && !hasLocal) {
        setChecking(false)
        return setError(tr("لا يوجد اتصال بالإنترنت — لم يُحفظ دخول دون اتصال لهذا المستخدم"))
      }
    }
    setChecking(false)
    if (ok) return onUnlock()
    const count = failures + 1
    setFailures(count >= 5 ? 0 : count)
    if (count >= 5) setWaitUntil(Date.now() + 30_000)
    setPassword("")
    setError(tr("كلمة المرور غير صحيحة"))
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-emerald-800 to-emerald-950 p-4" dir={appDir()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex flex-col items-center gap-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Lock className="h-7 w-7" /></div>
          <h1 className="text-lg font-bold">{tr("تسجيل الدخول")}</h1>
          {online ? null : <p className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"><WifiOff className="h-3.5 w-3.5" />{tr("لا يوجد اتصال بالإنترنت — دخول دون اتصال")}</p>}
          <p className="text-sm text-muted-foreground">{user.fullName || user.email || user.username}</p>
        </div>
        {hasLocal || online ? (
          <form onSubmit={(event) => { event.preventDefault(); void submit() }} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError("") }}
              placeholder={tr("كلمة المرور")}
              className="h-11 w-full rounded-lg border px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 dark:bg-slate-800"
            />
            {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
            <button type="submit" disabled={checking || !password} className="h-11 w-full rounded-lg bg-emerald-700 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50">
              {checking ? tr("جارٍ التحقق...") : tr("دخول")}
            </button>
          </form>
        ) : (
          <p className="rounded-lg bg-rose-50 p-3 text-center text-sm font-semibold text-rose-700">{tr("لم يُحفظ دخول دون اتصال لهذا المستخدم — اتصل بالإنترنت وسجّل الدخول مرة واحدة")}</p>
        )}
        {online || hasLocal ? (
          <button type="button" onClick={onSwitchUser} className="mt-3 w-full text-center text-xs font-semibold text-emerald-700 hover:underline">{tr("تسجيل الدخول بحساب آخر")}</button>
        ) : null}
      </div>
    </div>
  )
}
