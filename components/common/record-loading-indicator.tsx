"use client"

import { tr, appDir } from "@/lib/i18n"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

// مؤشر تحميل عام عند فتح سجل (سند، عميل، صنف...) من القوائم بنقرة مزدوجة أو «عرض»: كل شاشات السندات تجلب
// السجل بـ GET /api/<الشاشة>/<المعرّف> قبل فتحه، وسند كبير قد يتأخر فيظن المستخدم أن النظام لا يستجيب.
// بدل تعديل كل شاشة: يُراقَب fetch مرة واحدة — طلب بهذا النمط يتأخر أكثر من ربع ثانية يُظهر نافذة «جارٍ التحميل»
// تمنع النقر المتكرر حتى يكتمل.

const RECORD_URL = /^\/api\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\/\d+(?:\?|$)/i
// طلبات خلفية دورية لا علاقة لها بفتح سجل
const BACKGROUND_URL = /^\/api\/(chat|notifications|messaging|customer-notifications|work-alerts|briefing|license|company-status)\b/i
const SHOW_AFTER_MS = 250
export const BACKGROUND_FETCH_HEADER = "x-background-fetch"
const GIVE_UP_MS = 60_000

function recordPath(input: RequestInfo | URL, init?: RequestInit): string | null {
  const method = String(init?.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase()
  if (method !== "GET") return null
  // جلب خلفي لسجل (حساب افتراضي عند تهيئة شاشة...) لا يفتح سجلاً: الترويسة BACKGROUND_FETCH_HEADER تستثنيه من النافذة
  if (init?.headers && new Headers(init.headers).has(BACKGROUND_FETCH_HEADER)) return null
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  let path = raw
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return null
    path = url.pathname + url.search
  } catch {
    return null
  }
  return RECORD_URL.test(path) && !BACKGROUND_URL.test(path) ? path : null
}

export function RecordLoadingIndicator() {
  const [pending, setPending] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const previousFetch = window.fetch
    const patched = ((input: RequestInfo | URL, init?: RequestInit) => {
      const path = recordPath(input, init)
      if (!path) return previousFetch(input, init)
      setPending((count) => count + 1)
      let settled = false
      const done = () => { if (!settled) { settled = true; setPending((count) => Math.max(0, count - 1)) } }
      const giveUp = window.setTimeout(done, GIVE_UP_MS)
      return previousFetch(input, init).finally(() => { window.clearTimeout(giveUp); done() })
    }) as typeof window.fetch
    window.fetch = patched
    return () => { if (window.fetch === patched) window.fetch = previousFetch }
  }, [])

  // يظهر فقط إن تأخر الطلب (فتح سريع لا يومض بالنافذة)
  useEffect(() => {
    if (!pending) { setVisible(false); return }
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [pending > 0])

  if (!visible) return null
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/25 backdrop-blur-[1px]" dir={appDir()} role="status" aria-live="polite"
      onMouseDown={(event) => event.preventDefault()} onDoubleClick={(event) => event.preventDefault()}>
      <div className="flex items-center gap-3 rounded-2xl border bg-background px-6 py-4 shadow-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <div>
          <div className="text-sm font-semibold">{tr("جارٍ التحميل...")}</div>
          <div className="text-xs text-muted-foreground">{tr("يرجى الانتظار حتى يُفتح السجل")}</div>
        </div>
      </div>
    </div>
  )
}
