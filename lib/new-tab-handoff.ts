"use client"

// فتح قسم في تبويب متصفح جديد مع بيانات لمرة واحدة (فاتورة معبّأة من المساعد الذكي، مستند للعرض...).
// تبويب noopener لا يرث sessionStorage، فتوضع البيانات في localStorage تحت رمز في الرابط (?handoff=)، ثم ينقلها
// التبويب الجديد إلى sessionStorage الخاص به قبل تركيب أي شاشة (adoptNewTabHandoff عند تحميل الوحدة)،
// فتقرؤها الشاشات بنفس الطريقة التي تقرؤها بها داخل نفس التبويب.

const PREFIX = "new-tab-handoff:"
const TTL_MS = 5 * 60_000

export function openSectionInNewTab(section: string, sessionItems: Record<string, string> = {}) {
  const params = new URLSearchParams({ section })
  const company = sessionStorage.getItem("active_company_id")
  if (company) params.set("company", company)
  if (Object.keys(sessionItems).length) {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    try {
      localStorage.setItem(PREFIX + token, JSON.stringify({ items: sessionItems, created_at: Date.now() }))
      params.set("handoff", token)
    } catch { /* التخزين غير متاح ⇐ تُفتح الشاشة بلا البيانات */ }
  }
  window.open(`/?${params}`, "_blank", "noopener,noreferrer")
}

/** في التبويب الجديد: ينقل بيانات الرمز إلى sessionStorage ويحذفها من localStorage، ويُنظّف الرموز القديمة. */
export function adoptNewTabHandoff() {
  if (typeof window === "undefined") return
  try {
    const token = new URLSearchParams(window.location.search).get("handoff")
    if (token) {
      const raw = localStorage.getItem(PREFIX + token)
      if (raw) {
        const value = JSON.parse(raw) as { items?: Record<string, string>; created_at?: number }
        if (Date.now() - Number(value.created_at || 0) <= TTL_MS) {
          for (const [key, item] of Object.entries(value.items || {})) sessionStorage.setItem(key, item)
        }
        localStorage.removeItem(PREFIX + token)
      }
    }
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(PREFIX)) continue
      const created = Number(JSON.parse(localStorage.getItem(key) || "{}")?.created_at || 0)
      if (Date.now() - created > TTL_MS) localStorage.removeItem(key)
    }
  } catch { /* ignore */ }
}

adoptNewTabHandoff()
