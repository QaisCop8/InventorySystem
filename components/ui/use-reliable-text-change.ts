import * as React from "react"

type TextElement = HTMLInputElement | HTMLTextAreaElement

/**
 * onChange موثوق لحقول النص: نص يدخل عبر طرق الإدخال (IME/تركيب الحروف، اقتراحات لوحة مفاتيح Windows
 * أو Android، التصحيح التلقائي...) — شائع مع الكتابة بالعربية — قد يظهر في الحقل دون أن يُطلق React
 * حدث onChange، فتبقى الحالة فارغة (مثلاً زر الحفظ يبقى معطّلاً رغم كتابة الملاحظة).
 * يُكمِل هنا من حدثي input وcompositionend الأصليين أي قيمة لم تصل، مع منع الاستدعاء المكرر لنفس القيمة.
 */
export function useReliableTextChange<E extends TextElement>(
  value: unknown,
  onChange: React.ChangeEventHandler<E> | undefined,
  onInput: React.FormEventHandler<E> | undefined,
  onCompositionEnd: React.CompositionEventHandler<E> | undefined,
  enabled = true,
) {
  // آخر قيمة سُلِّمت للمستدعي — تُزامَن مع القيمة المتحكَّم بها في كل عرض
  const lastValueRef = React.useRef<string | null>(null)
  if (value !== undefined && value !== null) lastValueRef.current = String(value)
  else if (value === null) lastValueRef.current = ""

  const deliver = (event: React.SyntheticEvent<E>) => {
    const current = event.currentTarget.value
    if (current === lastValueRef.current) return
    lastValueRef.current = current
    onChange?.(event as unknown as React.ChangeEvent<E>)
  }

  if (!enabled || !onChange) return { onChange, onInput, onCompositionEnd }
  return {
    onChange: (event: React.ChangeEvent<E>) => deliver(event),
    onInput: (event: React.FormEvent<E>) => { onInput?.(event); deliver(event) },
    onCompositionEnd: (event: React.CompositionEvent<E>) => { onCompositionEnd?.(event); deliver(event) },
  }
}
