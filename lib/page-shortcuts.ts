// اختصارات فتح الصفحات المخصّصة لكل مستخدم (شاشة "اختصارات الصفحات" ⇐ user_settings.page_shortcuts).
// الخريطة: section ⇐ combo مثل "Ctrl+Alt+S". المفتاح يُقرأ من event.code (موضع المفتاح الفعلي) لا event.key،
// فيعمل الاختصار نفسه بلوحة المفاتيح العربية والإنجليزية.

import type { KeyboardEvent as ReactKeyboardEvent } from "react"

export type PageShortcuts = Record<string, string>

export const PAGE_SHORTCUTS_CHANGED = "page-shortcuts-changed"

/** أثناء تسجيل اختصار في شاشة الاختصارات: لا تُفتح أي صفحة بالضغطة (تخص التسجيل وحده). */
export const shortcutRecording = { active: false }

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"])

const keyFromCode = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `Num${code.slice(6)}`
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return null
}

/** الاختصار من ضغطة مفتاح، أو null لمفتاح غير مدعوم (مفاتيح التعديل وحدها، الأسهم، الرموز...). */
export function comboFromEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) return null
  const key = keyFromCode(event.code)
  if (!key) return null
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")
  parts.push(key)
  return parts.join("+")
}

// اختصارات النظام نفسه (lib/hotkeys.ts، components/global-shortcuts.tsx) ومفاتيح التحرير داخل الحقول
const APP_RESERVED: Record<string, string> = {
  F2: "البحث داخل الشاشات", F3: "حفظ", F4: "نسخ", F5: "جديد", F6: "استعلام", F9: "حذف",
  "Ctrl+S": "حفظ", "Ctrl+P": "طباعة", "Ctrl+K": "البحث الشامل", "Ctrl+O": "طلبيات المبيعات",
  "Alt+T": "البحث عن العملاء والموردين", "Alt+S": "البحث عن الأصناف",
  "Ctrl+C": "نسخ النص", "Ctrl+V": "لصق", "Ctrl+X": "قص", "Ctrl+Z": "تراجع", "Ctrl+Y": "إعادة", "Ctrl+A": "تحديد الكل",
}
// يُنفّذها Chrome نفسه قبل أن تصل للصفحة (لا يمكن لأي موقع منعها) — بقية اختصارات المتصفح تُلغى عند تعيينها لصفحة
const BROWSER_LOCKED: Record<string, string> = {
  "Ctrl+W": "إغلاق التبويب", "Ctrl+T": "تبويب جديد", "Ctrl+N": "نافذة جديدة", "Ctrl+F4": "إغلاق التبويب", "Alt+F4": "إغلاق النافذة",
  "Ctrl+Shift+N": "نافذة خاصة", "Ctrl+Shift+T": "إعادة فتح تبويب", "Ctrl+Shift+W": "إغلاق النافذة", "Ctrl+Shift+Q": "إغلاق المتصفح",
}

const COMBO_PATTERN = /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z]|[0-9]|Num[0-9]|F[1-9]|F1[0-2])$/

export const isWellFormedCombo = (combo: unknown): combo is string => typeof combo === "string" && COMBO_PATTERN.test(combo)

/** سبب رفض الاختصار، أو null إن كان صالحاً. */
export function comboProblem(combo: string): string | null {
  if (!isWellFormedCombo(combo)) return "مفتاح غير مدعوم — استخدم حرفاً أو رقماً أو F1..F12"
  const locked = BROWSER_LOCKED[combo]
  if (locked) return `${combo} (${locked}) يُنفّذه المتصفح نفسه ولا يمكن لأي موقع إيقافه`
  const reserved = APP_RESERVED[combo]
  if (reserved) return `${combo} مستخدم في النظام (${reserved})`
  const isFunctionKey = /(^|\+)F\d+$/.test(combo)
  if (!isFunctionKey && !/^(Ctrl|Alt)\+/.test(combo)) return "يجب أن يبدأ الاختصار بـ Ctrl أو Alt (أو مفتاح F)"
  return null
}

/** يُنظّف خريطة واردة: أقسام نصية، اختصارات صالحة، وبلا تكرار للاختصار نفسه. */
export function sanitizeShortcuts(value: unknown): PageShortcuts {
  const result: PageShortcuts = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return result
  const used = new Set<string>()
  for (const [section, combo] of Object.entries(value as Record<string, unknown>).slice(0, 300)) {
    if (!/^[a-z0-9-]{1,80}$/.test(section) || !isWellFormedCombo(combo) || comboProblem(combo) || used.has(combo)) continue
    used.add(combo)
    result[section] = combo
  }
  return result
}

/** عرض الاختصار بمفاتيح منفصلة (للواجهة). */
export const comboKeys = (combo: string) => combo.split("+")
