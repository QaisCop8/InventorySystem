import { tr } from "@/lib/i18n"

// وصف مختصر لجهاز جلسة من user-agent («Chrome على Android») لرسالة «حسابك مسجَّل الدخول من جهاز آخر»
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = String(userAgent || "")
  if (!ua) return tr("جهاز غير معروف")
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
      : /SamsungBrowser/.test(ua) ? "Samsung Internet"
        : /FBAN|FBAV|FB_IAB|Messenger/.test(ua) ? "Facebook"
          : /Firefox\//.test(ua) ? "Firefox"
            : /Chrome\//.test(ua) ? "Chrome"
              : /Safari\//.test(ua) ? "Safari"
                : tr("متصفح")
  const system = /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iPhone / iPad"
      : /Windows/.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/.test(ua) ? "Mac"
          : /Linux/.test(ua) ? "Linux"
            : ""
  return system ? tr("{0} على {1}", browser, system) : browser
}

export function formatSessionTime(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
