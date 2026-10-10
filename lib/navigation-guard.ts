"use client"

import { useEffect, useRef } from "react"
import { useWorkspaceTabId } from "@/contexts/workspace-tab-context"

// ─────────────────────────────────────────────────────────────────────────────────────────────
// حارس المغادرة مع تغييرات غير محفوظة — نفس سلوك كاشير نقطة البيع لكل الشاشات:
//   • تبديل الشاشة من القائمة/البحث (بلا تبويبات تُستبدل الشاشة الحالية) وإغلاق تبويب ورجوع/تقدّم
//     المتصفح ⇐ تُعرض نافذة "التحقق من التغييرات" الخاصة بالشاشة نفسها (حفظ/عدم حفظ/إلغاء)، والتنقل
//     يكتمل فقط بعد قرارها.
//   • تحديث الصفحة/إغلاق المتصفح/كتابة رابط ⇐ تحذير المتصفح القياسي (beforeunload — لا يسمح المتصفح
//     بنافذة مخصّصة هنا).
// كل شاشة تسجّل حارسها مع رقم تبويبها بمساحة العمل، فيُسأل فقط حارس التبويب الذي سيُستبدل/يُغلق.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Guard = {
  id: number
  tabId: string | null
  isDirty: () => boolean
  /** يعرض نافذة الشاشة نفسها، ويستدعي continueNavigation بعد الحفظ أو عدم الحفظ (لا يستدعيها عند الإلغاء). */
  request: (continueNavigation: () => void) => void
}

const guards: Guard[] = []
let nextId = 1
let beforeUnloadInstalled = false

function installBeforeUnload() {
  if (beforeUnloadInstalled || typeof window === "undefined") return
  beforeUnloadInstalled = true
  window.addEventListener("beforeunload", (event) => {
    if (!guards.some((guard) => safeDirty(guard))) return
    event.preventDefault()
    event.returnValue = ""
  })
}

const safeDirty = (guard: Guard) => {
  try {
    return guard.isDirty()
  } catch {
    return false
  }
}

export function registerNavigationGuard(guard: Omit<Guard, "id">) {
  installBeforeUnload()
  const entry = { ...guard, id: nextId++ }
  guards.push(entry)
  return () => {
    const index = guards.indexOf(entry)
    if (index >= 0) guards.splice(index, 1)
  }
}

/**
 * قبل تنقّل يُتلف شاشة/شاشات (tabIds: تبويباتها؛ undefined = كل الشاشات): إن وُجدت شاشة بتغييرات غير
 * محفوظة تُعرض نافذتها ويُعاد false (التنقل يكتمل لاحقاً عبر continueNavigation)، وإلا true.
 */
export function requestGuardedNavigation(continueNavigation: () => void, tabIds?: Array<string | null>, decided: Set<number> = new Set()) {
  const candidates = guards
    .filter((guard) => !decided.has(guard.id) && (!tabIds || tabIds.includes(guard.tabId)))
    .reverse()
  const dirty = candidates.find((guard) => safeDirty(guard))
  if (!dirty) return true
  // بعد قرار الشاشة (حفظ أو "لا") لا تُسأل مجدداً: "لا" لا تُفرغ النموذج (الشاشة ستُستبدل أصلاً)، فإعادة
  // فحصها كانت تُبقيها "متغيّرة" فيتوقف التنقل أو تعود النافذة. تُفحص فقط شاشات أخرى بنفس النطاق.
  dirty.request(() => {
    const next = new Set(decided).add(dirty.id)
    if (requestGuardedNavigation(continueNavigation, tabIds, next)) continueNavigation()
  })
  return false
}

export const hasUnsavedScreens = (tabIds?: Array<string | null>) =>
  guards.some((guard) => (!tabIds || tabIds.includes(guard.tabId)) && safeDirty(guard))

/**
 * تسجيل حارس الشاشة. isDirty وrequest تُقرآن لحظة التنقل (آخر نسخة)، فلا داعي لتثبيتهما بـuseCallback.
 * request عادةً هي guardedAction الموجودة بالشاشة (تعرض نافذة التحقق ثم تنفّذ الإجراء).
 */
export function useNavigationGuard(isDirty: () => boolean, request: (continueNavigation: () => void) => void) {
  const tabId = useWorkspaceTabId()
  const dirtyRef = useRef(isDirty)
  const requestRef = useRef(request)
  dirtyRef.current = isDirty
  requestRef.current = request
  useEffect(
    () =>
      registerNavigationGuard({
        tabId,
        isDirty: () => dirtyRef.current(),
        request: (continueNavigation) => requestRef.current(continueNavigation),
      }),
    [tabId],
  )
}
