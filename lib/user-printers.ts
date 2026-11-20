"use client"

/**
 * الطابعة الافتراضية للمستخدم (2026-11-20) — تُعرَّف في «اعدادات المستخدمين ← اعدادات»:
 *   general: «الطابعة الافتراضية» — كل الصفحات والتقارير والسندات
 *   pos: «الطابعة الافتراضية - كاشير ومطاعم» — إيصال الكاشير، حساب/فاتورة المطعم، قسائم المطبخ بلا طابعة صنف/مجموعة
 * تُطبَّق على الطباعة المباشرة فقط (مشغّل ويندوز NoonERP أو خدمة CashService): نافذة طباعة المتصفح لا تسمح للصفحة
 * باختيار طابعة. فارغة ⇐ طابعة الإعدادات/طابعة ويندوز الافتراضية كما كان. تُحفظ نسخة دقيقتين + آخر قيمة للعمل دون اتصال.
 */
export type PrinterKind = "general" | "pos"
type Printers = { default_printer: string; pos_printer: string }

const STORE_KEY = "noon-user-printers"
let cache: { at: number; value: Promise<Printers> } | null = null

function stored(): Printers {
  try { const value = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); if (value && typeof value === "object") return { default_printer: String(value.default_printer || ""), pos_printer: String(value.pos_printer || "") } } catch { /* بلا تخزين */ }
  return { default_printer: "", pos_printer: "" }
}

function loadPrinters(): Promise<Printers> {
  if (cache && Date.now() - cache.at < 120_000) return cache.value
  const value = fetch("/api/settings/my-printers", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("printers")
      const data = await response.json()
      const printers = { default_printer: String(data?.default_printer || "").trim(), pos_printer: String(data?.pos_printer || "").trim() }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(printers)) } catch { /* بلا تخزين */ }
      return printers
    })
    .catch(() => stored())
  cache = { at: Date.now(), value }
  return value
}

/** يُستدعى بعد حفظ الإعدادات ليُقرأ الجديد فوراً */
export function invalidateUserPrinters() { cache = null }

/** طابعة المستخدم لنوع الطباعة، أو "" (فارغة ⇐ السلوك السابق؛ «كاشير ومطاعم» لا تعود للعامة — غالباً A4 لا إيصال) */
export async function userPrinter(kind: PrinterKind): Promise<string> {
  if (typeof window === "undefined") return ""
  const printers = await loadPrinters()
  return kind === "pos" ? printers.pos_printer : printers.default_printer
}
