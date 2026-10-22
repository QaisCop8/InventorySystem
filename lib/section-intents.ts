"use client"

import { useEffect, useRef } from "react"

// فتح قسم مع "نية" (بيانات أولية) — مثل فتح تقرير بطاقة صنف لصنف معيّن أو فتح تعريف صنف من تقرير.
// OPEN_SECTION في app/page.tsx يحمل اسم القسم فقط؛ هنا تُحفظ البيانات حتى يلتقطها القسم المستهدف:
// عند تركيبه (أول فتح) أو فوراً إن كان مفتوحاً (حدث SECTION_INTENT).
const intents = new Map<string, unknown>()
const INTENT_EVENT = "SECTION_INTENT"

export function openSectionWith(section: string, data: unknown) {
  intents.set(section, data)
  window.dispatchEvent(new CustomEvent(INTENT_EVENT, { detail: { section } }))
  window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section } }))
}

/** يلتقط نية القسم مرة واحدة متى كان القسم جاهزاً (ready: مثلاً بعد تحميل قائمة الأصناف). */
export function useSectionIntent<T = any>(section: string, handler: (data: T) => void, ready = true) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const readyRef = useRef(ready)
  readyRef.current = ready

  const consume = () => {
    if (!readyRef.current || !intents.has(section)) return
    const data = intents.get(section) as T
    intents.delete(section)
    handlerRef.current(data)
  }

  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<{ section: string }>).detail?.section === section) window.setTimeout(consume, 0)
    }
    window.addEventListener(INTENT_EVENT, listener)
    return () => window.removeEventListener(INTENT_EVENT, listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // أول تركيب أو أصبح جاهزاً لاحقاً
  useEffect(() => { consume() }) // eslint-disable-line react-hooks/exhaustive-deps
}
