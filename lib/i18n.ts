// الترجمة (عربي/إنجليزي): المفتاح هو النص العربي نفسه — tr("حفظ") ⇐ "Save" عند اختيار الإنجليزية، وإلا النص كما هو.
// - اللغة في كوكي app_lang (يقرؤها الخادم في app/layout.tsx لضبط <html lang dir>) — تغييرها يعيد تحميل الصفحة، فالنصوص
//   المحسوبة مرة عند تحميل الوحدات (ثوابت التسميات) تُحسب باللغة الجديدة.
// - القاموس الإنجليزي (public/locales/en.js ← window.__I18N_EN) يُحمَّل قبل تشغيل التطبيق فقط لمن اختار الإنجليزية.
// - على الخادم tr() تعيد النص الأصلي دائماً: أي نص يُحفظ أو يُقارن أو يُرسل للخادم يبقى عربياً كما كان.
// - نصوص فيها قيم متغيرة: tr("تم حفظ الفاتورة {0}", code) — والقاموس يترجم القالب بالمواضع نفسها.

export type AppLanguage = "ar" | "en"

export const LANG_COOKIE = "app_lang"

type Dictionary = Record<string, string>
type Pattern = { regex: RegExp; template: string; slots: number[] }

declare global {
  interface Window {
    __I18N_EN?: Dictionary
  }
}

let cachedLanguage: AppLanguage | null = null

export function readLanguageCookie(cookieHeader: string | null | undefined): AppLanguage {
  const match = /(?:^|;\s*)app_lang=(ar|en)\b/.exec(String(cookieHeader || ""))
  return match?.[1] === "en" ? "en" : "ar"
}

export function currentLanguage(): AppLanguage {
  if (typeof window === "undefined") return "ar"
  if (!cachedLanguage) cachedLanguage = readLanguageCookie(document.cookie)
  return cachedLanguage
}

export const isEnglish = () => currentLanguage() === "en"

/** اتجاه الواجهة للغة الحالية — للعناصر التي تحتاج dir صريحاً (نوافذ، مكتبات طرف ثالث). */
export const appDir = (): "rtl" | "ltr" => (isEnglish() ? "ltr" : "rtl")

/** يحفظ اللغة (سنة) ويعيد تحميل الصفحة لتطبيقها على كل الشاشات. */
export function setLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return
  document.cookie = `${LANG_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`
  try { localStorage.setItem(LANG_COOKIE, language) } catch { /* ignore */ }
  window.location.reload()
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim()

let dictionary: Dictionary | null = null
let patterns: Pattern[] | null = null

function loadDictionary(): Dictionary {
  if (dictionary) return dictionary
  const source = typeof window !== "undefined" ? window.__I18N_EN : undefined
  if (!source) return {}
  dictionary = {}
  for (const [key, value] of Object.entries(source)) dictionary[normalize(key)] = value
  return dictionary
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// قوالب {0} {1}: لترجمة نص وصل جاهزاً (رسائل الخادم) — "رقم الهوية 123 مكرر" يطابق "رقم الهوية {0} مكرر"
function loadPatterns(): Pattern[] {
  if (patterns) return patterns
  patterns = []
  for (const [key, template] of Object.entries(loadDictionary())) {
    if (!/\{\d+\}/.test(key)) continue
    const slots: number[] = []
    const source = key.split(/(\{\d+\})/).map((part) => {
      const slot = /^\{(\d+)\}$/.exec(part)
      if (!slot) return escapeRegex(part)
      slots.push(Number(slot[1]))
      return "([\\s\\S]+?)"
    }).join("")
    patterns.push({ regex: new RegExp(`^${source}$`), template, slots })
  }
  // الأطول أولاً: القالب الأكثر تحديداً يسبق الأعم
  patterns.sort((a, b) => b.regex.source.length - a.regex.source.length)
  return patterns
}

function format(template: string, args: unknown[]) {
  return args.length ? template.replace(/\{(\d+)\}/g, (whole, index) => (Number(index) < args.length ? String(args[Number(index)] ?? "") : whole)) : template
}

/** ترجمة نص عرض. text = النص العربي (المفتاح)؛ args تعوّض {0} {1}... */
export function tr(text: string, ...args: unknown[]): string {
  if (currentLanguage() !== "en" || !text) return format(text, args)
  const key = normalize(text)
  const translated = loadDictionary()[key]
  if (translated === undefined) return format(text, args)
  // المسافات حول النص الأصلي (نص JSX بجانب قيمة) تبقى كما هي
  const leading = /^\s*/.exec(text)?.[0] || ""
  const trailing = /\s*$/.exec(text)?.[0] || ""
  return leading + format(translated, args) + trailing
}

/** ترجمة نص جاهز (رسالة من الخادم، قيمة مخزنة): مطابقة مباشرة ثم بالقوالب {0}. */
export function translateText(text: string): string {
  if (currentLanguage() !== "en" || !text || !/[؀-ۿ]/.test(text)) return text
  const key = normalize(text)
  const direct = loadDictionary()[key]
  if (direct !== undefined) return direct
  for (const pattern of loadPatterns()) {
    const match = pattern.regex.exec(key)
    if (!match) continue
    const values: string[] = []
    pattern.slots.forEach((slot, index) => { values[slot] = translateText(match[index + 1]) })
    return format(pattern.template, values)
  }
  // رسائل مركّبة من جمل مفصولة بـ — أو سطر جديد
  for (const separator of [" — ", "\n", "، "]) {
    if (key.includes(separator) || text.includes(separator)) {
      const parts = text.split(separator)
      const translated = parts.map((part) => translateText(part))
      if (translated.some((part, index) => part !== parts[index])) return translated.join(separator === "، " ? ", " : separator)
    }
  }
  return text
}

/**
 * هل يحوي النص أحد المقاطع (بالعربية أو بترجمتها)؟ للكود الذي يفحص محتوى رسالة (مثل تلوين رسالة نجاح بـ"تم حفظ")
 * فيعمل باللغتين — mode: "includes" | "startsWith".
 */
export function textMatches(text: string, fragments: string[], mode: "includes" | "startsWith" = "includes"): boolean {
  const value = String(text || "")
  const test = (fragment: string) => (mode === "startsWith" ? value.startsWith(fragment) : value.includes(fragment))
  return fragments.some((fragment) => test(fragment) || (isEnglish() && test(normalize(tr(fragment)))))
}

const MESSAGE_FIELDS = new Set(["error", "message", "warning", "title", "description", "detail", "reason", "hint"])

const LIST_FIELDS = new Set(["errors", "warnings", "issues"])

/**
 * يترجم رسائل رد JSON من الخادم: حقول الرسائل في المستوى الأعلى فقط (error/message/...) وقوائم errors/warnings.
 * لا يلمس صفوف البيانات أبداً (وصف/عنوان سجل قد يُعدَّل ويُحفظ مجدداً فيُكتب مترجماً في قاعدة البيانات).
 */
export function translatePayload(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && MESSAGE_FIELDS.has(key)) out[key] = translateText(item)
    else if (LIST_FIELDS.has(key) && Array.isArray(item) && item.length <= 500) {
      out[key] = item.map((entry) => {
        if (typeof entry === "string") return translateText(entry)
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry
        const row = { ...(entry as Record<string, unknown>) }
        for (const field of ["error", "message", "warning", "reason"]) if (typeof row[field] === "string") row[field] = translateText(row[field] as string)
        return row
      })
    } else out[key] = item
  }
  return out
}
