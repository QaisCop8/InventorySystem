"use client"

import { forwardRef, useRef } from "react"
import { Dropdown as PrimeDropdown, type DropdownProps, type DropdownChangeEvent } from "primereact/dropdown"

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])[data-enter-tab-stop], [tabindex]:not([tabindex="-1"])'

// غلاف شفاف حول Dropdown من PrimeReact — لا يُغيّر أي شكل/سلوك افتراضي (بلا نماذج عرض خاصة، بلا
// div إضافي)، يُضيف فقط:
// 1) إعادة التركيز لحقل القائمة المنسدلة بعد اختيار عنصر بالنقر (النقر يُفقِد التركيز).
// 2) Enter كـTab: القائمة مغلقة ← ينتقل للحقل التالي مباشرة. القائمة مفتوحة ← يختار العنصر المحدد
//    (سلوك PrimeReact) ثم ينتقل للحقل التالي.
// يُستبدَل به `import { Dropdown as PrimeDropdown } from "primereact/dropdown"` في كل الملفات التي
// تستخدم هذا الاسم المستعار، دون أي تغيير آخر بالكود.
const FocusDropdown = forwardRef<PrimeDropdown, DropdownProps>((props, ref) => {
  const focusInputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const advanceAfterSelectRef = useRef(false)
  const { onKeyDownCapture, ...restProps } = props

  // الحقل التالي ضمن نفس النموذج/النافذة — بترتيب DOM، متجاوزاً الحقول المخفية والمعطلة وخلايا الشبكات.
  const focusNextField = () => {
    const anchor = focusInputRef.current ?? wrapperRef.current
    if (!anchor) return
    const root = anchor.closest<HTMLElement>('[data-enter-tab-root="true"]')
      ?? anchor.closest<HTMLElement>("form")
      ?? anchor.closest<HTMLElement>('[role="dialog"]')
      ?? document.body
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
      (el === anchor || el.offsetParent !== null) && el.tabIndex !== -1 && !el.closest(".wj-flexgrid") && !el.closest(".p-dropdown-panel"),
    )
    const currentIndex = focusable.indexOf(anchor)
    if (currentIndex === -1) return
    const next = focusable[currentIndex + 1]
    if (!next) return
    next.focus()
    if (next instanceof HTMLInputElement && typeof next.select === "function" && next.type !== "date") next.select()
  }

  const handleChange = (e: DropdownChangeEvent) => {
    props.onChange?.(e)
    if (advanceAfterSelectRef.current) {
      advanceAfterSelectRef.current = false
      setTimeout(focusNextField, 0)
      return
    }
    setTimeout(() => focusInputRef.current?.focus(), 0)
  }

  // يُستدعى onKeyDownCapture الممرَّر من المستدعي أولاً (مثل createDropdownKeyHandler)؛ إذا استهلك
  // الحدث نفسه (preventDefault) فلا نتدخّل.
  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDownCapture?.(e)
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.isDefaultPrevented()) return
    const trigger = wrapperRef.current?.querySelector("[aria-expanded]")
    const isOpen = trigger?.getAttribute("aria-expanded") === "true"
    if (!isOpen) {
      e.preventDefault()
      e.stopPropagation()
      focusNextField()
      return
    }
    // مفتوحة: يترك PrimeReact يختار العنصر المحدد ويغلق القائمة، ثم ينتقل للحقل التالي. إن لم يتغير
    // شيء (اختيار نفس القيمة/لا عنصر محدد) فلا يصل onChange — ننتقل بعد إغلاق القائمة على أي حال.
    advanceAfterSelectRef.current = true
    setTimeout(() => {
      if (!advanceAfterSelectRef.current) return
      advanceAfterSelectRef.current = false
      focusNextField()
    }, 60)
  }

  return (
    <div ref={wrapperRef} onKeyDownCapture={handleKeyDownCapture} style={{ display: "contents" }}>
      <PrimeDropdown {...restProps} ref={ref} focusInputRef={focusInputRef} onChange={handleChange} />
    </div>
  )
})
FocusDropdown.displayName = "FocusDropdown"

export default FocusDropdown
