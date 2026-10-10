"use client"

import { Control as WijmoControl } from "@grapecity/wijmo"

// تنقّل Enter = Tab داخل شاشات الحركات: عند الوصول لتبويب (زر role=tab) ينتقل المؤشر مباشرة لبداية
// محتوى التبويب النشط — أول حقل فيه، أو أول صف/أول عمود قابل للتحرير في الشبكة إن كانت الشبكة أولاً —
// بدل أن يعلق على زر التبويب نفسه (Enter على الزر لا يتقدّم). وعند الانتقال لشبكة Wijmo يُحدَّد أول صف.

const FIELD_SELECTOR = 'input:not([type="hidden"]):not([disabled]):not([readonly]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([readonly]):not([tabindex="-1"]), .wj-flexgrid'

const isVisible = (element: Element) => {
  if (!(element instanceof HTMLElement) || !element.getClientRects().length) return false
  const style = window.getComputedStyle(element)
  return style.visibility !== "hidden" && style.display !== "none"
}

/** يركّز شبكة Wijmo على أول صف وأول عمود ظاهر قابل للتحرير. */
export function focusGridStart(host: HTMLElement) {
  const grid = WijmoControl.getControl(host) as any
  if (!grid) {
    host.focus()
    return
  }
  try {
    const columns = grid.columns || []
    let column = -1
    for (let index = 0; index < columns.length; index++) {
      const candidate = columns[index]
      if (candidate.visible !== false && !candidate.isReadOnly) { column = index; break }
    }
    if (column < 0) column = 0
    if (grid.rows?.length) grid.select(0, column)
    grid.focus()
  } catch {
    host.focus()
  }
}

/** يركّز عنصراً من قائمة التنقّل: الشبكة على أول صف، والحقل مع تحديد نصه. */
export function focusNavigationTarget(element: HTMLElement) {
  if (element.classList.contains("wj-flexgrid")) {
    focusGridStart(element)
    return
  }
  element.focus()
  if (element instanceof HTMLInputElement && typeof element.select === "function" && !["checkbox", "radio", "date"].includes(element.type)) {
    try { element.select() } catch { /* بعض الأنواع لا تدعم التحديد */ }
  }
}

/** أول حقل (أو الشبكة) داخل محتوى التبويب المرتبط بزر التبويب، ثم يركّزه. يُرجع true إن نجح. */
export function focusTabPanelStart(trigger: HTMLElement) {
  const panelId = trigger.getAttribute("aria-controls")
  const panel = panelId ? document.getElementById(panelId) : null
  if (!panel) return false
  const target = Array.from(panel.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).find((element) => {
    if (!isVisible(element)) return false
    // محرر خلية داخل الشبكة ليس وجهة — الشبكة نفسها هي الوجهة
    const grid = element.closest(".wj-flexgrid")
    return !grid || grid === element
  })
  if (!target) return false
  focusNavigationTarget(target)
  return true
}
