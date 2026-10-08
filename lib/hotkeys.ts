"use client"

import { Control as WijmoControl } from "@grapecity/wijmo"

/**
 * اختصارات موحّدة لكل الحركات (كل شاشة تستخدم UniversalToolbar):
 *   F3 / Ctrl+S حفظ · F9 حذف · F4 نسخ · F5 جديد · Ctrl+P طباعة · F6 استعلام
 *   PageUp/PageDown السابق/التالي · Ctrl+PageUp/Ctrl+PageDown الأول/الأخير
 *   Enter = Tab داخل الشاشة.
 * المستمع يُثبَّت عند تحميل الوحدة (قبل أي مستمع تضيفه الشاشات في useEffect) فينفَّذ أولاً ويوقف
 * الحدث عن بقية المستمعين — لا ازدواج مع اختصارات قديمة في الشاشات.
 * أي نافذة منبثقة مفتوحة فوق الشاشة (بحث، تأكيد، قائمة منسدلة...) توقف اختصارات الشاشة كلياً، وتبقى
 * المفاتيح للنافذة نفسها (مثلاً F3 = تأكيد داخلها).
 */

export type HotkeyAction = "save" | "delete" | "clone" | "new" | "print" | "report" | "first" | "previous" | "next" | "last"

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  save: "F3", delete: "F9", clone: "F4", new: "F5", print: "Ctrl+P", report: "F6",
  first: "Ctrl+PageUp", previous: "PageUp", next: "PageDown", last: "Ctrl+PageDown",
}

type Entry = {
  element: () => HTMLElement | null
  isActive: () => boolean
  /** المعالج الحالي لكل إجراء (undefined = غير متاح الآن) */
  handler: (action: HotkeyAction) => (() => void) | undefined
}

const entries = new Set<Entry>()

export function registerHotkeyScope(entry: Entry) {
  entries.add(entry)
  return () => { entries.delete(entry) }
}

const POPUP_SELECTOR = [
  '[role="dialog"]', '[role="alertdialog"]', ".p-dialog-mask", ".p-dropdown-panel", ".p-autocomplete-panel",
  ".p-overlaypanel", ".p-multiselect-panel", ".p-datepicker:not(.p-datepicker-inline)", "[data-radix-popper-content-wrapper]",
  ".wj-dropdown-panel", '[role="menu"]', '[role="listbox"][data-state="open"]',
].join(",")

const isVisible = (element: Element) => {
  if (!(element instanceof HTMLElement)) return false
  if (!element.getClientRects().length) return false
  const style = window.getComputedStyle(element)
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0"
}

/** النوافذ المنبثقة الظاهرة عدا حاوية العنصر نفسه (نافذة الشاشة) وأسلافها — بما فيها ما يُعرض داخل الشاشة. */
export function popupsAbove(element: HTMLElement | null) {
  if (typeof document === "undefined") return []
  return Array.from(document.querySelectorAll(POPUP_SELECTOR)).filter((popup) => isVisible(popup) && !(element && popup.contains(element)))
}

/** هل توجد نافذة منبثقة فوق هذا العنصر؟ (للشاشات التي لها اختصارات خاصة إضافية) */
export const isPopupOpenOver = (element: HTMLElement | null) => popupsAbove(element).length > 0

/** حاوية الشاشة: النافذة التي تحتوي شريط الأدوات، أو لوحة مساحة العمل، أو أقرب قسم رئيسي. */
export function screenContainerOf(toolbar: HTMLElement) {
  return (toolbar.closest('[role="dialog"]') || toolbar.closest("[data-workspace-pane]") || toolbar.closest("main") || document.body) as HTMLElement
}

/** شريط الأدوات المستهدف: ظاهر، في التبويب النشط، ولا تعلوه نافذة منبثقة. */
function activeEntry(): { entry: Entry; toolbar: HTMLElement } | null {
  const candidates: Array<{ entry: Entry; toolbar: HTMLElement }> = []
  for (const entry of entries) {
    const toolbar = entry.element()
    if (!toolbar || !entry.isActive() || !isVisible(toolbar)) continue
    candidates.push({ entry, toolbar })
  }
  if (!candidates.length) return null
  // الأعمق (داخل نافذة مفتوحة فوق شاشة أخرى) أولاً
  candidates.sort((a, b) => (a.toolbar.compareDocumentPosition(b.toolbar) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1))
  for (const candidate of candidates) {
    if (!isPopupOpenOver(screenContainerOf(candidate.toolbar))) return candidate
  }
  return null
}

