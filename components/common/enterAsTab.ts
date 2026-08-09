// "Enter يعمل كـTab" لنماذج الإدخال المباشرة (compact-product-form/unified-customers/unified-
// accounts-refactored) — بلا هذا فـEnter داخل أي Input عادي يُرسِل النموذج (submit ضمني افتراضي
// للمتصفح لأي input داخل form). يقتصر التدخّل على عناصر <input> العادية (شادسن) فقط؛ يُستثنى صراحةً:
// - شبكات Wijmo (DataGridView) ولوحات PrimeReact (Dropdown/MultiSelect/Autocomplete/Calendar) —
//   لكل منها منطق Enter خاص بها (تنقّل بين الخلايا/اختيار عنصر من قائمة)، اعتراضه يكسره.
// - أي نافذة منبثقة أخرى خارج جذر النموذج (بحث حساب/صنف...، تُركَّب عادة كـportal منفصل بـ
//   document.body) — تحقّق root.contains(target) يستبعدها تلقائياً بلا حاجة لحالة خاصة بها.
// - textarea/button/checkbox/radio — يُترَك لها سلوكها الافتراضي (سطر جديد/ضغط الزر/بلا أثر).

const FOCUSABLE_SELECTOR =
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled])'

const SKIP_ANCESTOR_SELECTOR =
  '.wj-flexgrid, .wj-control, .p-multiselect, .p-autocomplete, .p-calendar, [role="listbox"]'

function isVisible(el: HTMLElement): boolean {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

/**
 * يُركَّب على عنصر جذر النموذج (لا document بالكامل) لضمان بقاء التنقّل داخل هذا النموذج تحديداً.
 * enabledRef يتيح تعطيله مؤقتاً (نفس دور doHotKeys.current بمفاتيح F3/F4/F5 بهذه الملفات) عند فتح
 * نافذة منبثقة إضافية تحتاج مفاتيحها الخاصة بلا تعارض.
 */
export function attachEnterAsTab(root: HTMLElement, enabledRef: { current: boolean }) {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
    if (!enabledRef.current) return

    const target = e.target as HTMLElement
    if (!target || !root.contains(target)) return
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return
    if (target.closest(SKIP_ANCESTOR_SELECTOR)) return

    const focusable = getFocusable(root)
    const idx = focusable.indexOf(target)
    if (idx === -1) return

    e.preventDefault()
    e.stopPropagation()
    const next = focusable[idx + 1]
    next?.focus()
  }

  root.addEventListener("keydown", handler, true)
  return () => root.removeEventListener("keydown", handler, true)
}
