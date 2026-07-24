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

  const handleChange = (e: DropdownChangeEvent) => {
    props.onChange?.(e)
    setTimeout(() => focusInputRef.current?.focus(), 0)
  }

  return <PrimeDropdown {...props} ref={ref} focusInputRef={focusInputRef} onChange={handleChange} />
})
FocusDropdown.displayName = "FocusDropdown"

export default FocusDropdown
