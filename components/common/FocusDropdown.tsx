"use client"

import { forwardRef, useRef } from "react"
import { Dropdown as PrimeDropdown, type DropdownProps, type DropdownChangeEvent } from "primereact/dropdown"

// غلاف شفاف حول Dropdown من PrimeReact — لا يُغيّر أي شكل/سلوك افتراضي (بلا قوالب عرض خاصة، بلا
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

  // Enter لا يفتح القائمة عندما تكون مغلقة (خلافاً لسلوك PrimeReact الافتراضي الذي يعامل Enter مثل
  // سهم الأسفل ويفتحها، انظر onEnterKey بـdropdown.esm.js) — يُلتقَط هنا بمرحلة capture قبل أن يصل
  // الحدث لمعالج PrimeReact الداخلي على حقل الإدخال نفسه. يُستدعى onKeyDownCapture الممرَّر من
  // المستدعي أولاً (مثل createDropdownKeyHandler بـunified-journal.tsx الذي يجعل Enter ينتقل للحقل
  // التالي بدل فتح اللوحة) — إن نفّذ preventDefault بنفسه (isDefaultPrevented) نتوقف هنا ولا نتدخّل.
  // خلاف ذلك، يُمنع كلياً فقط حين تكون القائمة مغلقة فعلاً (aria-expanded="false")؛ سهم الأسفل يبقى
  // يفتحها كما هو (onArrowDownKey لم يُمَس)، وEnter بعد فتحها واختيار عنصر يبقي على سلوكه الافتراضي
  // (تأكيد الاختيار وإغلاق القائمة) بلا أي تغيير إذ aria-expanded يصبح "true" حينها فلا يعترض هذا المعالج.
  const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDownCapture?.(e)
    if (e.key !== "Enter" || e.isDefaultPrevented()) return
    const trigger = wrapperRef.current?.querySelector("[aria-expanded]")
    const isOpen = trigger?.getAttribute("aria-expanded") === "true"
    if (!isOpen) {
      e.preventDefault()
      e.stopPropagation()
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
