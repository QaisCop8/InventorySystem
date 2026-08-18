"use client"

import { forwardRef, useRef } from "react"
import { Dropdown as PrimeDropdown, type DropdownProps, type DropdownChangeEvent } from "primereact/dropdown"

// غلاف شفاف حول Dropdown من PrimeReact — لا يُغيّر أي شكل/سلوك افتراضي (بلا نماذج عرض خاصة، بلا
// div إضافي)، يُضيف فقط: إعادة التركيز لحقل القائمة المنسدلة بعد اختيار عنصر (بالنقر بالماوس تحديداً
// — التنقل بلوحة المفاتيح يُبقي التركيز أصلاً، لكن اختيار عنصر بالنقر يفقد التركيز فيغلق القائمة دون
// أن يتمكن المستخدم من متابعة التنقل/الكتابة فوراً). يُستبدَل به `import { Dropdown as PrimeDropdown }
// from "primereact/dropdown"` في كل الملفات التي تستخدم هذا الاسم المستعار، دون أي تغيير آخر بالكود.
const FocusDropdown = forwardRef<PrimeDropdown, DropdownProps>((props, ref) => {
  const focusInputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const { onKeyDownCapture, ...restProps } = props

  const handleChange = (e: DropdownChangeEvent) => {
    props.onChange?.(e)
    setTimeout(() => focusInputRef.current?.focus(), 0)
  }

  const focusNextField = () => {
    const root = wrapperRef.current?.closest<HTMLElement>('[data-enter-tab-root="true"]') ?? wrapperRef.current?.closest<HTMLElement>("form")
    if (!root) return

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
    ).filter((el) => el.offsetParent !== null && el.tabIndex !== -1 && !el.closest(".wj-flexgrid"))

    const current = document.activeElement as HTMLElement | null
    const currentIndex = current ? focusable.indexOf(current) : -1
    if (currentIndex === -1) return
    focusable[currentIndex + 1]?.focus()
  }

  // Enter لا يفتح القائمة عندما تكون مغلقة (خلافاً لسلوك PrimeReact الافتراضي الذي يعامل Enter مثل
  // سهم الأسفل ويفتحها) — بدلاً من إيقاف الحدث بالكامل، ننتقل إلى الحقل التالي داخل النموذج، مع
  // الحفاظ على سلوك القائمة المفتوحة عند اختيار عنصر أو الضغط على الأسهم. يُستدعى onKeyDownCapture
  // الممرَّر من المستدعي أولاً (مثل createDropdownKeyHandler)؛ إذا استهلك الحدث نفسه فلا نُدخل هنا.
  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDownCapture?.(e)
    if (e.key !== "Enter" || e.isDefaultPrevented()) return
    const trigger = wrapperRef.current?.querySelector("[aria-expanded]")
    const isOpen = trigger?.getAttribute("aria-expanded") === "true"
    if (!isOpen) {
      e.preventDefault()
      e.stopPropagation()
      focusNextField()
    }
  }

  return (
    <div ref={wrapperRef} onKeyDownCapture={handleKeyDownCapture} style={{ display: "contents" }}>
      <PrimeDropdown {...restProps} ref={ref} focusInputRef={focusInputRef} onChange={handleChange} />
    </div>
  )
})
FocusDropdown.displayName = "FocusDropdown"

export default FocusDropdown