/** للاختصارات الخاصة بشاشة (F2 بحث العميل...): false إن كانت نافذة منبثقة تغطي الشاشة الحالية. */
export const screenHotkeysAllowed = () => activeEntry() !== null

function actionFor(event: KeyboardEvent): HotkeyAction | null {
  const key = event.key
  if (event.altKey || event.metaKey) return null
  if (event.ctrlKey) {
    if (key === "s" || key === "S" || key === "س") return "save"
    if (key === "p" || key === "P" || key === "ح") return "print"
    if (key === "PageUp") return "first"
    if (key === "PageDown") return "last"
    return null
  }
  if (event.shiftKey) return null
  switch (key) {
    case "F3": return "save"
    case "F9": return "delete"
    case "F4": return "clone"
    case "F5": return "new"
    case "F6": return "report"
    case "PageUp": return "previous"
    case "PageDown": return "next"
    default: return null
  }
}

/** ينهي تحرير خلايا Wijmo ويُفقد التركيز قبل الحفظ — نفس أثر النقر على زر الحفظ بالفأرة. */
function commitPendingEdits(container: HTMLElement) {
  container.querySelectorAll(".wj-flexgrid").forEach((element) => {
    try {
      const grid = WijmoControl.getControl(element) as any
      if (grid && grid.activeEditor && element.isConnected) grid.finishEditing()
    } catch { /* grid disposed */ }
  })
  const active = document.activeElement as HTMLElement | null
  if (active && container.contains(active) && typeof active.blur === "function") active.blur()
}

function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing) return
  const action = actionFor(event)
  if (!action) return
  // التنقل بـPageUp/PageDown داخل الشبكة يبقى للشبكة (تمرير الصفحات)
  if ((action === "previous" || action === "next") && (event.target as HTMLElement | null)?.closest?.(".wj-flexgrid")) return
  const target = activeEntry()
  if (!target) {
    // نافذة منبثقة مفتوحة: لا اختصارات للشاشة، لكن يُمنع سلوك المتصفح (طباعة/تحديث الصفحة)
    if (action === "print" || action === "new") event.preventDefault()
    return
  }
  const run = target.entry.handler(action)
  event.preventDefault()
  event.stopImmediatePropagation()
  // تكرار المفتاح عند الضغط المستمر لا يكرر الحفظ/الحذف/النسخ/الجديد (التنقل فقط يتكرر)
  if (!run || (event.repeat && !["previous", "next"].includes(action))) return
  if (action === "save" || action === "print" || action === "delete") commitPendingEdits(screenContainerOf(target.toolbar))
  // بعد إنهاء التحرير يُترك إطار واحد لتُطبَّق قيم الخلايا على الحالة قبل الحفظ
  window.setTimeout(run, 0)
}

const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]):not([readonly]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([readonly]):not([tabindex="-1"]), .wj-flexgrid[tabindex]:not([tabindex="-1"])'

/** Enter = Tab: يعمل فقط إن لم يعالج أي مكوّن آخر Enter بنفسه (defaultPrevented). */
function onEnter(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
  const field = event.target as HTMLElement | null
  if (!field || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return
  if (field instanceof HTMLInputElement && ["button", "submit", "reset", "file", "image"].includes(field.type)) return
  if (field.closest(".wj-flexgrid") || field.getAttribute("aria-expanded") === "true") return
  const target = activeEntry()
  if (!target) return
  const container = screenContainerOf(target.toolbar)
  if (!container.contains(field)) return
  const fields = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => isVisible(element) && !element.closest(".wj-flexgrid .wj-cell"))
  const index = fields.indexOf(field)
  if (index < 0) return
  const next = fields[index + 1]
  if (!next) return
  event.preventDefault()
  next.focus()
  if (next instanceof HTMLInputElement && typeof next.select === "function" && !["checkbox", "radio", "date"].includes(next.type)) {
    try { next.select() } catch { /* some input types do not support select */ }
  }
}

if (typeof window !== "undefined" && !(window as any).__unifiedHotkeysInstalled) {
  ;(window as any).__unifiedHotkeysInstalled = true
  window.addEventListener("keydown", onKeyDown, true)
  window.addEventListener("keydown", onEnter, false)
}
