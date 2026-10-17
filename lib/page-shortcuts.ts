// اختصارات فتح الصفحات المخصّصة لكل مستخدم (شاشة "اختصارات الصفحات" ⇐ user_settings.page_shortcuts).
// الخريطة: section ⇐ combo مثل "Ctrl+Alt+S". المفتاح يُقرأ من event.code (موضع المفتاح الفعلي) لا event.key،
// فيعمل الاختصار نفسه بلوحة المفاتيح العربية والإنجليزية.

import type { KeyboardEvent as ReactKeyboardEvent } from "react"

export type PageShortcuts = Record<string, string>

export const PAGE_SHORTCUTS_CHANGED = "page-shortcuts-changed"

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

// محجوزة لاختصارات النظام (lib/hotkeys.ts، components/global-shortcuts.tsx) أو للمتصفح نفسه
const RESERVED: Record<string, string> = {
  F1: "مساعدة المتصفح", F2: "البحث داخل الشاشات", F3: "حفظ", F4: "نسخ", F5: "جديد", F6: "استعلام", F9: "حذف", F11: "ملء الشاشة", F12: "أدوات المطوّر",
  "Ctrl+S": "حفظ", "Ctrl+P": "طباعة", "Ctrl+K": "البحث الشامل", "Ctrl+O": "طلبيات المبيعات", "Ctrl+T": "تبويب جديد في المتصفح",
  "Ctrl+N": "نافذة جديدة في المتصفح", "Ctrl+W": "إغلاق تبويب المتصفح", "Ctrl+R": "تحديث الصفحة", "Ctrl+F": "البحث في الصفحة",
  "Ctrl+C": "نسخ", "Ctrl+V": "لصق", "Ctrl+X": "قص", "Ctrl+Z": "تراجع", "Ctrl+Y": "إعادة", "Ctrl+A": "تحديد الكل",
  "Ctrl+L": "شريط العنوان", "Ctrl+H": "سجل المتصفح", "Ctrl+J": "التنزيلات", "Ctrl+D": "إضافة للمفضلة", "Ctrl+U": "مصدر الصفحة",
  "Ctrl+G": "البحث التالي", "Ctrl+E": "البحث في المتصفح", "Ctrl+Shift+I": "أدوات المطوّر", "Ctrl+Shift+J": "أدوات المطوّر",
  "Ctrl+Shift+C": "أدوات المطوّر", "Ctrl+Shift+R": "تحديث الصفحة", "Ctrl+Shift+N": "نافذة خاصة", "Ctrl+Shift+T": "إعادة فتح تبويب",
  "Ctrl+Shift+W": "إغلاق النافذة", "Ctrl+Shift+Q": "إغلاق المتصفح", "Ctrl+Shift+B": "شريط المفضلة", "Ctrl+Shift+Delete": "مسح البيانات",
  "Alt+T": "البحث عن العملاء والموردين", "Alt+S": "البحث عن الأصناف", "Alt+F": "قائمة المتصفح", "Alt+E": "قائمة المتصفح",
  "Alt+D": "شريط العنوان", "Alt+F4": "إغلاق النافذة",
}
for (let digit = 1; digit <= 9; digit += 1) RESERVED[`Ctrl+${digit}`] = "التنقل بين تبويبات المتصفح"

const COMBO_PATTERN = /^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z]|[0-9]|Num[0-9]|F[1-9]|F1[0-2])$/

export const isWellFormedCombo = (combo: unknown): combo is string => typeof combo === "string" && COMBO_PATTERN.test(combo)

/** سبب رفض الاختصار، أو null إن كان صالحاً. */
export function comboProblem(combo: string): string | null {
  if (!isWellFormedCombo(combo)) return "مفتاح غير مدعوم — استخدم حرفاً أو رقماً أو F1..F12"
  const reserved = RESERVED[combo]
  if (reserved) return `${combo} محجوز (${reserved})`
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
