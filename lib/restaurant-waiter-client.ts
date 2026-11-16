"use client"

// النادل على جهاز مشترك (المتصفح): رمز العمل الصادر بعد إدخال PIN يُحفظ لهذا التبويب (sessionStorage) ويُضاف
// تلقائياً لكل طلبات /api/restaurant/* بالترويسة x-restaurant-waiter (lib/restaurant-waiters.ts على الخادم).
// انتهاء جلسة النادل على الخادم (401 waiter_session_ended) يمسح الرمز ويُطلق حدثاً لتعود الشاشة للقفل.

const HEADER = "x-restaurant-waiter"
const STORAGE_KEY = "restaurant-waiter-session"
export const WAITER_ENDED_EVENT = "restaurant-waiter-ended"
export type WaiterSession = { token: string; user: { id: string; name: string } }

export function getWaiterSession(): WaiterSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const value = raw ? JSON.parse(raw) : null
    return value?.token && value?.user?.id ? value : null
  } catch { return null }
}

export function setWaiterSession(session: WaiterSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* تبويب خاص بلا تخزين: تبقى الجلسة حتى إعادة التحميل فقط */ }
  memory = session
}

let memory: WaiterSession | null = null
let installed = false

/** يثبَّت مرة: يضيف رمز النادل لطلبات المطعم ويلتقط انتهاء جلسته */
export function installWaiterFetch() {
  if (installed || typeof window === "undefined") return
  installed = true
  memory = getWaiterSession()
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const path = url.startsWith("http") ? (() => { try { return new URL(url).pathname } catch { return url } })() : url
    const session = memory || getWaiterSession()
    if (!session || !path.startsWith("/api/restaurant/")) return original(input, init)
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    if (!headers.has(HEADER)) headers.set(HEADER, session.token)
    const response = await original(input, { ...init, headers })
    if (response.status === 401) {
      const body = await response.clone().json().catch(() => null)
      if (body?.code === "waiter_session_ended") {
        setWaiterSession(null)
        window.dispatchEvent(new CustomEvent(WAITER_ENDED_EVENT))
      }
    }
    return response
  }
}
